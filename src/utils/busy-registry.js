/**
 * Tracks temporarily “busy” pads to block LED updates during animations or actions.
 *
 * Why:
 * - Prevents state sync from overwriting in-progress animations (e.g., launch blink).
 * - Busy state is time-bound; expires automatically.
 *
 * Implementation details:
 * - Uses a monotonic clock (`performance.now` if available) to avoid issues
 *   from wall-clock adjustments (NTP, manual changes).
 * - Stores expiry timestamps in a Map keyed by padId.
 * - Reads are O(1) and automatically clean up expired entries.
 */

const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? () => performance.now() : () => Date.now();

const busyPads = new Map(); // padId -> untilTimestamp (ms, monotonic)

/**
 * Mark a pad as busy for a given duration.
 * Later calls overwrite the current busy window.
 *
 * @param {number} padId
 * @param {number} ms - Duration in milliseconds (minimum 1).
 */
export function markBusy(padId, ms) {
    if (typeof padId === 'number' && ms > 0) {
        busyPads.set(padId, now() + Math.max(1, ms | 0));
    }
}

/**
 * Check if a pad is still marked as busy.
 * Automatically clears expired entries.
 *
 * @param {number} padId
 * @returns {boolean}
 */
export function isBusy(padId) {
    const until = busyPads.get(padId);
    if (until == null) return false;
    if (now() > until) {
        busyPads.delete(padId);
        return false;
    }
    return true;
}

/**
 * Get milliseconds remaining for the busy window.
 * Cleans up if expired.
 *
 * @param {number} padId
 * @returns {number} Remaining ms, or 0 if not busy.
 */
export function busyRemaining(padId) {
    const until = busyPads.get(padId);
    if (until == null) return 0;
    const rem = until - now();
    if (rem <= 0) {
        busyPads.delete(padId);
        return 0;
    }
    return rem | 0;
}

/**
 * Clear all busy flags (e.g., on shutdown or full reset).
 */
export function clearBusy() {
    busyPads.clear();
}
