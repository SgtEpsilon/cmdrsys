# CMDRSYS Android — Elite Dangerous Navigation Interface
### React + Capacitor — v2.0.0

---

## What's New in the Android Version

| Feature | Electron (Desktop) | Android (This App) |
|---|---|---|
| Storage | SQLite via IPC | localStorage / Capacitor Preferences |
| Journal | Live file watcher | Manual `.log` file import |
| Platform | Windows/Mac/Linux | Android 6.0+ |
| Navigation | Sidebar | Bottom navigation bar |
| Window controls | Custom titlebar | Native Android |

---

## Prerequisites

- **Node.js** v18 or newer
- **Android Studio** (Hedgehog or newer)
- **Android SDK** API level 23+ (Android 6.0)
- **Java 17**
- **Capacitor CLI**: `npm install -g @capacitor/cli`

---

## Quick Start — Web Dev Mode

```bash
# 1. Install dependencies
npm install

# 2. Run in browser for development
npm run dev
```

Open `http://localhost:5173` in your browser. All features work in the browser
using localStorage.

---

## Build & Run on Android

```bash
# 1. Install dependencies
npm install

# 2. Build the web assets
npm run build

# 3. Sync to Android project
npx cap sync android

# 4. Open in Android Studio
npx cap open android
```

In Android Studio:
- Wait for Gradle sync to complete
- Select your device or emulator
- Click **Run ▶**

---

## Project Structure

```
cmdrsys-android/
├── src/
│   ├── App.jsx                  # Root component, layout, routing
│   ├── main.jsx                 # React entry point
│   ├── styles/
│   │   └── globals.css          # ED theme, starfield, fonts
│   ├── components/
│   │   ├── UI.jsx               # Shared: Btn, Panel, Modal, FormInput...
│   │   ├── HologramPlanet.jsx   # Three.js animated planet
│   │   ├── BottomNav.jsx        # Android bottom navigation bar
│   │   ├── Toast.jsx            # Toast notifications
│   │   ├── Dashboard.jsx        # Overview screen
│   │   ├── LogsView.jsx         # Commander's Log (CRUD)
│   │   ├── BookmarksView.jsx    # System Bookmarks (CRUD)
│   │   ├── VisitedView.jsx      # Visited Systems
│   │   └── SettingsView.jsx     # Settings, Import, Export
│   ├── hooks/
│   │   └── useStore.js          # Global state (all data ops)
│   └── utils/
│       ├── storage.js           # localStorage abstraction
│       └── edDate.js            # Elite Dangerous date format
├── android/                     # Native Android project
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/cmdrsys/MainActivity.java
│   │       └── res/values/styles.xml
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradle.properties
├── capacitor.config.ts          # Capacitor configuration
├── vite.config.js               # Vite build config
├── package.json
└── index.html
```

---

## Journal Import Workflow

Since Elite Dangerous only runs on PC, the Live Journal Feed is replaced with
a manual import feature:

1. On your PC, navigate to:
   ```
   %USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous\
   ```
2. Copy your latest `Journal.YYYY-MM-DDTHHMMSS.XX.log` file to your Android
   device (via USB, cloud sync, or email)
3. In CMDRSYS → Settings → **Import Journal .log File**
4. CMDRSYS will parse all FSD jumps, auto-detect your CMDR name and ship,
   and populate your Visited Systems list

---

## Upgrading Storage to Capacitor Preferences (Production)

For a true native app, replace localStorage in `src/utils/storage.js` with the
Capacitor Preferences plugin:

```js
import { Preferences } from '@capacitor/preferences';

export const storage = {
  async get(key) {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  },
  async set(key, value) {
    await Preferences.set({ key, value: JSON.stringify(value) });
    return true;
  },
  async remove(key) {
    await Preferences.remove({ key });
    return true;
  },
};
```

This gives you encrypted, OS-level secure storage on Android instead of the
WebView's localStorage.

---

## Data Backup & Restore

Use **Settings → Export JSON** to create a full backup of:
- Commander's Log entries
- System Bookmarks  
- Visited Systems
- Commander profile

Use **Import JSON** to restore on any device (Android or desktop Electron version).

The JSON format is fully compatible with the original Electron CMDRSYS app.

---

## Building a Release APK

```bash
# 1. Build web assets
npm run build

# 2. Sync to Android
npx cap sync android

# 3. Open Android Studio
npx cap open android

# In Android Studio: Build → Generate Signed Bundle/APK
```

---

## ED Date Format

All timestamps are displayed in Elite Dangerous Galactic Standard time,
with the year offset of +1286 applied (current year 3312 in-universe).
