<div align="center">

<img src="https://img.shields.io/badge/Elite%20Dangerous-F4A800?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwMCIgZD0iTTEyIDJMMyAyMGgxOEwxMiAyeiIvPjwvc3ZnPg==&logoColor=black" alt="Elite Dangerous"/>
<img src="https://img.shields.io/badge/version-2.0.1-00D4FF?style=for-the-badge" alt="Version"/>
<img src="https://img.shields.io/badge/platform-Electron%20%7C%20Android-4A90D9?style=for-the-badge" alt="Platform"/>

```
 ██████╗███╗   ███╗██████╗ ██████╗     ███████╗██╗   ██╗███████╗
██╔════╝████╗ ████║██╔══██╗██╔══██╗    ██╔════╝╚██╗ ██╔╝██╔════╝
██║     ██╔████╔██║██║  ██║██████╔╝    ███████╗ ╚████╔╝ ███████╗
██║     ██║╚██╔╝██║██║  ██║██╔══██╗    ╚════██║  ╚██╔╝  ╚════██║
╚██████╗██║ ╚═╝ ██║██████╔╝██║  ██║    ███████║   ██║   ███████║
 ╚═════╝╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝    ╚══════╝   ╚═╝   ╚══════╝
```

### *A glorified note-taking app for Elite Dangerous*
### *For Commanders who refuse to forget anything*

---

</div>

## 🚀 What is CMDR SYS?

**CMDR SYS** is your personal mission log, intel tracker, and route planner — built for Elite Dangerous Commanders who need to keep track of the galaxy without tabbing out of the cockpit. The **Desktop app** (Electron) reads your Elite Dangerous journal files in real time and serves as the hub, while the **Android app** (React + Capacitor) stays in sync over WiFi so your data is always at your fingertips.

> *"In a galaxy of 400 billion star systems, you're going to need a notepad."*

---

## ✨ Features

### 🖥️ Desktop (Electron)

| Feature | Description |
|---|---|
| 📋 **Commander's Log** | Write and tag mission notes, intel entries, and objectives — searchable and filterable by tag |
| 🔖 **Bookmarks** | Save systems with type, coordinates (lat/lon/z), notes, and tags — displayed in a filterable grid |
| 🌍 **Visited Systems** | Automatically tracked from your journal; searchable list of every system you've jumped to |
| 🪐 **Body Notes** | Log planetary body data: type, star class, atmosphere, gravity, landability, bio/geo signals, terraform status, distance, estimated value, and personal notes |
| 📡 **Live Journal Feed** | Watches your Elite Dangerous journal directory in real time, displaying events as they happen and auto-populating visited systems |
| ⚡ **Neutron Plotter** | Integrated Spansh neutron route planner — enter source, destination, jump range and efficiency; displays full waypoint list with progress tracking |
| ◎ **Tourist Planner** | Spansh tourist route planner — set a starting system, optional destination, and up to N waypoints (bookmarks or manual entry); displays a results table with jumps and distance per stop |
| 🔄 **WiFi Sync Server** | Built-in HTTP sync server on your local network; the Android app pulls/pushes logs, bookmarks, and body notes over WiFi. Supports optional auth token and interface selection |
| 💾 **Export / Import** | Full JSON export and import for backup or migration between machines |
| 🛠️ **Settings** | Set Commander name, ship name/type; view database record counts; configure sync server IP, port, and token |

### 📱 Android (React + Capacitor)

| Feature | Description |
|---|---|
| 📋 **Commander's Log** | View, create, edit, and delete log entries synced from desktop |
| 🔖 **Bookmarks** | Browse, add, and delete bookmarks with the same tag system as desktop |
| 🌍 **Visited Systems** | Browse all visited systems on mobile |
| 🪐 **Body Notes** | View and manage planetary body notes on the go |
| 📊 **Dashboard** | Overview of your key stats — log count, bookmarks, visited systems |
| 🌐 **Sync Service** | Connects to the Desktop sync server over WiFi; pulls down all data and pushes local changes back |
| 🎨 **Elite-themed UI** | Dark, immersive HUD-style interface with animated hologram planet, matching the Desktop app aesthetic |

---

## 📦 Installation

### 🖥️ Desktop (Electron)

```bash
# Clone the repository
git clone https://github.com/SgtEpsilon/cmdrsys.git

# Navigate to the Electron directory
cd cmdrsys/Electron

# Install dependencies
npm install

# Run the app
npm start
```

To build a distributable:

```bash
npm run build:win    # Windows (.exe installer)
npm run build:mac    # macOS (.dmg)
npm run build:linux  # Linux (.AppImage)
```

> 💡 On first launch, CMDR SYS will ask you to select your Elite Dangerous journal directory (usually `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`).

### 📱 Android

The prebuilt release APK is available in `android/app/release/cmdrsys-v2.0.apk`.

To build from source:

```bash
# Navigate to the Android directory
cd cmdrsys/Android

# Build and run (see android build and run.txt for full instructions)
```

> 💡 See [`android build and run.txt`](./android%20build%20and%20run.txt) in the root for full Android build instructions.

---

## 🔄 WiFi Sync Setup

CMDR SYS uses a local HTTP server on the Desktop to keep both apps in sync over your home network. No cloud required.

1. Open the Desktop app and go to **Settings → Sync Server**
2. Select your network interface and note the displayed sync URL (e.g. `http://192.168.1.x:PORT`)
3. Open the Android app, go to **Settings**, and enter the sync URL
4. Tap **Sync** — the Android app will pull all data from Desktop and push any local changes back
5. *(Optional)* Set an auth token in both apps for added security

> The Desktop app displays the last sync timestamp so you always know when data was last received from Android.

---

## 🛸 Releases

| Version | Codename | Date |
|---|---|---|
| 🟢 **v2.0.1** *(Latest)* | Data Transfer Complete | March 2026 |
| v1.x | Earlier Versions | — |

➡️ [**Download the latest release →**](https://github.com/SgtEpsilon/cmdrsys/releases/latest)

---

## 🛠️ Built With

### Desktop
![Electron](https://img.shields.io/badge/Electron_29-Desktop-47848F?style=flat-square&logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![SQLite](https://img.shields.io/badge/sql.js-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![HTML](https://img.shields.io/badge/HTML%2FCSS-UI-E34F26?style=flat-square&logo=html5&logoColor=white)

### Android
![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black)
![Capacitor](https://img.shields.io/badge/Capacitor-Native-119EFF?style=flat-square&logo=capacitor&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-Build-646CFF?style=flat-square&logo=vite&logoColor=white)
![Android](https://img.shields.io/badge/Android-Mobile-3DDC84?style=flat-square&logo=android&logoColor=white)

---

## 📁 Project Structure

```
cmdrsys/
├── 📂 Electron/                    # Desktop app
│   ├── main.js                     # Main process: DB, journal watcher, sync server
│   ├── preload.js                  # IPC bridge
│   ├── renderer/
│   │   └── index.html              # Single-file renderer (UI, styles, all logic)
│   └── package.json
│
├── 📂 Android/                     # Android app (React + Capacitor)
│   ├── src/
│   │   ├── App.jsx                 # Root app component & navigation
│   │   ├── main.jsx
│   │   ├── components/
│   │   │   ├── Dashboard.jsx       # Stats overview
│   │   │   ├── LogsView.jsx        # Commander's log
│   │   │   ├── BookmarksView.jsx   # Bookmarks grid
│   │   │   ├── VisitedView.jsx     # Visited systems list
│   │   │   ├── BodyNotesView.jsx   # Planetary body notes
│   │   │   ├── SettingsView.jsx    # Sync config & preferences
│   │   │   ├── BottomNav.jsx       # Navigation bar
│   │   │   ├── HologramPlanet.jsx  # Animated planet UI element
│   │   │   ├── Toast.jsx           # Toast notifications
│   │   │   └── UI.jsx              # Shared UI components
│   │   ├── hooks/
│   │   │   └── useStore.js         # Global state management
│   │   └── utils/
│   │       ├── syncService.js      # WiFi sync client
│   │       ├── storage.js          # Local persistence
│   │       └── edDate.js           # Elite Dangerous date formatting
│   ├── android/                    # Native Android project (Gradle)
│   │   └── app/release/
│   │       └── cmdrsys-v2.0.apk    # Release APK
│   └── vite.config.js
│
├── 📄 android build and run.txt    # Android build guide
└── 📄 README.md
```

---

<img width="1280" height="820" alt="image" src="https://github.com/user-attachments/assets/68bd225b-e3bf-4eb3-b962-1fd0bad87b00" />
<img width="1280" height="820" alt="image" src="https://github.com/user-attachments/assets/76179743-5007-462f-b8bf-d3b53f288afd" />
<img width="1280" height="820" alt="image" src="https://github.com/user-attachments/assets/d7f690a2-823a-42ea-b0e9-494646b5f90a" />
<img width="1280" height="820" alt="image" src="https://github.com/user-attachments/assets/3da97e72-7dd1-4b3f-b4ef-ce11f074d029" />
<img width="1280" height="820" alt="image" src="https://github.com/user-attachments/assets/02daaa5d-32dd-4883-9566-2fb84adfd402" />
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/2345daa4-b729-4da2-89dd-f46cdcd43acc" />

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add NewFeature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## 📜 License

This project is open source. See the repository for details.

---

<div align="center">

**Good luck out there, Commander. o7**

*Made with ❤️ by [SgtEpsilon](https://github.com/SgtEpsilon)*

</div>
