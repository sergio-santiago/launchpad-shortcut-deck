/**
 * Thin wrapper around the Hammerspoon Lua API (lsd_* functions).
 *
 * - Communicates with Hammerspoon via AppleScript (`osascript`) by asking it
 *   to execute Lua code snippets.
 * - Exposes a small `actions` object where each method returns the raw Lua
 *   result as a trimmed string ("ok" or "err").
 * - Uses `resolveTarget()` so callers can pass human-friendly names today
 *   and bundle-based targets in the future without changing the public API.
 */

import {execFile} from 'node:child_process';
import {ensureReady} from './preflight.js';
import {resolveTarget} from './resolve.js';

/**
 * Executes a Lua snippet inside Hammerspoon using AppleScript.
 *
 * The snippet is embedded in a one-liner AppleScript command:
 *
 * ```applescript
 * tell application "Hammerspoon" to execute lua code "<lua>"
 * ```
 *
 * - Escapes double quotes in the Lua snippet to avoid breaking the AppleScript string.
 * - Resolves with whatever Hammerspoon prints to stdout, trimmed.
 *
 * @param {string} lua - Lua code to be executed in Hammerspoon.
 * @returns {Promise<string>} - Raw stdout from Hammerspoon (trimmed).
 * @throws {Error} If `osascript` returns a non-zero exit code.
 */
function callOSA(lua) {
    const osa = `tell application "Hammerspoon" to execute lua code "${lua.replace(/"/g, '\\"')}"`
    return new Promise((resolve, reject) => {
        execFile('osascript', ['-e', osa], (err, stdout, stderr) => {
            if (err) {
                // Prefer stderr if present; otherwise use stdout or the error message.
                const msg = (stderr?.toString() || stdout?.toString() || err.message || 'Unknown error').trim();
                return reject(new Error(msg));
            }
            resolve((stdout || '').toString().trim());
        });
    });
}

// Re-export so callers can run a preflight check before using `actions`.
export {ensureReady};

/**
 * Public Hammerspoon actions.
 *
 * Each function takes an application identifier (e.g., `"Safari"`, `"Visual Studio Code"`),
 * which `resolveTarget()` maps to either a plain name or a bundle-based target:
 *
 * - `"Safari"` → `"Safari"`
 * - `"Visual Studio Code"` → `"bundle:com.microsoft.VSCode"` (per current resolver)
 *
 * @type {{[k in 'open'|'close'|'minimize'|'maximize'|'fullscreen'|'focus']: (app: string, ...args: any[]) => Promise<string>}}
 */
export const actions = {
    open: (app) => callOSA(`lsd_open([[${resolveTarget(app)}]])`),
    close: (app) => callOSA(`lsd_close([[${resolveTarget(app)}]])`),
    minimize: (app) => callOSA(`lsd_minimize([[${resolveTarget(app)}]])`),
    maximize: (app) => callOSA(`lsd_maximize([[${resolveTarget(app)}]])`),
    fullscreen: (app, on = true) => callOSA(`lsd_fullscreen([[${resolveTarget(app)}]], ${on ? 'true' : 'false'})`),
    focus: (app) => callOSA(`lsd_focus([[${resolveTarget(app)}]])`),
};
