// Manual integration test for the Hammerspoon bridge.
//
// It will open/close real apps on your Mac.
// Run with:  node tests/hammerspoon-integration.test.js
//
// What this covers
// - End‑to‑end control through AppleScript → Hammerspoon Lua API
// - Action sequence per app: open → focus → minimize → focus → maximize
//   → fullscreen ON/OFF → close windows (keep running) → focus/open → quit
// - State verification after each step via getState/getStatesBulk
//
// Requirements
// - macOS only
// - Hammerspoon running with Accessibility permission enabled:
//     System Settings → Privacy & Security → Accessibility → enable “Hammerspoon”
// - The Lua API from hammerspoon/launchpad-shortcut-deck/init.lua must be loaded

import {actions as hs, ensureReady, getIntegration} from '../src/integrations/hammerspoon/index.js';
import {logger} from '../src/utils/logger.js';

if (process.platform !== 'darwin') {
    logger.error('[TEST] This test is macOS-only.');
    process.exit(1);
}

// Override with env, e.g.:
//   APPS="bundle:com.apple.Safari,bundle:com.google.Chrome" node tests/hammerspoon-integration.test.js
const APPS =
    (process.env.APPS?.split(',').map(s => s.trim()).filter(Boolean)) ||
    [
        'bundle:com.apple.Safari',
        'bundle:com.microsoft.VSCode',
        'bundle:com.google.Chrome',
        'bundle:com.apple.Music',
    ];

// Delays tuned to be responsive while letting macOS UI settle (ms).
const D = Object.freeze({
    afterOpen: 900,
    betweenOps: 600,
    afterFullscreen: 900,
    afterClose: 800,
});

const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const ok = (v) => typeof v === 'string' && v.trim().toLowerCase() === 'ok';

let hadError = false;

// ───────────────────────── helpers ─────────────────────────

/** Run an hs action, log the result, and track failures. */
async function run(label, fn) {
    try {
        const res = await fn();
        const isOk = ok(res);
        logger[isOk ? 'info' : 'warn'](`${isOk ? '✅' : '⚠️'} ${label}: ${res}`);
        if (!isOk) hadError = true;
        return isOk;
    } catch (e) {
        logger.error(`❌ ${label}: ${e?.message || e}`);
        hadError = true;
        return false;
    } finally {
        await sleep(D.betweenOps);
    }
}

/**
 * Fetch latest state for a target and log it.
 * Returns the parsed state object (or a fallback).
 */
async function getState(api, target) {
    try {
        const st = await api.getState(target);
        logger.debug('[STATE]', {target, ...st});
        return st || {target, running: false};
    } catch (e) {
        logger.warn('[STATE] getState failed', {target, err: String(e)});
        return {target, running: false};
    }
}

/**
 * Minimal expectation helper:
 *  - `cond` should be a boolean
 *  - Logs pass/fail and flips `hadError` on fail
 */
function expect(cond, label, extra = undefined) {
    if (cond) {
        logger.info(`   ↳ ✅ ${label}`);
    } else {
        logger.warn(`   ↳ ❌ ${label}`, extra ? {extra} : undefined);
        hadError = true;
    }
}

// ───────────────────── per‑app test flow ───────────────────

/**
 * Exercise the full action sequence for a single bundle target and
 * verify expected state transitions along the way.
 */
async function testOne(api, target) {
    logger.info(`\n───────────── Testing: ${target} ─────────────`);

    // Open → app should be running
    await run(`${target} · open`, () => hs.open(target));
    await sleep(D.afterOpen);
    let st = await getState(api, target);
    expect(!!st.running, 'should be running after open');

    // Focus → ideally focused OR at least visible
    await run(`${target} · focus`, () => hs.focus(target));
    st = await getState(api, target);
    expect(!!st.running, 'still running after focus');
    expect(!!(st.focused || st.hasVisibleWindows), 'focused or has a visible window after focus', st);

    // Minimize → either “all minimized” or zero visible windows
    await run(`${target} · minimize`, () => hs.minimize(target));
    st = await getState(api, target);
    expect(!!st.running, 'still running after minimize');
    expect(!!(st.allMinimized || st.visibleCount === 0), 'minimized state reflects in windows', st);

    // Focus again → should surface a window and likely be focused
    await run(`${target} · focus (post-minimize)`, () => hs.focus(target));
    st = await getState(api, target);
    expect(!!st.running, 'still running after re-focus');
    expect(!!(st.hasVisibleWindows || st.windowCount > 0), 'has at least one visible or existing window', st);

    // Maximize → must still be running (some apps refuse maximize; do not hard fail)
    await run(`${target} · maximize`, () => hs.maximize(target));
    st = await getState(api, target);
    expect(!!st.running, 'still running after maximize');

    // Fullscreen ON/OFF → allow time for transitions
    await run(`${target} · fullscreen ON`, () => hs.fullscreen(target, true));
    await sleep(D.afterFullscreen);
    st = await getState(api, target);
    expect(!!st.running, 'still running in fullscreen ON');

    await run(`${target} · fullscreen OFF`, () => hs.fullscreen(target, false));
    await sleep(D.afterFullscreen);
    st = await getState(api, target);
    expect(!!st.running, 'still running after fullscreen OFF');

    // Close windows (keep running)
    await run(`${target} · close windows (keep running)`, () => hs.close(target));
    await sleep(D.afterClose);
    st = await getState(api, target);
    expect(!!st.running, 'process remains running after closing windows');
    expect(!(st.hasVisibleWindows && st.windowCount > 0), 'no visible windows after close', st);

    // Ensure a usable window exists again
    await run(`${target} · focus (after close)`, () => hs.focus(target));
    await run(`${target} · open (ensure window)`, () => hs.open(target));
    await sleep(D.afterOpen);
    st = await getState(api, target);
    expect(!!(st.hasVisibleWindows || st.windowCount > 0), 'window exists after reopen', st);

    // Quit → not running
    await run(`${target} · quit`, () => hs.quit(target));
    await sleep(D.afterClose);
    st = await getState(api, target);
    expect(!st.running, 'not running after quit');
}

// ───────────────────────── entry point ──────────────────────

(async () => {
    logger.info('[BOOT] Hammerspoon preflight…');
    await ensureReady();
    logger.info('[OK] Hammerspoon ready');

    // Use the high‑level integration for state queries
    const api = getIntegration();

    // Optional: warm up a bulk query to validate targets are accepted
    try {
        const bulk = await api.getStatesBulk(APPS);
        logger.debug('[STATE] initial bulk', {count: Array.isArray(bulk) ? bulk.length : 0});
    } catch (e) {
        logger.warn('[STATE] initial bulk failed', {err: String(e)});
    }

    for (const target of APPS) {
        await testOne(api, target);
    }

    if (hadError) {
        logger.error('\n[FAIL] One or more actions or state checks failed.');
        process.exit(1);
    }
    logger.info('\n[DONE] Test suite finished.');
})();
