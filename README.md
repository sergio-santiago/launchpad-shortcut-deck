# 🎛 Launchpad Shortcut Deck

Turn your **Novation Launchpad** into a macOS shortcut deck with **real-time LED feedback**.  
Assign buttons to apps and control them instantly — launch, focus, minimize, or close windows — with LEDs that always
stay in sync with your system.

> Inspired by the idea of a *Stream Deck*, but using MIDI hardware and open-source software.

---

## 📜 How It Works

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

---

## 🛠 Installation

```bash
git clone git@github.com:sergio-santiago/launchpad-shortcut-deck.git
cd launchpad-shortcut-deck

# Set correct Node version
nvm use 22    # or fnm use

# Install dependencies
pnpm install
pnpm approve-builds   # allow @julusian/midi to build
```

---

## ▶️ Usage

Start the app:

```bash
pnpm start
```

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0 or later** – see the [LICENSE](LICENSE) file for
details.
