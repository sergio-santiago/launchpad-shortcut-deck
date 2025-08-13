-- ~/.hammerspoon/launchpad-shortcut-deck/init.lua

-- Requires Accessibility permission for window operations (System Settings → Privacy & Security → Accessibility).

-- Generic Lua API for application/window control from Node via AppleScript.
-- All public functions return the string "ok" or "err" to keep IPC predictable.
-- NOTE: For window manipulation (minimize/maximize/fullscreen/close windows), Hammerspoon
--       may need Accessibility permission in macOS Privacy & Security.

-- Allow AppleScript (osascript) to run Lua code inside Hammerspoon.
hs.allowAppleScript(true)

-- ===== Generic Helpers =====

-- parseTarget:
-- Accepts either a plain app name (e.g. "Safari") or a bundle-qualified target
-- (e.g. "bundle:com.microsoft.VSCode"). Returns a { kind, value } table.
local function parseTarget(s)
  -- Supported formats:
  --   "Safari"                       (by name)
  --   "bundle:com.microsoft.VSCode"  (by bundle id)
  if type(s) ~= "string" then return { kind = "name", value = "" } end
  local bid = s:match("^bundle:(.+)$")
  if bid and #bid > 0 then return { kind = "bundle", value = bid } end
  return { kind = "name", value = s }
end

-- getAppByBundle:
-- Returns an hs.application instance for a given bundle id, if any is running.
local function getAppByBundle(bid)
  local apps = hs.application.applicationsForBundleID(bid) or {}
  if #apps > 0 then return apps[1] end
  return nil
end

-- getAppByName:
-- Attempts to resolve an app by display name.
local function getAppByName(name)
  return hs.application.get(name) or hs.appfinder.appFromName(name)
end

-- resolveApp:
-- Resolves an app handle from a parsed target (by bundle or by name).
local function resolveApp(target)
  if target.kind == "bundle" then
    return getAppByBundle(target.value)
  else
    return getAppByName(target.value)
  end
end

-- launchOrFocus:
-- Launches or focuses an app given a parsed target. Uses bundle-aware launcher
-- when provided for better reliability.
local function launchOrFocus(target)
  if target.kind == "bundle" then
    hs.application.launchOrFocusByBundleID(target.value)
  else
    hs.application.launchOrFocus(target.value)
  end
end

-- ensureApp:
-- Best-effort to make sure an app is launched and resolvable, retrying briefly.
-- Returns an hs.application instance or nil.
local function ensureApp(target, tries, delayUs)
  tries   = tries   or 12
  delayUs = delayUs or 120000 -- 0.12s between attempts

  launchOrFocus(target)
  for _ = 1, tries do
    local app = resolveApp(target)
    if app then return app end
    hs.timer.usleep(delayUs)
  end
  return nil
end

-- waitWindow:
-- Attempts to obtain a usable window for an app, with a few niceties:
--  - un-minimizes any minimized windows,
--  - activates the app,
--  - retries briefly for a focused/main window to appear.
-- Returns an hs.window or nil.
local function waitWindow(app, tries, delayUs)
  tries   = tries   or 12
  delayUs = delayUs or 120000 -- 0.12s

  -- Un-minimize any minimized windows so we have something to act on.
  local wins = app.allWindows and app:allWindows() or {}
  local restored = false
  for _, w in ipairs(wins) do
    if w:isMinimized() then w:unminimize(); restored = true end
  end
  if restored then hs.timer.usleep(150000) end

  -- Bring the app to front and wait for a usable window.
  app:activate(true)
  for _ = 1, tries do
    local w = app.focusedWindow and (app:focusedWindow() or app:mainWindow()) or nil
    if w then return w end
    hs.timer.usleep(delayUs)
  end
  return nil
end

-- ===== Public API (string-return) =====

-- launchpad_shortcut_deck_open:
-- Launch or focus the target application. Does not guarantee a new window.
function launchpad_shortcut_deck_open(s)
  local t = parseTarget(s)
  launchOrFocus(t)
  return "ok"
end

-- launchpad_shortcut_deck_focus:
-- Bring the app to the front. Launches first if needed.
function launchpad_shortcut_deck_focus(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end
  app:activate(true)
  return "ok"
end

-- launchpad_shortcut_deck_close:
-- Attempt to quit the app. Uses :kill() when possible; otherwise falls back
-- to AppleScript (by name or by bundle id).
function launchpad_shortcut_deck_close(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t, 6, 100000)
  if app and app.kill then
    app:kill()
    return "ok"
  end
  -- Generic AppleScript fallback
  local nameOrBid = t.value
  local as
  if t.kind == "bundle" then
    -- AppleScript quits by app id (bundle id) using 'application id "<BUNDLE>"'
    as = 'tell application id "'..nameOrBid..'" to quit'
  else
    as = 'tell application "'..nameOrBid..'" to quit'
  end
  local okAS = hs.osascript.applescript(as)
  return okAS and "ok" or "err"
end

-- launchpad_shortcut_deck_close_windows:
-- Close all windows of the app but keep the process running (do NOT quit).
function launchpad_shortcut_deck_close_windows(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end

  -- Get all windows (may be empty if the app has no UI yet)
  local wins = app.allWindows and app:allWindows() or {}

  -- If there are minimized windows, unminimize so close() can act on them
  local hadMinimized = false
  for _, w in ipairs(wins) do
    if w:isMinimized() then w:unminimize(); hadMinimized = true end
  end
  if hadMinimized then hs.timer.usleep(120000) end -- short pause

  -- Close all standard windows
  local closedAny = false
  for _, w in ipairs(app:allWindows() or {}) do
    -- In most apps close() is enough; filter out non-standard windows for safety
    local ok, isStd = pcall(function() return w:isStandard() end)
    if not ok or isStd then
      w:close()
      closedAny = true
    end
  end

  -- If there were no windows, consider "ok" (process remains in memory)
  if #wins == 0 or closedAny then return "ok" end
  return "err"
end

-- launchpad_shortcut_deck_minimize:
-- Minimize the app’s primary window if available.
function launchpad_shortcut_deck_minimize(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end
  local w = waitWindow(app)
  if w then w:minimize(); return "ok" end
  return "err"
end

-- launchpad_shortcut_deck_maximize:
-- Maximize the app’s primary window if available.
function launchpad_shortcut_deck_maximize(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end
  local w = waitWindow(app)
  if w then w:maximize(); return "ok" end
  return "err"
end

-- launchpad_shortcut_deck_fullscreen:
-- Toggle fullscreen for the app’s primary window (true to enable, false to exit).
function launchpad_shortcut_deck_fullscreen(s, val)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end
  local w = waitWindow(app)
  if w then w:setFullScreen(val ~= false); return "ok" end
  return "err"
end
