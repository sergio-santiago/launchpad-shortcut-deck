// Purpose: Ensure Hammerspoon is running before the rest of the app starts.
// This script is intended to run as a prestart hook (see package.json).
// It will launch Hammerspoon if not already running and wait briefly
// to give it time to initialize before continuing.

import {exec} from 'node:child_process'
import {setTimeout as wait} from 'node:timers/promises'

/**
 * Execute a shell command without caring about its output or errors.
 * The promise always resolves, regardless of exit code.
 *
 * @param {string} cmd - Command to execute in the shell.
 * @returns {Promise<void>}
 */
function sh(cmd) {
    return new Promise((resolve) => exec(cmd, () => resolve()))
}

// Launch Hammerspoon if not already running
await sh('pgrep -x Hammerspoon || open -ga Hammerspoon')

// Give it a small startup margin before the main app runs
await wait(800) // ~0.8s buffer for Hammerspoon to initialize
