import {LedState, LedStateColors} from './states.js';

/**
 * Resolve a logical LED state to its Launchpad [r, g] tuple.
 *
 * Design:
 * - LED states are symbolic keys (see LedState in states.js) that map to color
 *   tuples in LedStateColors.
 * - Tuples follow the [red, green] convention with intensities 0..3.
 * - This function enforces a safe fallback to the UNASSIGNED color if the
 *   state is not recognized or the mapping is invalid.
 *
 * Performance:
 * - Hot path during LED updates; minimal branching to keep latency low.
 * - No allocations except when falling back (which reuses an existing tuple).
 *
 * @param {keyof typeof LedState | string} state
 *        Logical LED state key, usually from LedState constants.
 * @returns {[number, number]} Launchpad color tuple (frozen).
 */
export function stateToColor(state) {
    const c = LedStateColors[state];
    // Guard: ensure we return a valid tuple; else use UNASSIGNED fallback
    return (Array.isArray(c) && c.length === 2)
        ? c
        : LedStateColors[LedState.UNASSIGNED];
}
