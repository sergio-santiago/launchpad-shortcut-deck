/**
 * Decode Launchpad pad gestures with minimal latency and CPU cost.
 *
 * Gestures:
 * - Single press → quick press/release (emitted on release)
 * - Double tap → two valid presses within `doubleTapMs`
 * - Long press → hold for at least `longPressMs` (suppresses single/double)
 *
 * Design goals:
 * - O(1) per event with small Maps and no per-event allocations.
 * - Emit on release for clear separation between tap vs. long-press.
 * - Bounce filter and optional cooldown to reduce accidental multi-taps.
 */

const DEFAULTS = {
    /** Max gap (ms) between two releases to count as a double-tap. */
    doubleTapMs: 500,
    /** Hold duration (ms) to trigger long-press. */
    longPressMs: 800,
    /** Ignore ultra-short taps below this (ms). */
    bounceMs: 30,
    /** Optional gap (ms) after an emit to avoid accidental triples. */
    cooldownMs: 0,
};

// Reallocated metaobjects (avoid per-event object creation)
const META_SINGLE = Object.freeze({double: false});
const META_DOUBLE = Object.freeze({double: true});

export class GestureDecoder {
    /**
     * @param {(padId: number, meta: { double: boolean }) => void} onPress
     *        Called on a recognized press (single or double).
     * @param {(padId: number) => void} onLongPress
     *        Called when a long-press is detected (suppresses onPress).
     * @param {{doubleTapMs?: number, longPressMs?: number, bounceMs?: number, cooldownMs?: number}} [opts]
     *        Timing tunables. See DEFAULTS.
     */
    constructor(onPress, onLongPress, opts = {}) {
        this.onPress = onPress;
        this.onLongPress = onLongPress;

        // Normalize options once into primitive fields (fast lookups)
        const o = {...DEFAULTS, ...opts};
        this._doubleTapMs = o.doubleTapMs | 0;
        this._longPressMs = o.longPressMs | 0;
        this._bounceMs = o.bounceMs | 0;
        this._cooldownMs = o.cooldownMs | 0;

        // Bind a monotonic, high-resolution clock once
        this._now =
            (typeof performance !== 'undefined' && typeof performance.now === 'function')
                ? performance.now.bind(performance)
                : Date.now;

        // Per-pad state
        this._lastUpByPad = new Map(); // last "release" timestamp
        this._lastEmitByPad = new Map(); // last onPress emit timestamp (cooldown)
        this._downAt = new Map(); // timestamp when pad went down
        this._longTimers = new Map(); // active long-press timers
    }

    /**
     * Notify that a pad went down (pressed).
     * Sets/refreshes the long-press timer.
     * @param {number} padId
     */
    onDown(padId) {
        const now = this._now();
        this._downAt.set(padId, now);

        // Replace any existing timer (duplicate down)
        const prev = this._longTimers.get(padId);
        if (prev) clearTimeout(prev);

        // Schedule long‑press; cleared on valid onUp
        const t = setTimeout(() => {
            this._longTimers.delete(padId);
            // If the timer survives until here, treat as long‑press (no single/double)
            if (this.onLongPress) this.onLongPress(padId);
        }, this._longPressMs);

        this._longTimers.set(padId, t);
    }

    /**
     * Notify that a pad went up (released).
     * Decides single vs. double tap, respecting bounce/cooldown and long-press.
     * @param {number} padId
     */
    onUp(padId) {
        const now = this._now();
        const downTs = this._downAt.get(padId);
        this._downAt.delete(padId);

        // Missing down or too short => bounce
        if (downTs == null || (now - downTs) < this._bounceMs) return;

        // If long‑press already fired, the timer is gone => suppress press
        const t = this._longTimers.get(padId);
        if (!t) return;

        // Cancel pending long‑press; treat as a press
        clearTimeout(t);
        this._longTimers.delete(padId);

        // Optional cooldown to avoid accidental triple‑tap chains
        if (this._cooldownMs > 0) {
            const lastEmit = this._lastEmitByPad.get(padId) || 0;
            if ((now - lastEmit) < this._cooldownMs) return;
        }

        // Double‑tap detection relative to the previous "up"
        const lastUp = this._lastUpByPad.get(padId) || 0;
        const isDouble = !!(lastUp && (now - lastUp) <= this._doubleTapMs);

        // Record timings
        this._lastUpByPad.set(padId, now);
        this._lastEmitByPad.set(padId, now);

        // Emit without allocating a new metaobject
        if (this.onPress) this.onPress(padId, isDouble ? META_DOUBLE : META_SINGLE);
    }

    /**
     * Cancel any pending state for a specific pad (e.g., on device reset).
     * Keeps the lastUp timestamp to preserve the double ‑ tap feel across brief glitches.
     * @param {number} padId
     */
    cancelPad(padId) {
        const t = this._longTimers.get(padId);
        if (t) clearTimeout(t);
        this._longTimers.delete(padId);
        this._downAt.delete(padId);
    }

    /**
     * Reset the entire internal state (e.g., when re‑initializing the device).
     */
    reset() {
        for (const [, t] of this._longTimers) clearTimeout(t);
        this._longTimers.clear();
        this._lastUpByPad.clear();
        this._lastEmitByPad.clear();
        this._downAt.clear();
    }
}
