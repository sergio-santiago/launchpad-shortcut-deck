// Periodic LED state synchronization loop for Launchpad pads.
// Runs in bulk to minimize CPU usage and latency while avoiding overlapping ticks.
// Designed for continuous updates to reflect application states accurately.

import {isBusy} from '../utils/busy-registry.js';
import {LedState, LedStateColors} from '../launchpad/states.js';
import {stateToColor} from '../launchpad/led-state-machine.js';
import {logger} from '../utils/logger.js';

/**
 * Ensures the target string is prefixed with "bundle:".
 * @param {string} bundleId - Application bundle identifier.
 * @returns {string} - Normalized bundle target string.
 */
const asBundleTarget = (bundleId) =>
    (typeof bundleId === 'string' && bundleId.startsWith('bundle:')) ? bundleId : `bundle:${bundleId}`;

/**
 * Starts the periodic LED synchronization process.
 * @param {Object} params
 * @param {Object} params.appService - Service providing application state data.
 * @param {Object} params.lpPort - Launchpad port object ({ setPad } method required).
 * @param {Object} params.appMappings - Mapping of pad IDs to application configurations.
 * @param {number} [params.intervalMs=140] - Interval between sync ticks in milliseconds.
 * @returns {{ stop: () => void, poke: (padId?: number) => void }}
 */
export function startStateSync({
                                   appService,
                                   lpPort,
                                   appMappings,
                                   intervalMs = 140,
                               }) {
    let timer = null;
    let inFlight = false;
    let stopped = false;

    const lastColorByPad = new Map();
    const forcedPads = new Set();

    // Group pads by target for batch queries
    const groups = new Map();
    const padToTarget = new Map();
    for (const [padStr, cfg] of Object.entries(appMappings || {})) {
        if (!cfg?.bundleId) continue;
        const padId = Number(padStr);
        if (!Number.isFinite(padId)) continue;
        const tgt = asBundleTarget(cfg.bundleId);
        padToTarget.set(padId, tgt);
        const arr = groups.get(tgt);
        if (arr) arr.push(padId);
        else groups.set(tgt, [padId]);
    }

    const ERROR_COLOR = LedStateColors[LedState.ERROR];

    const sameColor = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
    const setIfChanged = (padId, color) => {
        const prev = lastColorByPad.get(padId);
        if (!sameColor(prev, color)) {
            lastColorByPad.set(padId, color);
            lpPort.setPad(padId, color);
        }
    };

    /**
     * Decides the LED state based on application window info.
     * @param {Object} info - Application state info.
     * @returns {number} - Corresponding LedState enum value.
     */
    function decideState(info) {
        const running = !!info?.running;
        const wc = Number.isFinite(info?.windowCount) ? info.windowCount : 0;
        const minC = Number.isFinite(info?.minimizedCount) ? info.minimizedCount : undefined;
        const visC = Number.isFinite(info?.visibleCount) ? info.visibleCount : undefined;

        const allMin = (typeof info?.allMinimized === 'boolean')
            ? info.allMinimized
            : (wc > 0 && minC !== undefined && minC === wc);

        const hasVisible = (typeof info?.hasVisibleWindows === 'boolean')
            ? info.hasVisibleWindows
            : (visC !== undefined ? (visC > 0) : (wc > 0 && !allMin));

        if (!running) return LedState.ASSIGNED_STOPPED;
        if (allMin) return LedState.MINIMIZED;
        if (hasVisible || wc > 0) {
            return info?.focused ? LedState.RUNNING_FOCUSED : LedState.RUNNING_BACKGROUND;
        }
        return LedState.ASSIGNED_STOPPED;
    }

    function scheduleNext(ms = intervalMs) {
        if (stopped) return;
        clearTimeout(timer);
        timer = setTimeout(tick, ms);
    }

    async function tick() {
        if (stopped) return;
        if (inFlight) {
            scheduleNext();
            return;
        }
        inFlight = true;

        try {
            if (groups.size === 0) {
                scheduleNext();
                return;
            }

            const activeGroups = new Map();
            let activePadCount = 0;
            for (const [tgt, pads] of groups) {
                const freePads = pads.filter(p => forcedPads.has(p) || !isBusy(p));
                if (freePads.length) {
                    activeGroups.set(tgt, freePads);
                    activePadCount += freePads.length;
                }
            }
            forcedPads.clear();

            if (activeGroups.size === 0) {
                scheduleNext();
                return;
            }

            const activeTargets = Array.from(activeGroups.keys());
            const infos = await appService.getStatesBulk(activeTargets);
            const byTarget = new Map();
            for (const it of (infos || [])) byTarget.set(it.target, it);

            for (const [tgt, pads] of activeGroups) {
                const info = byTarget.get(tgt) || {running: false};
                const st = decideState(info);
                const color = stateToColor(st);
                for (const padId of pads) setIfChanged(padId, color);
            }

            logger.debug('[SYNC] tick ok', {targets: activeTargets.length, pads: activePadCount});
        } catch (e) {
            if (!stopped) {
                logger.warn('[SYNC] tick failed, painting error on free pads', {err: String(e)});
                for (const [padId] of padToTarget) {
                    if (!isBusy(padId)) setIfChanged(padId, ERROR_COLOR);
                }
            }
        } finally {
            inFlight = false;
            scheduleNext();
        }
    }

    /**
     * Forces a pad to be checked immediately on the next tick.
     * @param {number} [padId] - Pad ID to prioritize.
     */
    function poke(padId) {
        if (stopped) return;
        if (typeof padId === 'number') forcedPads.add(padId);
        if (!inFlight) {
            clearTimeout(timer);
            timer = setTimeout(tick, 25);
        }
    }

    logger.info('[SYNC] start', {intervalMs});
    tick();

    return {
        /** Stops the synchronization loop. */
        stop: () => {
            stopped = true;
            clearTimeout(timer);
            logger.info('[SYNC] stop');
        },
        /** Triggers a quick re-check for a specific pad. */
        poke,
    };
}
