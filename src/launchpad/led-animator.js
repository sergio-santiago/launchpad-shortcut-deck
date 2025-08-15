/**
 * Per-note LED animations for Launchpad devices.
 *
 * All animations are non-blocking and optimized for:
 * - Low latency (minimal delay from request to LED update)
 * - Low CPU usage (reduced wakeups, minimal allocations)
 *
 * Implementation details:
 * - Uses recursive setTimeout instead of setInterval to reduce drift
 * - Keeps animation state per note to allow independent animations
 * - Provides helpers to start, stop, and cancel animations
 */

const running = new Map(); // noteId -> { cancel: () => void }

// High-resolution clock binding (avoids branching on each call)
const NOW = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now.bind(performance)
    : Date.now;

// Shared "off" tuple to avoid allocations during animation frames
const OFF = [0, 0];

/**
 * Blink animation for signaling a quit or error condition.
 *
 * Typical usage: called during a long-press to visually indicate
 * an impending quit action.
 *
 * @param {{ setPad: (note: number, color: [number, number]) => void }} lp - Launchpad port
 * @param {number} note - Pad to animate
 * @param {[number, number]} color - Color tuple [r,g] (0..3) for the "on" state
 * @param {number} durationMs - Total animation duration in milliseconds
 * @param {number} hz - Blink frequency in cycles per second
 * @returns {Promise<void>} Resolves when the animation completes or is canceled
 */
export function blinkQuit(lp, note, color = [3, 0], durationMs = 300, hz = 8) {
    return new Promise((resolve) => {
        stopAnimation(note); // cancel any ongoing animation on this pad

        // Clamp parameters to reasonable ranges
        const dur = Math.max(80, durationMs | 0);
        const freq = Math.max(1, Math.min(20, hz | 0));
        const halfPeriod = Math.max(20, (1000 / (freq * 2)) | 0);

        const start = NOW();
        let on = true;
        let canceled = false;
        let timer = null;

        const cancel = () => {
            if (canceled) return;
            canceled = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            try {
                lp?.setPad?.(note, OFF);
            } catch {
            }
            running.delete(note);
            resolve();
        };

        running.set(note, {cancel});

        const tick = () => {
            if (canceled) return;
            const elapsed = NOW() - start;
            if (elapsed >= dur) return cancel();

            try {
                lp?.setPad?.(note, on ? color : OFF);
            } catch {
            }
            on = !on;
            timer = setTimeout(tick, halfPeriod);
        };

        tick();
    });
}

/**
 * Boot pulse animation to signal the app is ready.
 *
 * Flashes the given pads a set number of times, alternating between
 * the specified color and off.
 *
 * @param {{ setPad: (note: number, color: [number, number]) => void }} lp - Launchpad port
 * @param {number[]} padIds - IDs of pads to pulse
 * @param {[number, number]} color - Color tuple for the "on" state
 * @param {number} flashes - Number of on/off cycles
 * @param {number} onMs - On duration per cycle (ms)
 * @param {number} offMs - Off duration per cycle (ms)
 */
export async function bootPulse(lp, padIds, color = [0, 1], flashes = 2, onMs = 60, offMs = 45) {
    const ids = Array.isArray(padIds) ? padIds : [];
    for (let i = 0; i < flashes; i++) {
        // ON phase
        for (const id of ids) {
            try {
                lp.setPad(id, color);
            } catch {
            }
        }
        await new Promise(r => setTimeout(r, onMs));

        // OFF phase
        for (const id of ids) {
            try {
                lp.setPad(id, OFF);
            } catch {
            }
        }
        await new Promise(r => setTimeout(r, offMs));
    }
}

/**
 * Stops the animation for a specific pad if one is running.
 *
 * @param {number} note - Pad ID
 */
export function stopAnimation(note) {
    const ref = running.get(note);
    if (ref && typeof ref.cancel === 'function') ref.cancel();
    running.delete(note);
}

/**
 * Stops all currently running animations.
 */
export function stopAllAnimations() {
    for (const note of Array.from(running.keys())) stopAnimation(note);
}
