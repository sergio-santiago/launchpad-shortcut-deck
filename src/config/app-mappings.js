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
    0: {appName: 'Finder', bundleId: 'com.apple.finder'},
    2: {appName: 'Google Chrome', bundleId: 'com.google.Chrome'},
    4: {appName: 'YouTube Music', bundleId: 'com.google.Chrome.app.cinhimbnkkaeohfgghhklpknlkffjgod'},
    6: {appName: 'Google Calendar', bundleId: 'com.google.Chrome.app.kjbdgfilnfhdoflbpgamdcdgpehopbep'},
    17: {appName: 'Visual Studio Code', bundleId: 'com.microsoft.VSCode'},
    19: {appName: 'WebStorm', bundleId: 'com.jetbrains.WebStorm'},
    21: {appName: 'PhpStorm', bundleId: 'com.jetbrains.PhpStorm'},
    23: {appName: 'iTerm', bundleId: 'com.googlecode.iterm2'},
    32: {appName: 'Postman', bundleId: 'com.postmanlabs.mac'},
    34: {appName: 'Notion', bundleId: 'notion.id'},
    36: {appName: 'Discord', bundleId: 'com.hnc.Discord'},
    38: {appName: 'Spark', bundleId: 'com.readdle.SparkDesktop'},
    49: {appName: 'WhatsApp', bundleId: 'net.whatsapp.WhatsApp'},
    51: {appName: '1Password', bundleId: 'com.1password.1password'},
    53: {appName: 'Google Meet', bundleId: 'com.google.Chrome.app.kjgfgldnnfoeklkmfkjfagphfepbbdan'},
    55: {appName: 'Google Keep', bundleId: 'com.google.Chrome.app.eilembjdkfgodjkcjnpgpaenohkicgjd'},
    64: {appName: 'Ableton Live', bundleId: 'com.ableton.live'},
    66: {appName: 'ChatGPT', bundleId: 'com.openai.chat'},

    // To add more pads:
    // padNumber: { appName: 'Display name', bundleId: 'bundle:com.example.App' }
});
