/**
 * Maps human-friendly application names to their corresponding
 * macOS bundle identifiers for more reliable control.
 *
 * Using bundle IDs avoids ambiguity when multiple apps share similar names
 * and ensures Hammerspoon can target the exact application.
 *
 * Format:
 *   "<App Name>": "bundle:<bundle.identifier>"
 *
 * If an app is not listed here, the plain name will be used as a fallback.
 */
export const APP_RESOLVE = {
    'Visual Studio Code': 'bundle:com.microsoft.VSCode',
    'Music': 'bundle:com.apple.Music',
    'Google Chrome': 'bundle:com.google.Chrome',
    'Safari': 'bundle:com.apple.Safari', // Add more mappings as needed.
};

/**
 * Resolves an application name into the correct Hammerspoon target string.
 *
 * @param {string} name - The human-friendly application name.
 * @returns {string} - The mapped bundle identifier string if found, otherwise the original name.
 */
export function resolveTarget(name) {
    return APP_RESOLVE[name] ?? name;
}
