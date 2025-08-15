/**
 * Thin wrapper around the Hammerspoon Lua API (launchpad_shortcut_deck_* functions).
 *
 * Responsibilities
 * - Execute Lua snippets inside Hammerspoon via AppleScript (`osascript`)
 * - Provide low-level 1:1 actions that return raw "ok"/"err" strings
 * - Expose a higher-level integration that:
 *     • calls ensureReady() automatically
 *     • logs actions
 *     • provides JSON helpers for bulk/single state queries
 *
 * Target format
 * - All public methods expect a string like: "bundle:com.apple.Safari"
 *   Using bundle IDs avoids ambiguity and improves reliability.
 */

import {execFile} from 'node:child_process';
import {ensureReady} from './preflight.js';
import {logger} from '../../utils/logger.js';

const isMac = process.platform === 'darwin';

/**
 * Escape a Lua snippet so it can be safely embedded in an AppleScript string.
 * - Escapes backslashes and double quotes
 * - Collapses newlines to spaces (single-line AppleScript)
 *
 * @param {string} s
 * @returns {string}
 */
function escapeForOSA(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

/**
 * Execute a Lua chunk inside Hammerspoon via AppleScript.
 *
 * @param {string} lua - Lua code to be executed by Hammerspoon.
 * @param {{timeoutMs?:number,maxBuffer?:number,debug?:boolean}} [opts]
 * @returns {Promise<string>} Trimmed stdout returned by Hammerspoon.
 */
function callOSA(lua, opts = {}) {
    if (!isMac) return Promise.reject(new Error('Hammerspoon is macOS-only'));

    const {timeoutMs = 1200, maxBuffer = 1024 * 1024, debug = false} = opts;
    const osa = `tell application "Hammerspoon" to execute lua code "${escapeForOSA(lua)}"`;

    if (debug) logger.debug('[OSA] >>', lua);

    return new Promise((resolve, reject) => {
        execFile('osascript', ['-e', osa], {timeout: timeoutMs, maxBuffer}, (err, stdout, stderr) => {
            if (err) {
                const msg =
                    (stderr && String(stderr).trim()) ||
                    (stdout && String(stdout).trim()) ||
                    err.message ||
                    'Unknown error';
                if (debug) logger.debug('[OSA] !!', msg);
                return reject(new Error(msg));
            }
            const out = String(stdout || '').trim();
            if (debug) logger.debug('[OSA] <<', out);
            resolve(out);
        });
    });
}

// Re-export for callers that want to run the preflight explicitly.
export {ensureReady};

/**
 * Low-level actions (1:1 with Lua). Return raw "ok"/"err" strings.
 * Callers are responsible for invoking ensureReady() beforehand (or use
 * the high-level helpers below which do it for you).
 */
export const actions = {
    open: (target) => callOSA(`return launchpad_shortcut_deck_open([[${target}]])`),
    focus: (target) => callOSA(`return launchpad_shortcut_deck_focus([[${target}]])`),
    minimize: (target) => callOSA(`return launchpad_shortcut_deck_minimize([[${target}]])`),
    maximize: (target) => callOSA(`return launchpad_shortcut_deck_maximize([[${target}]])`),
    fullscreen: (target, on = true) => callOSA(`return launchpad_shortcut_deck_fullscreen([[${target}]], ${on ? 'true' : 'false'})`),
    close: (target) => callOSA(`return launchpad_shortcut_deck_close([[${target}]])`),
    quit: (target) => callOSA(`return launchpad_shortcut_deck_quit([[${target}]])`),
};

/**
 * High-level convenience API with ensureReady() and JSON helpers.
 * All methods return trimmed strings ("ok"/"err") or parsed JSON objects.
 */
export function resolveActions() {
    const norm = (r) => (r || '').trim();

    async function launch(target) {
        await ensureReady();
        const r = await actions.open(target);
        logger.info('[HS] open', {target, r});
        return norm(r);
    }

    async function focus(target) {
        await ensureReady();
        const r = await actions.focus(target);
        logger.info('[HS] focus', {target, r});
        return norm(r);
    }

    async function minimizeAll(target) {
        await ensureReady();
        const r = await actions.minimize(target);
        logger.info('[HS] minimize', {target, r});
        return norm(r);
    }

    async function closeAll(target) {
        await ensureReady();
        const r = await actions.close(target);
        logger.info('[HS] close', {target, r});
        return norm(r);
    }

    async function quit(target) {
        await ensureReady();
        const r = await actions.quit(target);
        logger.info('[HS] quit', {target, r});
        return norm(r);
    }

    /**
     * Query multiple app states in one round trip.
     *
     * @param {string[]} targets - Array of "bundle:..." strings.
     * @returns {Promise<Array<{target:string,running:boolean,focused?:boolean,windowCount?:number,minimizedCount?:number,visibleCount?:number,allMinimized?:boolean,hasVisibleWindows?:boolean}>>}
     */
    async function getStatesBulk(targets) {
        await ensureReady();
        if (!targets || targets.length === 0) return [];
        const list = targets.map(t => `[[${t}]]`).join(', ');
        const lua = `return launchpad_shortcut_deck_getStatesBulk({ ${list} })`;
        const out = await callOSA(lua);
        try {
            const parsed = JSON.parse(out);
            logger.debug('[HS] statesBulk', {count: Array.isArray(parsed) ? parsed.length : 0});
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            logger.warn('[HS] statesBulk JSON parse failed');
            return [];
        }
    }

    /** Query a single app state (convenience wrapper over getStatesBulk). */
    async function getState(target) {
        const [one] = await getStatesBulk([target]);
        return one || {target, running: false};
    }

    return {launch, focus, minimizeAll, closeAll, quit, getStatesBulk, getState};
}

let _cached;

/**
 * Singleton accessor for the high-level integration.
 * Lazily constructs and caches the resolved action helpers.
 */
export function getIntegration() {
    if (!_cached) _cached = resolveActions();
    return _cached;
}