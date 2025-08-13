// NOTE: This is a manual integration test. It will open/close apps on your system.
// Run with: pnpm test:hammerspoon

// Purpose: Manual integration test for the Hammerspoon bridge.
// Runs through a series of open/focus/minimize/maximize/fullscreen/close
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
    afterOpen: 900,        // Wait after opening before the next action
    betweenOps: 500,       // Default gap between actions
    afterFullscreen: 900,  // Wait after entering/exiting fullscreen
    afterClose: 700,       // Wait after closing
}

/** Utility: pause execution for a given number of milliseconds. */
const sleep = (ms) => new Promise(res => setTimeout(res, ms))

/** Utility: check if a returned value is a lowercase "ok" string. */
const ok = (v) => typeof v === 'string' && v.trim().toLowerCase() === 'ok'

/**
 * Run a single Hammerspoon action and log the result with emojis.
 *
 * @param {string} label - Descriptive label for logging.
 * @param {Function} fn - Function returning a Promise<string> from hs.actions.
 * @returns {Promise<boolean>} - true if the result was "ok", false otherwise.
 */
async function run(label, fn) {
    try {
        const res = await fn()
        const isOk = ok(res)
        console.log(`${isOk ? '✅' : '⚠️'} ${label}:`, res)
        return isOk
    } catch (e) {
        console.error(`❌ ${label}:`, e?.message || e)
        return false
    } finally {
        await sleep(D.betweenOps)
    }
}

/**
 * Test all operations for a single application in order:
 *  1. Open
 *  2. Focus
 *  3. Minimize
 *  4. Focus again
 *  5. Maximize
 *  6. Toggle fullscreen ON and OFF
 *  7. Close
 *
 * @param {string} app - Human-readable application name.
 */
async function testOne(app) {
    console.log(`\n───────────── Testing: ${app} ─────────────`)

    await run(`${app} · open`, () => hs.open(app))
    await sleep(D.afterOpen)

    await run(`${app} · focus`, () => hs.focus(app))
    await run(`${app} · minimize`, () => hs.minimize(app))
    await run(`${app} · focus (post-minimize)`, () => hs.focus(app))
    await run(`${app} · maximize`, () => hs.maximize(app))

    await run(`${app} · fullscreen ON`, () => hs.fullscreen(app, true))
    await sleep(D.afterFullscreen)
    await run(`${app} · fullscreen OFF`, () => hs.fullscreen(app, false))

    await run(`${app} · close`, () => hs.close(app))
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

    // IMPORTANT: For minimize/maximize/fullscreen to work,
    // grant Hammerspoon Accessibility permissions in:
    //   System Settings → Privacy & Security → Accessibility

    for (const app of APPS) {
        await testOne(app)
    }

    console.log('\n[DONE] Test suite finished.')
}

await main()
