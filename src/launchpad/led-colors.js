/**
 * Centralized LED palette for Launchpad S using 2‑channel tuples: [r, g].
 *
 * Model notes
 * - Each channel is a 2‑bit intensity (0..3).
 * - The actual device encoding is handled elsewhere (see color-encoder.js).
 *
 * Guidelines
 * - Keep this file as the single source of truth for “semantic” colors.
 * - Use frozen tuples to prevent accidental mutation in hot paths.
 * - Prefer descriptive names that map to UX meaning (e.g., “amber” for minimized).
 */

const C = (r, g) => Object.freeze([r, g]);

export const COLORS = Object.freeze({
    // Base
    off: C(0, 0),

    // Reds (errors / destructive / quitting)
    red: C(3, 0),
    dimRed: C(1, 0),

    // Greens (success / active)
    green: C(0, 3), // focused / success (intense)
    dimGreen: C(0, 1), // background / idle (soft)

    // Yellows / amber (transitions and minimized)
    amber: C(3, 3), // minimized (stable)
    yellow: C(2, 3), // mid-yellow, general purpose
    yellowBright: C(3, 2), // action-in-progress (e.g., minimizing), clearly brighter than amber
});
