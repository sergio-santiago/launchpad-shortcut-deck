-- ~/.hammerspoon/launchpad-shortcut-deck/init.lua
-- Fast & robust Lua API to control macOS apps from Node (via osascript).
-- All public functions return the strings "ok" or "err" for predictable IPC.
-- NOTE: Window operations require Accessibility permission:
--       System Settings → Privacy & Security → Accessibility → enable "Hammerspoon".

hs.allowAppleScript(true) -- allow `execute lua code` from osascript

----------------------------------------------------------------------
-- Tunables (snappy yet reliable)
-- The goal is low perceived latency while being tolerant to slow apps.
----------------------------------------------------------------------
local LAUNCH_TRIES   = 20      -- attempts to resolve app after launch
local LAUNCH_SLEEPUS = 100000  -- 100 ms between attempts (~2.0 s total)

local WIN_TRIES      = 10      -- attempts to obtain a usable window
local WIN_SLEEPUS    = 80000   -- 80 ms between attempts (~0.8 s total)

local UNMIN_DELAYUS  = 90000   -- short pause after unminimize (90 ms)

----------------------------------------------------------------------
-- Local refs (avoid global lookups in hot paths)
----------------------------------------------------------------------
local appmod    = hs.application
local appfinder = hs.appfinder
local json      = hs.json
local osa       = hs.osascript.applescript
local usleep    = hs.timer.usleep
local keystroke = hs.eventtap.keyStroke

----------------------------------------------------------------------
-- Helpers
----------------------------------------------------------------------

--- Parse a target string into either {kind="bundle", value="<id>"} or {kind="name", value="<name>"}.
--- Accepts "Safari" or "bundle:com.apple.Safari".
local function parseTarget(s)
  if type(s) ~= "string" then return { kind = "name", value = "" } end
  local bid = s:match("^bundle:(.+)$")
  if bid and #bid > 0 then return { kind = "bundle", value = bid } end
  return { kind = "name", value = s }
end

--- Return an hs.application instance for a bundle id (first match) or nil.
local function getAppByBundle(bid)
  local apps = appmod.applicationsForBundleID(bid) or {}
  if #apps > 0 then return apps[1] end
  return nil
end

--- Try by human name (fast path), then appfinder (slower).
local function getAppByName(name)
  return appmod.get(name) or appfinder.appFromName(name)
end

--- Resolve an app from a parsed target.
local function resolveApp(target)
  if target.kind == "bundle" then return getAppByBundle(target.value) end
  return getAppByName(target.value)
end

--- Bring app to front, preferring bundle id when available.
local function launchOrFocus(target)
  if target.kind == "bundle" then
    appmod.launchOrFocusByBundleID(target.value)
  else
    appmod.launchOrFocus(target.value)
  end
end

--- Ensure the app is running and resolvable.
--- Strategy:
---   1) launchOrFocus
---   2) brief retries to obtain a handle
---   3) stubborn fallback: AppleScript `launch` by id/name, then retry
local function ensureApp(target, tries, sleepUs)
  tries   = tries   or LAUNCH_TRIES
  sleepUs = sleepUs or LAUNCH_SLEEPUS

  launchOrFocus(target)
  for _ = 1, tries do
    local app = resolveApp(target)
    if app then return app end
    usleep(sleepUs)
  end

  -- Fallback: explicit AppleScript launch (some apps are stubborn)
  local as = (target.kind == "bundle")
      and ('tell application id "'..target.value..'" to launch')
       or ('tell application "' ..target.value..'" to launch')
  osa(as)

  for _ = 1, 5 do
    local app = resolveApp(target)
    if app then return app end
    usleep(sleepUs)
  end
  return nil
end

--- Try to obtain a usable window (focused/main), making the app visible if needed.
--- Steps:
---   - unhide app (safe if already visible)
---   - unminimize any minimized windows (common after clicking the red button)
---   - activate app and poll for a focused/main window with a short retry loop
---   - at mid-loop, nudge again by bundle id (helps some apps surface a window)
local function waitWindow(app, tries, sleepUs)
  tries   = tries   or WIN_TRIES
  sleepUs = sleepUs or WIN_SLEEPUS

  -- Unhide (no-op if already visible)
  pcall(function() app:unhide() end)

  -- Unminimize all windows so we have something to act on
  local wins = app.allWindows and app:allWindows() or {}
  local restored = false
  for _, w in ipairs(wins) do
    if w:isMinimized() then w:unminimize(); restored = true end
  end
  if restored then usleep(UNMIN_DELAYUS) end

  -- Bring to front before polling
  app:activate(true)

  for i = 1, tries do
    local w = (app.focusedWindow and app:focusedWindow()) or (app.mainWindow and app:mainWindow()) or nil
    if w then return w end

    -- Midway nudge can help stubborn apps produce a main window
    if i == math.floor(tries / 2) then
      pcall(function()
        local bid = app:bundleID()
        if bid and #bid > 0 then appmod.launchOrFocusByBundleID(bid) end
      end)
    end

    usleep(sleepUs)
  end
  return nil
end

-- Keystroke fallbacks / reopen (used when direct window ops fail)
local function tryCmdM(app) keystroke({ "cmd" }, "m", 0, app) end
local function tryCmdN(app) keystroke({ "cmd" }, "n", 0, app) end
local function tryReopen(target)
  local as = (target.kind == "bundle")
      and ('tell application id "'..target.value..'" to reopen')
       or ('tell application "' ..target.value..'" to reopen')
  osa(as)
end

----------------------------------------------------------------------
-- Public API (return "ok"/"err")
----------------------------------------------------------------------

--- Launch or focus the target application (does not guarantee a new window).
function launchpad_shortcut_deck_open(s)
  launchOrFocus(parseTarget(s))
  return "ok"
end

--- Bring app to front. If minimized/hidden, restore it.
--- If no windows exist, attempt reopen; if that fails, create a new one (Cmd+N).
--- As a last resort, explicitly `activate` via AppleScript.
function launchpad_shortcut_deck_focus(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end

  pcall(function() app:unhide() end)
  app:activate(true)

  local w = waitWindow(app)
  if w then app:activate(true); return "ok" end

  -- No windows → try "reopen", then check again
  tryReopen(t)
  usleep(150000)
  w = (app.focusedWindow and app:focusedWindow()) or (app.mainWindow and app:mainWindow()) or nil
  if w then app:activate(true); return "ok" end

  -- Last resort: force a fresh window (Cmd+N)
  tryCmdN(app)
  usleep(150000)
  w = (app.focusedWindow and app:focusedWindow()) or (app.mainWindow and app:mainWindow()) or nil
  if w then app:activate(true); return "ok" end

  -- Some apps only obey explicit AppleScript activation
  local as = (t.kind == "bundle")
      and ('tell application id "'..t.value..'" to activate')
       or ('tell application "' ..t.value..'" to activate')
  osa(as)
  return "ok"
end

--- Close all standard windows, but keep the process alive (do NOT quit).
function launchpad_shortcut_deck_close(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end

  local wins = app.allWindows and app:allWindows() or {}
  local hadMinimized = false
  for _, w in ipairs(wins) do
    if w:isMinimized() then w:unminimize(); hadMinimized = true end
  end
  if hadMinimized then usleep(UNMIN_DELAYUS) end

  local closedAny = false
  for _, w in ipairs(app:allWindows() or {}) do
    -- Favor standard windows; if we cannot query isStandard(), err on closing
    local ok, isStd = pcall(function() return w:isStandard() end)
    if (not ok) or isStd then w:close(); closedAny = true end
  end

  if (#wins == 0) or closedAny then return "ok" end
  return "err"
end

--- Quit the application. Prefer app:kill(), fallback to AppleScript `quit`.
function launchpad_shortcut_deck_quit(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if app and app.kill then app:kill(); return "ok" end
  local as = (t.kind == "bundle")
      and ('tell application id "'..t.value..'" to quit')
       or ('tell application "' ..t.value..'" to quit')
  local okAS = osa(as)
  return okAS and "ok" or "err"
end

--- Minimize the primary window; fallback to Cmd+M if direct call fails.
function launchpad_shortcut_deck_minimize(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end

  local w = waitWindow(app)
  if w then
    local ok = pcall(function() w:minimize() end)
    if ok then return "ok" end
  end
  tryCmdM(app)
  return "ok"
end

--- Maximize the primary window. Returns "err" if none can be found.
function launchpad_shortcut_deck_maximize(s)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end

  local w = waitWindow(app)
  if w then w:maximize(); return "ok" end
  return "err"
end

--- Toggle fullscreen for the primary window (true to enable, false to exit).
function launchpad_shortcut_deck_fullscreen(s, val)
  local t = parseTarget(s)
  local app = resolveApp(t) or ensureApp(t)
  if not app then return "err" end

  local w = waitWindow(app)
  if w then w:setFullScreen(val ~= false); return "ok" end
  return "err"
end

--- Return a JSON array with minimal per-app state for multiple targets.
--- Shape: [{target, running, focused?, windowCount?, minimizedCount?, visibleCount?, allMinimized?, hasVisibleWindows?}, ...]
--- Cost: one pass over each app's window list; designed to be fast for periodic polling.
function launchpad_shortcut_deck_getStatesBulk(targets)
  if type(targets) ~= "table" then return "[]" end
  local results = {}

  for _, s in ipairs(targets) do
    local target = parseTarget(s)
    local app = resolveApp(target)
    if not app then
      results[#results+1] = { target = s, running = false }
    else
      local wins = app:allWindows() or {}
      local visCount, minCount, total = 0, 0, #wins
      for _, w in ipairs(wins) do
        if w:isVisible()   then visCount = visCount + 1 end
        if w:isMinimized() then minCount = minCount + 1 end
      end
      local focused    = app:isFrontmost()
      local hasVisible = (visCount > 0)
      local allMin     = (total > 0 and minCount == total)
      results[#results+1] = {
        target = s, running = true, focused = focused,
        hasVisibleWindows = hasVisible, allMinimized = allMin,
        windowCount = total, visibleCount = visCount, minimizedCount = minCount
      }
    end
  end

  return json.encode(results)
end
