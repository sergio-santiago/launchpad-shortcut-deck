# 🎛 Launchpad Shortcut Deck

Turn your [**Novation Launchpad**](https://novationmusic.com/launchpad) into a macOS shortcut deck with **real-time LED
feedback**.  
Assign buttons to apps and control them instantly (launch, focus, minimize, or close windows) with LEDs that always
stay in sync with your system.

> Inspired by the idea of a *Stream Deck*, but using MIDI hardware and open-source software.

---

## 💡 How It Works

- Each button can be mapped to a macOS application.
- Actions trigger with minimal latency and always stay in sync with the system’s actual state.
- LED colors indicate the app's current state in real time.

For detailed LED behavior and interaction rules, see [**Technical Specification**](docs/spec.md).

---

## 📦 Requirements

- macOS (tested on Apple Silicon, should work on Intel).
- Node.js **22.x LTS**  
  *(recommended to install with [nvm](https://github.com/nvm-sh/nvm)) or [fnm](https://github.com/Schniz/fnm)*
- [pnpm](https://pnpm.io/) as the package manager.
- A [**Novation Launchpad**](https://novationmusic.com/launchpad) connected via USB.  
  *Developed and tested with a Launchpad S model.*
- [**Hammerspoon**](https://www.hammerspoon.org) — required for macOS app control (see [setup below](#-hammerspoon-setup-required-for-macos-app-control)).

---

## 🛠 Installation

```bash
git clone git@github.com:sergio-santiago/launchpad-shortcut-deck.git
cd launchpad-shortcut-deck

# Set correct Node version
nvm use # or fnm use

# Install dependencies
pnpm install
pnpm approve-builds # allow @julusian/midi to build
```

### 🔨 Hammerspoon Setup (Required for macOS app control)

To let the Launchpad open, close, minimize, and maximize macOS apps, this project uses a lightweight local backend
powered by [**Hammerspoon**](https://www.hammerspoon.org).

#### 1. Install Hammerspoon

```bash
brew install --cask hammerspoon
```

#### 2. Link the provided configuration

This repo includes a configuration file at [
`hammerspoon/launchpad-shortcut-deck/init.lua`](hammerspoon/launchpad-shortcut-deck/init.lua).
> This file contains the Lua API used by the app to control macOS apps and windows.

You need to copy or symlink it into your Hammerspoon config folder:

```bash
mkdir -p ~/.hammerspoon/launchpad-shortcut-deck

# Option A — symlink (preferred, keeps in sync with repo)
ln -sfn "$(pwd)/hammerspoon/launchpad-shortcut-deck/init.lua" ~/.hammerspoon/launchpad-shortcut-deck/init.lua

# Option B — copy (static)
cp ./hammerspoon/launchpad-shortcut-deck/init.lua ~/.hammerspoon/launchpad-shortcut-deck/init.lua
```

#### 3. Then ensure your `~/.hammerspoon/init.lua` loads the module:

```lua
require('launchpad-shortcut-deck')
```

> ⚠ If you already have a custom `~/.hammerspoon/init.lua`, the line above must be present somewhere in it so the module
> loads.  
> ℹ This repo also includes a file at [`hammerspoon/init.lua`](./hammerspoon/init.lua) **only as an example** — it will
> not run by itself. Use it as a reference if you need to integrate the module into an existing config.

You can automate this step with:

```bash
# Ensure ~/.hammerspoon/init.lua contains the require line (add only if missing)
grep -qxF "require('launchpad-shortcut-deck')" ~/.hammerspoon/init.lua 2>/dev/null || echo "require('launchpad-shortcut-deck')" >> ~/.hammerspoon/init.lua
```

---

## 🚀️ Usage

Start the app:

```bash
pnpm start
```

> The app will check if Hammerspoon is running and attempt to launch it if not found.
> On the first run, you may need to grant Accessibility permissions to Hammerspoon when prompted by macOS.

### 🧪 Manual app-control test

You can verify macOS application control via Hammerspoon by running:

```bash
pnpm test:hammerspoon
```

This command will open, focus, minimize, maximize, toggle fullscreen,
close all windows while keeping the app running, re-open a window,
and finally quit each app listed in the `APPS` constant inside
`tests/hammerspoon-integration.test.js`.  
You can edit that array to select which apps to test.

> ⚠️ **Warning:** Running this test will actively open and close apps on your machine.

### ❗ Troubleshooting

- **`HS_FUNCS_MISSING: ...`**  
  Hammerspoon started but the Lua API wasn’t loaded yet. Ensure:
    - The symlink/copy is correct:  
      `~/.hammerspoon/launchpad-shortcut-deck/init.lua`
    - `~/.hammerspoon/init.lua` contains:  
      `require('launchpad-shortcut-deck')`
    - Reload Hammerspoon config (menu bar icon → *Reload Config*).

- **Actions fail for window operations (minimize/maximize/fullscreen/close):**  
  Grant Hammerspoon **Accessibility** permission:  
  *System Settings → Privacy & Security → Accessibility*.

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0 or later** – see the [LICENSE](LICENSE) file for
details.
