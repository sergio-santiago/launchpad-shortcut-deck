// Centralized timing constants for gestures, controller masking, sync cadence,
// and boot/shutdown animations. Keeping them in one place makes tuning safe
// and consistent across the app.

export const TIMINGS = Object.freeze({
    // Gesture thresholds used by GestureDecoder
    gesture: Object.freeze({
        doubleTapMs: 480,
        longPressMs: 800,
        bounceMs: 28,
        cooldownMs: 0,
    }),

    // Controller-level masks and tiny waits to keep visuals crisp
    controller: Object.freeze({
        minimizeBusy: 800,          // cover minimize animation
        focusBusy: 600,
        launchBusy: 1300,           // allow the first window to appear
        errorBusy: 900,
        pokeMs: 90,                 // quick post-action recheck
        postLaunchFocusDelay: 120,  // tiny pause before focusing after launch
        quitBlinkMs: 600,           // red blink duration on long-press
        quitBusy: 1100,
    }),

    // State sync cadence
    sync: Object.freeze({
        intervalMsDefault: 140,     // good balance CPU/latency
    }),

    // Animation presets used by main during boot/shutdown
    animations: Object.freeze({
        boot: Object.freeze({
            useAllPads: true,
            totalDurationMs: 2000,    // target 2s boot animation
            stepMs: 22,               // ~45 FPS feel
        }),
        shutdown: Object.freeze({
            totalDurationMs: 1000,    // ~1s visible
            passes: 3,
            trail: 4,                 // bright→dim tail length
            // stepMs: 18,            // optional override if desired
            finalHoldMs: 120,
        }),
    }),
});
