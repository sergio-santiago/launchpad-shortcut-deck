// Mapping: padId (Launchpad MIDI note) → target application.
// Always use explicit bundle IDs (prefixed with "bundle:") for reliable targeting.
// This table is static at runtime, so lookups are O(1) with zero runtime overhead.
//
// How to find a macOS application's bundle ID:
// 1. Open Terminal.
// 2. Run: mdls -name kMDItemCFBundleIdentifier -r "/Applications/AppName.app"
//    Example: mdls -name kMDItemCFBundleIdentifier -r "/Applications/Safari.app"
// 3. The command will output the bundle ID, e.g.: com.apple.Safari
// 4. Prefix it with "bundle:" before adding it to this mapping.
//
// Note: `appName` is used only for logging and display purposes.

export const APP_MAPPINGS = Object.freeze({
    112: {appName: 'Safari', bundleId: 'bundle:com.apple.Safari'},
    113: {appName: 'Visual Studio Code', bundleId: 'bundle:com.microsoft.VSCode'},
    114: {appName: 'iTerm', bundleId: 'bundle:com.googlecode.iterm2'},

    // To add more pads:
    // padNumber: { appName: 'Display name', bundleId: 'bundle:com.example.App' }
});
