# 🎛 Launchpad Shortcut Deck — Technical Specification

Defines gestures, LED states, and sync rules for the Launchpad Shortcut Deck.  
Serves as the **single source of truth** for implementation and testing.

---

## 1. Gestures & Actions

- **Single press** → Launch app if not running, else bring to the front.  
  **LED:** 🟩 solid (success) / 🟥 solid (failure).  
  **Timing:** Immediate optimistic LED update, focus delay after launch = **120 ms**.

- **Double-tap** (≤ **480 ms** between taps) → Minimize all windows of the app if running (regardless of focus).  
  **LED:** 🟧 amber blink (while minimizing) → 🟨 yellow solid (when minimized).

- **Long press** (≥ **800 ms**) → Close all windows (process may remain in memory).
    - If all windows are minimized, use optimized `closeAllFast` without restoring them first.  
      **LED:** 🔴 blink (~600 ms) → 🔻 dim red.

> **Gesture thresholds:**
> - Double-tap: 480 ms
> - Long-press: 800 ms
> - Bounce (debounce between presses): 28 ms
> - Cooldown after gesture: 0 ms

---

## 2. LED States

| State             | LED            | Meaning                                                        |
|-------------------|----------------|----------------------------------------------------------------|
| Unassigned        | ⚫ off          | No app mapped.                                                 |
| Assigned inactive | 🔻 dimRed      | App mapped but not running or running without visible windows. |
| Background        | 🟢 dimGreen    | Running with visible windows, unfocused.                       |
| Focused           | 🟩 green       | Active and focused.                                            |
| Minimized         | 🟨 yellow      | All windows minimized.                                         |
| Launching         | 🟩 blink       | While starting.                                                |
| Focusing          | 🟩 solid       | Immediately after focus.                                       |
| Minimizing        | 🟧 amber blink | While minimizing.                                              |
| Closing           | 🔴 blink       | Before going inactive.                                         |
| Error             | 🟥 solid       | Action failed.                                                 |

> **Note:** Actual LED values are stored in centralized constants (`LedStateColors`) for implementation.

---

## 3. LED Rules

- **Blink** = action in progress (300–500 ms, except closing ≈ 600 ms).
- **Solid** = stable state.
- **Assigned inactive** = 🔻 dim red (no windows or not running).
- **Close transition:** 🔴 blink → 🔻 dim red.
- **Minimize transition:** 🟧 amber blink → 🟨 yellow solid.

---

## 4. Latency & Sync

- **Pad press reaction:** ≤ 50 ms (optimistic update).
- **Post-action repaint:** **90 ms** after action (`pokeMs`).
- **External changes:** Sync every **140 ms** (fixed interval).
- **Conflict resolution:** If OS state and internal state disagree, OS state overrides immediately.
- **Debounce:** 300–800 ms after certain actions to avoid flicker.
- **Safe startup:** Query all mapped apps and set LEDs **before** processing any MIDI input.
- **Error handling:** 🟥 solid and log error with context.

---

## 5. Animation Timing

- **Boot animation:** 2000 ms total, step = 22 ms (~45 FPS), uses all pads.
- **Shutdown animation:** 1000 ms total, 3 passes, trail length = 4, final hold = 120 ms.

---

## 6. Implementation Notes

- Abstract MIDI mapping for portability across Launchpad models.
- Centralize LED color constants to avoid inconsistencies.
- Gesture, controller mask, sync, and animation timings are defined in `src/config/timings.js`.
- State polling: fixed at 140 ms for balance between responsiveness and CPU usage.
- All operations must be **non-blocking** to prevent input lag.
