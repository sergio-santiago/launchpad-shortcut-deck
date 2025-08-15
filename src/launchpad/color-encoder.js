/**
 * Encode a Launchpad S [r, g] tuple (each 0..3) into a single MIDI velocity byte.
 *
 * Launchpad S LED encoding notes:
 * - Both red and green intensities are 2-bit values (0..3).
 * - The device expects them packed into a single velocity:
 *     velocity = BASE_OFFSET + (green << 4) + red
 * - Special case: [0,0] must map to velocity 0 for a true LED OFF.
 *   Without this, some hardware will display faint amber instead of off.
 *
 * Performance considerations:
 * - Hot path: called for every LED update, possibly many per frame.
 * - Uses bitwise ops and minimal branching to avoid allocations and keep
 *   CPU usage low.
 */

const BASE_OFFSET = 12;

/**
 * Encode [r, g] into Launchpad S MIDI velocity.
 *
 * @param {[number, number]} color - Red and green intensities (0..3 each).
 * @returns {number} MIDI velocity (0..127). 0 means OFF.
 */
export function encodeColor([r, g]) {
    // Fast special case: exact OFF → velocity 0
    if ((r | 0) === 0 && (g | 0) === 0) return 0;

    // Clamp values to valid 0..3 range
    let rr = r | 0;
    if (rr < 0) rr = 0;
    else if (rr > 3) rr = 3;

    let gg = g | 0;
    if (gg < 0) gg = 0;
    else if (gg > 3) gg = 3;

    // Launchpad S encoding: base offset + (green in high nibble) + red in low nibble
    return BASE_OFFSET + (gg << 4) + rr;
}
