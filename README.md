# CMDRSYS — Elite Dangerous Navigation Interface
### Electron App — v1.0.0

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)

### Install & Run
```bash
# 1. Unzip and enter the folder
cd cmdrsys

# 2. Install dependencies
npm install

# 3. Launch the app
npm start
```

---

## Building a Distributable

```bash
# Windows (.exe installer)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux
```

Builds output to the `dist/` folder.

---

## Database

Data is stored in a **SQLite database** (`cmdrsys.db`) in Electron's `userData` directory:

| Platform | Location |
|----------|----------|
| Windows  | `%APPDATA%\cmdrsys\cmdrsys.db` |
| macOS    | `~/Library/Application Support/cmdrsys/cmdrsys.db` |
| Linux    | `~/.config/cmdrsys/cmdrsys.db` |

Use **Settings → Export JSON** to back up your data. Use **Import JSON** to restore it on another machine.

---

## Journal File Location

Elite Dangerous writes journal files to:

```
Windows: %USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous\
```

Select the latest `Journal.YYYY-MM-DDTHHMMSS.XX.log` file from the **Live Journal** tab.
CMDRSYS will parse all existing events and then watch the file live as you play.

---

## Features

- **Commander's Log** — write dated log entries with system, body, and tags
- **System Bookmarks** — save POIs, trade hubs, mining sites, etc. with coordinates
- **Live Journal Feed** — parses your ED journal file in real-time
- **Visited Systems** — auto-tracked from journal FSD jump events
- **Export / Import** — full JSON backup and restore
- **ED Date Format** — all dates displayed in Elite Dangerous calendar (year + 1286)
- **Custom Titlebar** — frameless window with native minimize/maximize/close
- **SQLite Database** — all data stored persistently and safely
