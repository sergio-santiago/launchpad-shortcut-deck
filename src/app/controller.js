/**
 * AppController — maps Launchpad gestures to Hammerspoon actions with
 * very low latency and predictable visuals.
 *
 * Responsibilities
 * - Interpret pad gestures (single press, double‑tap, long‑press).
 * - Drive optimistic LED feedback immediately on user input.
 * - Call the Hammerspoon integration to launch/focus/minimize/close apps.
 * - Mask LEDs as “busy” for the duration of app animations to avoid flicker.
 * - Optionally “poke” the state‑sync loop after actions to settle LEDs fast.
 *
 * Gesture mapping
 * - Single press → focus app; if not available, launch then focus.
 * - Double‑tap → minimize all windows of the app.
 * - Long‑press → close all windows (keep process running).
 *
 * Design notes
 * - LED feedback is optimistic: we paint the intent first, then reconcile via
 *   the periodic state sync loop. This keeps the interface feeling instant.
 * - Busy masking prevents the sync loop from repainting a pad while a known
 *   action animation is in flight (e.g., minimize).
 */

import {GestureDecoder} from '../launchpad/gesture-decoder.js';
import {LedState, LedStateColors} from '../launchpad/states.js';
import {blinkQuit} from '../launchpad/led-animator.js';
import {logger} from '../utils/logger.js';
import {markBusy} from '../utils/busy-registry.js';
import {getIntegration} from '../integrations/hammerspoon/index.js';

/** Optional fast re‑sync hook injected by state-sync. */
let _pokeSync = null;

/** Register a function that forces an early state-sync for a pad. */
export function setPokeSync(fn) {
    _pokeSync = fn;
}

/** Normalize the target for Hammerspoon (`bundle:…`). */
const asBundleTarget = (bundleId) =>
    (typeof bundleId === 'string' && bundleId.startsWith('bundle:')) ? bundleId : `bundle:${bundleId}`;

/** Tiny sleep helper. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Action timing (ms).
 * Values balance snappy feedback with typical macOS window animation durations.
 */
const DUR = Object.freeze({
    minimizeBusy: 800,   // mask while windows slide to Dock
    focusBusy: 600,      // mask brief focus/raise animations
    launchBusy: 1300,    // give time for the first window after launch
    errorBusy: 900,      // keep the error color visible for a moment
    pokeMs: 90,          // fast state recheck after action
    postLaunchFocusDelay: 120, // small pause before focusing post‑launch
    quitBlinkMs: 600,    // red blink length for long‑press
    quitBusy: 1100,      // mask while close‑all resolves
});

/**
 * Controller that binds a Launchpad port to application actions.
 */
export class AppController {
    /**
     * @param {{
     *   appService: {
     *     launch: (target:string) => Promise<string>,
     *     focus: (target:string) => Promise<string>,
     *     minimizeAll: (target:string) => Promise<string>,
     *     closeAll: (target:string) => Promise<string>
     *   },
     *   lpPort: {
     *     setPad: (id:number, color:[number,number]) => void,
     *     onPadEvents: (onDown:(id:number)=>void, onUp:(id:number)=>void) => (()=>void)|void
     *   },
     *   appMappings: Record<number, { appName: string, bundleId: string }>
     * }} deps
     */
    constructor({appService, lpPort, appMappings}) {
        this.app = appService; // { launch, focus, minimizeAll, closeAll }
        this.lp = lpPort;
        this.map = appMappings;

        // Short gesture thresholds for a responsive feel.
        this.decoder = new GestureDecoder(
            (padId, meta) => this.onPress(padId, meta),
            (padId) => this.onLongPress(padId),
            {doubleTapMs: 480, longPressMs: 800, bounceMs: 28, cooldownMs: 0},
        );

        // Wire device events → gesture decoder.
        this.lp.onPadEvents(
            (padId) => this.decoder.onDown(padId),
            (padId) => this.decoder.onUp(padId),
        );

        logger.info('[CTL] controller ready');
    }

    /** Lookup mapping for a pad. */
    targetFor(padId) {
        return this.map[padId];
    }

    /**
     * Single press or double‑tap handler.
     * - Double‑tap → minimize all windows.
     * - Single press → focus; if not “ok,” launch then focus.
     */
    async onPress(padId, {double}) {
        const target = this.targetFor(padId);
        if (!target) {
            this.lp.setPad(padId, LedStateColors[LedState.UNASSIGNED]);
            logger.debug('[CTL] press on unassigned pad', {padId});
            return;
        }

        const hsTarget = asBundleTarget(target.bundleId);
        const label = target.appName || hsTarget;

        try {
            if (double) {
                // Double‑tap → minimize all.
                this.lp.setPad(padId, LedStateColors[LedState.MINIMIZING]); // optimistic
                markBusy(padId, DUR.minimizeBusy);
                logger.info('[CTL] minimize-all', {padId, target: label});

                const r = await this.app.minimizeAll(hsTarget);
                if (r !== 'ok') throw new Error(`minimizeAll failed: ${r}`);

                if (_pokeSync) setTimeout(() => _pokeSync(padId), DUR.pokeMs);
                return;
            }

            // Single press → focus; if not “ok,” launch then focus.
            this.lp.setPad(padId, LedStateColors[LedState.FOCUSING]); // optimistic
            markBusy(padId, DUR.focusBusy);
            logger.info('[CTL] focus', {padId, target: label});

            let r = await this.app.focus(hsTarget);
            if (r !== 'ok') {
                // Not running or focus failed → launch path.
                this.lp.setPad(padId, LedStateColors[LedState.LAUNCHING]); // optimistic
                markBusy(padId, DUR.launchBusy);
                logger.info('[CTL] launch', {padId, target: label});

                const rLaunch = await this.app.launch(hsTarget);
                if (rLaunch !== 'ok') throw new Error(`launch failed: ${rLaunch}`);

                await sleep(DUR.postLaunchFocusDelay);
                r = await this.app.focus(hsTarget);
                if (r !== 'ok') {
                    logger.warn('[CTL] focus after launch returned non-ok', {padId, target: label, r});
                }
            }

            if (_pokeSync) setTimeout(() => _pokeSync(padId), DUR.pokeMs);
        } catch (e) {
            logger.error('[CTL] press failed', {padId, target: label, err: String(e)});
            this.lp.setPad(padId, LedStateColors[LedState.ERROR]);
            markBusy(padId, DUR.errorBusy);
        }
    }

    /**
     * Long‑press handler → closes all windows (keep the process running).
     * Shows a short red blink first, then updates LED to “stopped.”
     */
    async onLongPress(padId) {
        const target = this.targetFor(padId);
        if (!target) return;

        const hsTarget = asBundleTarget(target.bundleId);
        const label = target.appName || hsTarget;

        try {
            // Pre‑close visual cue.
            markBusy(padId, DUR.quitBusy);
            logger.info('[CTL] close-all (long-press)', {padId, target: label});
            await blinkQuit(this.lp, padId, LedStateColors[LedState.QUITTING], DUR.quitBlinkMs);

            const r = await this.app.closeAll(hsTarget);
            if (r !== 'ok') throw new Error(`closeAll failed: ${r}`);

            // Assigned but currently stopped/hidden.
            this.lp.setPad(padId, LedStateColors[LedState.ASSIGNED_STOPPED]);
            if (_pokeSync) setTimeout(() => _pokeSync(padId), DUR.pokeMs + 30);
        } catch (e) {
            logger.error('[CTL] long-press failed', {padId, target: label, err: String(e)});
            this.lp.setPad(padId, LedStateColors[LedState.ERROR]);
            markBusy(padId, DUR.errorBusy);
        }
    }
}

/**
 * Factory to create a controller with the default Hammerspoon integration.
 *
 * @param {{ lpPort:any, appMappings: Record<number,{appName:string,bundleId:string}> }} args
 * @returns {AppController}
 */
export function createAppController({lpPort, appMappings}) {
    const appService = getIntegration();
    return new AppController({appService, lpPort, appMappings});
}
