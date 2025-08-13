// NOTE: This is a manual integration test. It will open/close apps on your system.
// Run with: pnpm test:hammerspoon

// Purpose: Manual integration test for the Hammerspoon bridge.
// Runs through a series of open/focus/minimize/maximize/fullscreen/close windows/close
// operations for a list of applications, with small delays between them,
// so you can manually verify everything works end-to-end.

/**
 * Integration imports:
 *  - ensureReady(): Waits until the Lua API in Hammerspoon is loaded and callable.
 *  - hs: Object exposing Hammerspoon control actions (`open`, `close`, etc.).
 */
import {actions as hs, ensureReady} from '../src/integrations/hammerspoon/index.js'

/**
 * Applications to test.
 * These are human-readable names as passed to the public API — they will
 * be resolved to bundle IDs where necessary.
 */
const APPS = ['Safari', 'Visual Studio Code', 'Google Chrome', 'Music'] // Add more as needed

/**
 * Delay timings (in milliseconds) between actions.
 * Adjust to account for application load times and macOS animations.
 */
const D = {
    afterOpen: 1200,       // Wait after opening before the next action
    betweenOps: 800,       // Default gap between actions
    afterFullscreen: 1200, // Wait after entering/exiting fullscreen
    afterClose: 1000,      // Wait after closing
}

/** Utility: pause execution for a given number of milliseconds. */
const sleep = (ms) => new Promise(res => setTimeout(res, ms))

/** Utility: check if a returned value is a lowercase "ok" string. */
const ok = (v) => typeof v === 'string' && v.trim().toLowerCase() === 'ok'

/** Tracks whether any action in the test sequence has failed. */
let hadError = false;

/**
 * Run a single Hammerspoon action and log the result with emojis.
 *
 * @param {string} label - Descriptive label for logging.
 * @param {Function} fn - Function returning a Promise<string> from hs.actions.
 * @returns {Promise<boolean>} - true if the result was "ok", false otherwise.
 */
async function run(label, fn) {
    try {
        const res = await fn();
        const isOk = ok(res);
        console.log(`${isOk ? '✅' : '⚠️'} ${label}:`, res);
        if (!isOk) hadError = true;
        return isOk;
    } catch (e) {
        console.error(`❌ ${label}:`, e?.message || e);
        hadError = true;
        return false;
    } finally {
        await sleep(D.betweenOps);
    }
}

/**
 * Test all operations for a single application in order:
 *  1. Open — launch the app if not running.
 *  2. Focus — bring it to the front.
 *  3. Minimize — minimize the main window.
 *  4. Focus again — restore focus after minimizing.
 *  5. Maximize — maximize the main window.
 *  6. Toggle fullscreen ON and OFF.
 *  7. Close windows (keep running) — close all windows while keeping the process in memory.
 *  8. Focus + Open — bring the app forward again and ensure a new window is created.
 *  9. Close (quit) — fully quit the application (equivalent to ⌘Q).
 *
 * This sequence validates both “soft close” (windows only) and “hard close” (quit app) behaviors.
 *
 * @param {string} app - Human-readable application name.
 */async function testOne(app) {
    console.log(`\n───────────── Testing: ${app} ─────────────`)

    // --- initial cycle ---
    await run(`${app} · open`, () => hs.open(app))
    await sleep(D.afterOpen)

    await run(`${app} · focus`, () => hs.focus(app))
    await run(`${app} · minimize`, () => hs.minimize(app))
    await run(`${app} · focus (post-minimize)`, () => hs.focus(app))
    await run(`${app} · maximize`, () => hs.maximize(app))

    await run(`${app} · fullscreen ON`, () => hs.fullscreen(app, true))
    await sleep(D.afterFullscreen)
    await run(`${app} · fullscreen OFF`, () => hs.fullscreen(app, false))

    // --- new: close windows but keep the process running ---
    await run(`${app} · close windows (keep running)`, () => hs.closeWindows(app))

    // Bring the app to the front again; some apps won't open a window on focus,
    // so ensure a window exists by calling open explicitly
    await run(`${app} · focus (after close-windows)`, () => hs.focus(app))
    await run(`${app} · open (ensure window)`, () => hs.open(app))
    await sleep(D.afterOpen)

    // --- final: quit the app completely ---
    await run(`${app} · close (quit)`, () => hs.close(app))
    await sleep(D.afterClose)
}

/**
 * Entry point:
 *  - Ensure Hammerspoon Lua API is ready.
 *  - Iterate through all configured apps and run tests.
 */
async function main() {
    console.log('[BOOT] Hammerspoon preflight…')
    await ensureReady()
    console.log('[OK] Hammerspoon ready')

    // IMPORTANT: For minimize/maximize/fullscreen/closeWindows to work,
    // grant Hammerspoon Accessibility permissions in:
    //   System Settings → Privacy & Security → Accessibility

    for (const app of APPS) {
        await testOne(app)
    }

    if (hadError) {
        console.error('\n[FAIL] One or more actions failed.')
        process.exit(1)
    }

    console.log('\n[DONE] Test suite finished.')
}

await main()
