# 🎛 Launchpad Shortcut Deck — Technical Specification

Defines gestures, LED states, and sync rules for the Launchpad Shortcut Deck.  
Serves as the **single source of truth** for implementation and testing.

---

## 1. Gestures & Actions

- **Press** → Launch app if not running, else bring to the front.  
  **LED:** 🟩 solid (success) / 🟥 solid (failure).

- **Press again (while focused)** → Minimize all windows of that app (regardless of delay since last press).  
  **LED:** 🟨 solid.

- **Long press** → Close all windows (process may remain in memory).  
  **LED:** 🔴 blink (~1 s) → 🔻 dim red.

---

## 2. LED States

| State             | LED         | Meaning                                                        |
|-------------------|-------------|----------------------------------------------------------------|
| Unassigned        | ⚫ off       | No app mapped.                                                 |
| Assigned inactive | 🔻 dimRed   | App mapped but not running or running without visible windows. |
| Background        | 🟢 dimGreen | Running with visible windows, unfocused.                       |
| Focused           | 🟩 green    | Active and focused.                                            |
| Minimized         | 🟧 amber    | All windows minimized.                                         |
| Launching         | 🟩 blink    | While starting.                                                |
| Focusing          | 🟩 solid    | Immediately after focus.                                       |
| Minimizing        | 🟨 blink    | While minimizing.                                              |
| Closing           | 🔴 blink    | Before going inactive.                                         |
| Error             | 🟥 solid    | Action failed.                                                 |

> **Note:** Actual LED values are stored in a centralized constant file (e.g. `LED_COLORS.GREEN`) for implementation.

---

## 3. LED Rules

- **Blink** = action in progress (300–500 ms, except closing ≈ 1 s).
- **Solid** = stable state.
- **Assigned inactive** = 🔻 dim red (no windows or not running).
- **Close transition:** 🔴 blink → 🔻 dim red.

---

## 4. Latency & Sync

- **Pad press reaction:** ≤ 50 ms (optimistic update).
- **External changes:** Sync within 100–300 ms (focus, minimize, quit, etc.).
- **Conflict resolution:** If OS state and internal state disagree, OS state overrides immediately.
- **Debounce:** 300–800 ms after actions to avoid flicker.
- **Safe startup:** Query all mapped apps and set LEDs **before** processing any MIDI input.
- **Error handling:** 🟥 solid and log error with context.

---

## 5. Implementation Notes

- Abstract MIDI mapping for portability across Launchpad models.
- Centralize LED color constants to avoid inconsistencies.
- State polling: every **100–200 ms** (balance responsiveness and CPU usage).
- All operations must be **non-blocking** to prevent input lag.
