/**
 * Graceful shutdown animation for Launchpad pads.
 *
 * Creates a warm "power-down" ripple effect:
 * yellowBright → yellow → amber → dimRed → off.
 *
 * The effect sweeps across pads in sequence, showing a short color trail.
 * Multiple passes can be used for a richer visual.
 * Timing can be set explicitly (stepMs) or derived from a total duration.
 *
 * Performance notes:
 * - Low CPU usage with small, predictable delays.
 * - Avoids unnecessarily tight timers to reduce wakeups.
 */

import {COLORS} from './led-colors.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the shutdown ripple animation.
 *
 * @param {{ setPad: (pad: number, color: [number, number]) => void }} lp
 *        Launchpad port object with a setPad method.
 * @param {number[]} pads
 *        Pad IDs to animate (usually mapped pads).
 * @param {{
 *   stepMs?: number,          // Delay between steps in ms (overrides totalDurationMs).
 *   totalDurationMs?: number, // Target total duration for all passes.
 *   trail?: number,           // Number of trailing colors (head is brightest).
 *   passes?: number,          // Number of sweeps across pads.
 *   finalHoldMs?: number      // Pause after animation completes.
 * }} [opts]
 */
export async function playShutdownAnimation(
    lp,
    pads = [],
    {
        stepMs,
        totalDurationMs = 1200,
        trail = 4,
        passes = 2,
        finalHoldMs = 80,
    } = {}
) {
    if (!lp || !Array.isArray(pads) || pads.length === 0) return;

    // Ensure a stable order for sweeping
    const order = pads.slice().sort((a, b) => a - b);

    // Color trail from brightest to dimmest
    const TRAIL = [
        COLORS.yellowBright,
        COLORS.yellow,
        COLORS.amber,
        COLORS.dimRed,
    ];

    const effectiveTrail = Math.max(1, Math.min(trail, TRAIL.length));

    // Calculate step delay if not provided
    if (stepMs == null || !(stepMs > 0)) {
        const stepsPerPass = order.length + effectiveTrail;
        const totalSteps = Math.max(1, stepsPerPass * Math.max(1, passes));
        stepMs = Math.max(10, Math.round(totalDurationMs / totalSteps));
    }

    // Execute the ripple passes
    for (let p = 0; p < passes; p++) {
        for (let i = 0; i < order.length + effectiveTrail; i++) {
            // Head color
            const head = order[i];
            if (head != null) lp.setPad(head, TRAIL[0]);

            // Trail colors
            for (let t = 1; t < effectiveTrail; t++) {
                const idx = i - t;
                const pad = order[idx];
                if (pad != null) lp.setPad(pad, TRAIL[t] || COLORS.off);
            }

            // Turn off the pad after the trail
            const offIdx = i - effectiveTrail;
            if (offIdx >= 0) {
                const offPad = order[offIdx];
                if (offPad != null) lp.setPad(offPad, COLORS.off);
            }

            await sleep(stepMs);
        }

        // Brief pause between passes
        if (p < passes - 1) await sleep(Math.max(0, Math.floor(stepMs / 2)));
    }

    // Ensure all pads are off at the end
    for (const id of order) lp.setPad(id, COLORS.off);
    if (finalHoldMs > 0) await sleep(finalHoldMs);
}
