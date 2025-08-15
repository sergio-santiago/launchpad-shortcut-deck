/**
 * Abstract Launchpad port interface.
 *
 * This class defines the minimal contract that any Launchpad/MIDI adapter
 * must implement so the rest of the app (gesture decoder, state sync, etc.)
 * can remain device-agnostic and low latency.
 *
 * Design notes
 * - Implementations should favor *very low* end-to-end latency (button press
 *   to handler invocation, LED set to hardware) and keep CPU usage low.
 * - Methods must be idempotent and safe to call repeatedly.
 * - Callers are performance‑sensitive: avoid allocations in hot paths.
 *
 * Pad addressing
 * - `padId` is an integer identifier understood by the concrete adapter.
 *   Typical mappings:
 *     • Note pads: 0..127 (sent as NOTE ON/OFF on a given MIDI channel)
 *     • Control pads: >=200 (adapter may treat 200+n as CC n)
 *   The exact mapping is an implementation detail of the adapter, but it must
 *   be stable across the process lifetime.
 *
 * Color encoding
 * - Colors are passed as `[r, g]` intensity tuples, each in the range 0..3.
 *   The adapter is responsible for converting that into the device‑specific
 *   value (e.g., MIDI velocity for Launchpad S).
 *
 * Error handling
 * - Throw from abstract methods by default, so misuse is clear in dev.
 * - Concrete implementations SHOULD be resilient and avoid propagating
 *   transient I/O errors to callers (best‑effort logging instead).
 */
export class LaunchpadPort {
    /**
     * Subscribe to pad events.
     *
     * The implementation must invoke:
     *   - `onDown(padId)` when a pad is pressed (debounced at device level)
     *   - `onUp(padId)` when the same pad is released
     *
     * Requirements:
     * - Idempotent: repeated calls replace previous handlers.
     * - The returned function (if provided) should unregister the handlers.
     * - Handlers must be called on the same tick they are received from the
     *   device (or as soon as possible) to keep latency minimal.
     *
     * @param {(padId: number) => void} onDown - Called on press.
     * @param {(padId: number) => void} onUp   - Called on release.
     * @returns {() => void} Optional unsubscribe function.
     */
    onPadEvents(onDown, onUp) {
        throw new Error('LaunchpadPort.onPadEvents is abstract and must be implemented');
    }

    /**
     * Set the LED color of a pad.
     *
     * The adapter should cache and deduplicate writes when possible (e.g.,
     * skip sending if the last encoded value for that pad is identical) to
     * reduce USB/MIDI traffic and CPU load.
     *
     * @param {number} padId - Implementation-defined pad identifier.
     * @param {[number, number]} color - `[r, g]` intensities in the range 0..3.
     */
    setPad(padId, color) {
        throw new Error('LaunchpadPort.setPad is abstract and must be implemented');
    }

    /**
     * Close the port and release resources.
     *
     * Expectations:
     * - Safe to call multiple times (idempotent).
     * - Should detach listeners and close I/O handles promptly.
     * - If applicable, consider clearing LEDs before closing at the adapter
     *   layer (higher levels may also do their own shutdown visuals).
     */
    close() {
    } // optional for implementations
}
