/**
 * Ensure that Hammerspoon is running before the Node.js app starts.
 *
 * Design goals:
 * - Minimal overhead: perform a single check, launch only if not running.
 * - Cross-platform safety: no-ops on non-macOS platforms.
 * - Small startup margin (a few hundred milliseconds) to give Hammerspoon time
 *   to initialize before the more detailed Lua API preflight runs.
 */

import {execFile} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {logger} from '../src/utils/logger.js';

const isMac = process.platform === 'darwin';

/**
 * Run a binary with arguments, ignoring exit codes and output.
 * Resolves regardless of whether the command succeeds or fails.
 *
 * @param {string} bin - Path to the binary to execute.
 * @param {string[]} [args=[]] - Arguments to pass to the binary.
 * @param {object} [opts={}] - Options for `execFile`.
 * @returns {Promise<void>} Resolves when the process exits.
 */
function run(bin, args = [], opts = {}) {
    return new Promise((resolve) => execFile(bin, args, opts, () => resolve()));
}

/**
 * Checks whether the "Hammerspoon" process is currently running.
 *
 * @returns {Promise<boolean>} Resolves to true if a matching process is found, false otherwise.
 */
function isRunning() {
    return new Promise((resolve) => {
        execFile('pgrep', ['-x', 'Hammerspoon'], {timeout: 300}, (err) => resolve(!err));
    });
}

/**
 * Ensures that Hammerspoon is running.
 * - Skips entirely if not on macOS.
 * - Uses `pgrep` to check for a running instance.
 * - Launches the app via `open -ga Hammerspoon` if not running.
 * - Waits briefly (300 ms) after launch to give it time to start.
 *
 * This function should be run before any integration calls that require
 * Hammerspoon's Lua API to be loaded.
 */
async function ensureHammerspoon() {
    if (!isMac) {
        logger.warn('[HS] skipping (non-macOS)');
        return;
    }

    logger.debug('[HS] checking process…');
    const running = await isRunning();

    if (!running) {
        logger.info('[HS] launching Hammerspoon');
        await run('open', ['-ga', 'Hammerspoon'], {timeout: 2000});
        // Small startup margin; detailed API readiness is handled by preflight.
        await wait(300);
        logger.info('[HS] launch request sent');
    } else {
        logger.debug('[HS] already running');
    }
}

// Execute immediately when the script runs (e.g., as a prestart hook).
await ensureHammerspoon();
