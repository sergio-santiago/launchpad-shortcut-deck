// src/integrations/hammerspoon/preflight.js
/**
 * Preflight for the Hammerspoon integration.
 *
 * Verifies that the custom Lua API (functions named `launchpad_shortcut_deck_*`)
 * is loaded and callable inside Hammerspoon before the rest of the app proceeds.
 *
 * Design goals:
 * - Low latency: a single AppleScript round-trip per attempt
 * - Robustness: short retry window to tolerate Hammerspoon config reloads
 * - Idempotency: later calls reuse a cached Promise to avoid duplicate work
 *
 * Usage:
 *   await ensureReady(); // throws if the API is missing after all attempts
 */

import {execFile} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {logger} from '../../utils/logger.js';

const isMac = process.platform === 'darwin';

/**
 * Escape a Lua snippet so it can be safely embedded into an AppleScript string literal.
 * - Escapes backslashes and double quotes
 * - Collapses newlines to spaces (osascript one-liners)
 *
 * @param {string} s
 * @returns {string}
 */
function escapeForOSA(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

/**
 * Execute a short Lua chunk inside Hammerspoon via AppleScript (`osascript`).
 *
 * Implementation details:
 * - We target the Hammerspoon app directly and ask it to `execute lua code "<chunk>"`
 * - On error, we surface the most informative message available (stderr > stdout > error message)
 *
 * @param {string} luaChunk - Lua code to run inside Hammerspoon.
 * @param {{timeoutMs?: number, maxBuffer?: number}} [opts]
 * @returns {Promise<string>} Trimmed stdout returned by Hammerspoon.
 */
function runOSA(luaChunk, opts = {}) {
    const {timeoutMs = 1200, maxBuffer = 1024 * 1024} = opts;
    const osa = `tell application "Hammerspoon" to execute lua code "${escapeForOSA(luaChunk)}"`;
    return new Promise((resolve, reject) => {
        execFile('osascript', ['-e', osa], {timeout: timeoutMs, maxBuffer}, (err, stdout, stderr) => {
            if (err) {
                const msg = (stderr && String(stderr).trim()) || (stdout && String(stdout).trim()) || err.message || 'Unknown error';
                return reject(new Error(msg));
            }
            resolve(String(stdout || '').trim());
        });
    });
}

/** Cached promise to avoid multiple concurrent/duplicate preflights. */
let _readyOnce;

/**
 * Ensure Hammerspoon's Lua API is available.
 *
 * Tries a few times (short backoff) to allow Hammerspoon to finish loading or reloading.
 * If any required function is missing after the final attempt, rejects with a
 * descriptive "HS_FUNCS_MISSING:..." error.
 *
 * @param {{retries?: number, delayMs?: number}} [opts]
 * @param {number} [opts.retries=8]   - Total attempts before failing.
 * @param {number} [opts.delayMs=140] - Base delay between attempts (ms).
 * @returns {Promise<void>}
 * @throws {Error} If required functions are still missing after all retries,
 *                 or if `osascript` invocation fails.
 */
export function ensureReady({retries = 8, delayMs = 140} = {}) {
    if (_readyOnce) return _readyOnce;

    _readyOnce = (async () => {
        if (!isMac) {
            logger.warn('[HS] preflight skipped: non-macOS platform');
            return;
        }

        // Keep this list in sync with the public Lua API (see hammerspoon/.../init.lua)
        const required = ['launchpad_shortcut_deck_open', 'launchpad_shortcut_deck_focus', 'launchpad_shortcut_deck_minimize', 'launchpad_shortcut_deck_maximize', 'launchpad_shortcut_deck_fullscreen', 'launchpad_shortcut_deck_close', 'launchpad_shortcut_deck_quit', 'launchpad_shortcut_deck_getStatesBulk',];

        // Single Lua chunk that returns a JSON array of missing function names.
        // We prefer `hs.json.encode`, falling back to "[]" if not available yet.
        const luaCheck = `
            local req = { ${required.map(n => `[[${n}]]`).join(', ')} }
            local missing = {}
            for i=1,#req do
                local name = req[i]
                if type(_G[name]) ~= 'function' then missing[#missing+1] = name end
            end
            if hs and hs.json and hs.json.encode then
                return hs.json.encode(missing)
            else
                return "[]"
            end
        `;

        for (let attempt = 0; attempt < retries; attempt++) {
            let fatalError = null;

            try {
                const out = await runOSA(luaCheck);
                let missing = [];
                try {
                    missing = JSON.parse(out || '[]');
                } catch {
                    missing = [];
                }

                if (Array.isArray(missing) && missing.length === 0) {
                    if (attempt > 0) logger.info(`[HS] preflight ready after ${attempt + 1} attempt(s)`); else logger.debug('[HS] preflight ready (first attempt)');
                    return;
                }

                if (attempt === retries - 1) {
                    logger.error('[HS] preflight failed (missing API):', missing);
                    fatalError = new Error('HS_FUNCS_MISSING:' + missing.join(','));
                }
            } catch (e) {
                if (attempt === retries - 1) {
                    logger.error('[HS] preflight error (final):', e?.message || e);
                    fatalError = e instanceof Error ? e : new Error(String(e));
                }
                // else: swallow and retry on transient osascript/Hammerspoon errors
            }

            if (fatalError) {
                // Single throw site outside the try/catch to avoid "throw caught locally" warnings
                throw fatalError;
            }

            // Small incremental backoff; capped to keep startup snappy.
            const backoff = Math.min(450, delayMs + attempt * 25);
            await wait(backoff);
        }
    })();

    return _readyOnce;
}