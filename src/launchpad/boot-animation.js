/**
 * Startup animation for Launchpad.
 *
 * Displays two wave-effect phases across the pad grid:
 *   1) Yellow: dim ↔ bright (loading phase)
 *   2) Green: dim ↔ bright (ready phase)
 *
 * The animation ends with a short green flash, then turns all pads off.
 * Uses a single timer (~22 Hz) and per-tick deduplication to reduce CPU load.
 */

import {COLORS} from './led-colors.js';

/**
 * Returns the list of pad IDs to animate.
 * - mode 'all': pads 0..127 (all notes)
 * - mode 'mapped': only keys from appMappings
 *
 * @param {Record<number, any>} appMappings
 * @param {'all'|'mapped'} [mode='all']
 * @returns {number[]}
 */
function resolvePadIds(appMappings, mode = 'all') {
    if (mode === 'mapped') {
        return Object.keys(appMappings || {})
            .map(k => +k)
            .filter(Number.isFinite);
    }
    const pads = new Array(128);
    for (let i = 0; i < 128; i++) pads[i] = i;
    return pads;
}

/**
 * Executes one color phase with a wave effect.
 *
 * @param {{ setPad: (note: number, color: [number, number]) => void }} lp
 *        Launchpad port.
 * @param {number[]} pads
 *        Pad IDs to animate.
 * @param {[number, number]} dimCol
 *        Dim color tuple [r, g].
 * @param {[number, number]} brightCol
 *        Bright color tuple [r, g].
 * @param {number} durationMs
 *        Duration of the phase in milliseconds.
 * @param {number} periodMs
 *        Time for one dim↔bright cycle in milliseconds.
 * @param {number} staggerMs
 *        Additional delay per pad group to create the wave effect.
 */
async function runPhase(lp, pads, dimCol, brightCol, durationMs, periodMs, staggerMs) {
    const start = performance.now ? performance.now() : Date.now();
    const now = () => (performance.now ? performance.now() : Date.now());
    const last = new Map(); // padId -> lastColorRef (for deduplication)

    const groupOf = (id) => id & 7; // pad group index (0..7)

    return new Promise((resolve) => {
        let timer = null;
        const tickInterval = 45; // ~22 Hz

        const tick = () => {
            const t = now() - start;
            if (t >= durationMs) {
                clearTimeout(timer);
                return resolve();
            }

            for (const id of pads) {
                const phase = ((t + groupOf(id) * staggerMs) % periodMs) / periodMs;
                const onBright = phase < 0.5;
                const chosen = onBright ? brightCol : dimCol;

                if (last.get(id) !== chosen) {
                    last.set(id, chosen);
                    try {
                        lp.setPad(id, chosen);
                    } catch {
                    }
                }
            }

            timer = setTimeout(tick, tickInterval);
        };

        tick();
    });
}

/**
 * Plays the full boot animation sequence.
 *
 * @param {{ setPad: (note: number, color: [number, number]) => void }} lp
 *        Launchpad port.
 * @param {Record<number, any>} appMappings
 *        Mapped pads for the device.
 * @param {{
 *   useAllPads?: boolean,
 *   totalDurationMs?: number
 * }} [opts]
 *        Animation options.
 */
export async function playBootAnimation(lp, appMappings, opts = {}) {
    const {
        useAllPads = true,
        totalDurationMs = 1300,
    } = opts;

    const pads = resolvePadIds(appMappings, useAllPads ? 'all' : 'mapped');
    if (!pads.length) return;

    const phaseA = Math.max(300, (totalDurationMs * 0.45) | 0); // yellow
    const phaseB = Math.max(300, (totalDurationMs * 0.45) | 0); // green
    const closeT = Math.max(100, totalDurationMs - phaseA - phaseB);

    const periodMs = 300;
    const staggerMs = 45;

    try {
        await runPhase(lp, pads, COLORS.yellow, COLORS.yellowBright, phaseA, periodMs, staggerMs);
        await runPhase(lp, pads, COLORS.dimGreen, COLORS.green, phaseB, periodMs, staggerMs);

        for (const id of pads) {
            try {
                lp.setPad(id, COLORS.green);
            } catch {
            }
        }
        await new Promise(r => setTimeout(r, Math.min(120, closeT)));
    } catch {
        // Continue even if animation fails
    } finally {
        for (const id of pads) {
            try {
                lp.setPad(id, COLORS.off);
            } catch {
            }
        }
    }
}
