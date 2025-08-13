/**
 * Preflight checks for the Hammerspoon integration.
 *
 * Ensures that the custom Lua API functions (lsd_*) are loaded and callable
 * before the rest of the app runs. This is done by asking Hammerspoon (via
 * AppleScript) to execute small Lua snippets that verify each function exists.
 */

import {execFile} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';

/**
 * Executes a short Lua snippet inside Hammerspoon via AppleScript.
 * Escapes double quotes to safely embed the chunk in the AppleScript one-liner.
 *
 * @param {string} luaChunk - The Lua code to run inside Hammerspoon.
 * @param {number} [timeoutMs=6000] - Max time to wait for osascript to return.
 * @returns {Promise<string>} - Raw stdout from Hammerspoon (trimmed).
 */
function runOSA(luaChunk, timeoutMs = 6000) {
    const osa = `tell application "Hammerspoon" to execute lua code "${luaChunk.replace(/"/g, '\\"')}"`
    return new Promise((resolve, reject) => {
        execFile('osascript', ['-e', osa], {timeout: timeoutMs}, (err, stdout, stderr) => {
            if (err) {
                return reject(new Error((stderr?.toString() || stdout?.toString() || err.message).trim()));
            }
            resolve((stdout || '').toString().trim());
        });
    });
}

/**
 * Checks whether a given global Lua symbol is a function in the Hammerspoon runtime.
 *
 * @param {string} name - Global symbol name (e.g., "lsd_open").
 * @returns {Promise<boolean>} - True if the symbol is a function, false otherwise.
 */
async function checkFunc(name) {
    const out = await runOSA(`return type(_G["${name}"])`);
    return out.trim() === 'function';
}

/**
 * Ensures that all required Lua functions exist before proceeding.
 * Retries multiple times to allow Hammerspoon time to finish loading its config.
 *
 * @param {object} [opts] - Options.
 * @param {number} [opts.retries=12] - Maximum number of attempts.
 * @param {number} [opts.delayMs=300] - Delay between attempts, in milliseconds.
 * @throws {Error} If any functions are still missing after all retries.
 */
export async function ensureReady({retries = 12, delayMs = 300} = {}) {
    const required = ['lsd_open', 'lsd_close', 'lsd_minimize', 'lsd_maximize', 'lsd_fullscreen', 'lsd_focus'];

    for (let i = 0; i < retries; i++) {
        const missing = [];
        for (const name of required) {
            try {
                if (!(await checkFunc(name))) missing.push(name);
            } catch {
                // If osascript/Lua evaluation fails transiently, treat as missing and retry.
                missing.push(name);
            }
        }
        if (missing.length === 0) return;
        if (i === retries - 1) {
            throw new Error('HS_FUNCS_MISSING:' + missing.join(','));
        }
        await wait(delayMs);
    }
}
