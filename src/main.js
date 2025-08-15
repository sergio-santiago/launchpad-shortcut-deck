/**
 * Application entry point for the Launchpad Shortcut Deck.
 *
 * Responsibilities
 * - Initialize the MIDI adapter and start a clean LED baseline.
 * - Preflight Hammerspoon so the Lua bridge is callable.
 * - Play a short boot animation (non‑blocking to app startup).
 * - Wire controller (gestures → actions) and periodic LED state sync.
 * - Provide a robust, idempotent shutdown path (signals & keypress).
 *
 * Design goals
 * - Very low action latency (press → action).
 * - Low CPU (bulk polling; no overlapping sync ticks).
 * - Safe visuals (avoid stomping ongoing animations).
 * - Clean resource teardown (LEDs cleared before closing MIDI).
 */

import readline from 'node:readline';
import {getDefaultLaunchpadPorts, LaunchpadJulusian} from './launchpad/adapters/launchpad-julusian.js';
import {createAppController, setPokeSync} from './app/controller.js';
import {startStateSync} from './app/state-sync.js';
import {APP_MAPPINGS} from './config/app-mappings.js';
import {ensureReady} from './integrations/hammerspoon/index.js';
import {logger} from './utils/logger.js';
import {playBootAnimation} from './launchpad/boot-animation.js';
import {playShutdownAnimation} from './launchpad/shutdown-animations.js';
import {TIMINGS} from './config/timings.js'; // ← use centralized timings

async function main() {
    logger.info('[BOOT] starting');

    // 1) Preflight Hammerspoon in parallel with MIDI setup.
    //    This saves time because Hammerspoon can finish loading while we open ports.
    const preflight = ensureReady();

    // 2) Open Launchpad ports and hard‑clear LEDs for a deterministic baseline.
    const {inIdx, outIdx} = getDefaultLaunchpadPorts();
    logger.info('[MIDI] opening ports', {inIdx, outIdx});

    const lp = new LaunchpadJulusian({inIdx, outIdx});
    if (lp.open) await lp.open();
    if (lp.init) await lp.init();
    await lp.clearAll();
    logger.debug('[MIDI] ports ready & LEDs cleared');

    // 3) Wait until the Hammerspoon Lua API is callable.
    await preflight;
    logger.info('[HS] preflight OK');

    // 4) Startup animation — use the tuned values from TIMINGS.animations.boot.
    try {
        await playBootAnimation(lp, APP_MAPPINGS, {...TIMINGS.animations.boot});
    } catch (e) {
        logger.warn('[BOOT] startup animation skipped', {err: String(e)});
    }

    // 5) Controller and periodic LED sync.
    const ctl = createAppController({lpPort: lp, appMappings: APP_MAPPINGS});
    const appService = ctl.app;

    // Bulk state sync cadence from TIMINGS.
    const intervalMs = TIMINGS.sync.intervalMsDefault;
    const syncCtl = startStateSync({appService, lpPort: lp, appMappings: APP_MAPPINGS, intervalMs});

    if (syncCtl?.poke) setPokeSync(syncCtl.poke);
    logger.info('[SYNC] started', {intervalMs});

    // Initial nudge so mapped pads settle immediately.
    if (syncCtl?.poke) {
        let count = 0;
        for (const k of Object.keys(APP_MAPPINGS)) {
            const id = Number(k);
            if (Number.isFinite(id)) {
                syncCtl.poke(id);
                count++;
            }
        }
        logger.debug('[SYNC] initial pokes', {pads: count});
    }

    // ────────────────────────── Controlled shutdown ──────────────────────────
    let quitting = false;

    const restoreTTY = () => {
        try {
            if (process.stdin.isTTY) process.stdin.setRawMode(false);
        } catch {
        }
    };

    async function shutdown(reason = 'signal') {
        if (quitting) return;
        quitting = true;
        logger.warn('[SHUTDOWN] begin', {reason});

        try {
            syncCtl?.stop?.();
        } catch {
        }

        // “Goodbye” sweep using TIMINGS.animations.shutdown.
        try {
            const mappedPads = Object.keys(APP_MAPPINGS).map(Number).filter(Number.isFinite);
            await playShutdownAnimation(lp, mappedPads, {...TIMINGS.animations.shutdown});
        } catch {
        }

        // Clear LEDs BEFORE closing MIDI ports; await so messages are flushed.
        try {
            await lp?.clearAll?.();
        } catch {
        }
        try {
            lp?.close?.();
        } catch {
        }
        restoreTTY();

        logger.info('[SHUTDOWN] done → exit 0');
        process.exit(0);
    }

    // ESC to quit; also catch Ctrl+C in raw keypress mode.
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.on('keypress', (_str, key) => {
            if (key?.name === 'escape') shutdown('ESC');
            else if (key?.ctrl && key?.name === 'c') shutdown('SIGINT-keypress');
        });
    }

    // OS signals → graceful shutdown.
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGHUP', () => shutdown('SIGHUP'));

    // Fail‑safe: close cleanly on unexpected errors.
    process.once('unhandledRejection', (e) => {
        logger.error('[ERR] unhandledRejection', e);
        shutdown('unhandledRejection');
    });
    process.once('uncaughtException', (e) => {
        logger.error('[ERR] uncaughtException', e);
        shutdown('uncaughtException');
    });

    logger.info('[BOOT] ready');
}

main().catch((e) => {
    logger.error('[FATAL] boot failed', e);
    process.exit(1);
});
