# CMDRSYS — Idiot's Guide to Updating & Releasing (Android + PC)

Keep this file. Every time you want to push a new version — to your phone,
your PC, or both — come back here and follow the matching section top to
bottom. Do the steps **in order**, don't skip any.

There are two completely separate apps built from this one project:
- **Android** (`Android/` folder) → produces an `.apk` you install on your phone
- **PC / Electron** (`Electron/` folder) → produces a Windows installer `.exe`

Update one, the other, or both — they don't depend on each other.

---

# PART 1 — ANDROID

## One-time setup (only ever do this once)

You should have already done this — skip to "Every time you release" below if so.

1. Generate a keystore (a file that "signs" your app so Android trusts updates):
   ```
   keytool -genkeypair -v -keystore cmdrsys-release.keystore -alias cmdrsys -keyalg RSA -keysize 2048 -validity 10000
   ```
   Run this **inside** `Android/android/`. It'll ask you to make up two passwords
   and some name/org info — the name/org doesn't matter, just hit enter through
   those or type anything. **The passwords matter — write them down somewhere safe.**

2. Copy `keystore.properties.example` → `keystore.properties` (same folder,
   `Android/android/`), open it, and fill in the passwords/alias you just chose.

3. **Back up `cmdrsys-release.keystore` and the two passwords** — a password
   manager, a note in a safe place, whatever. If you lose them, you can never
   update the installed app again — ever. You'd have to uninstall it from your
   phone first (losing all its local data) and start over as a "new" app.

If either `cmdrsys-release.keystore` or `keystore.properties` is missing, the
build will still run but the APK it makes **won't be signed properly** — see
Troubleshooting below.

## Every time you want to release an Android update

### Step 1 — Make your code changes
Edit whatever files you're changing as normal.

### Step 2 — Bump the version number
Open `Android/android/app/build.gradle`. Find this block:
```
versionCode 2
versionName "2.3.2"
```
- `versionCode` — **go up by exactly 1** every single time (2 → 3 → 4 → ...).
  This is the number Android actually checks. If you forget this step, Android
  will refuse to install your new APK over the old one.
- `versionName` — this is just the text people see (like "2.3.3"). Bump it too
  so it's easy for you to tell versions apart, but it doesn't affect whether
  the update works.

### Step 3 — Build it
Open PowerShell in `Android/` (the folder with `package.json`, not the `android`
subfolder) and run these commands one at a time, waiting for each to finish:

```
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

This takes a minute or two. If it ends with `BUILD SUCCESSFUL`, you're good —
skip to Step 4. If it shows red errors, jump to Android Troubleshooting below.

### Step 4 — Find the APK file
It'll be here:
```
Android/android/app/build/outputs/apk/release/app-release.apk
```

### Step 5 — Get it onto your phone
Any of these work:
- Email it to yourself and open the attachment on your phone
- Upload to Google Drive / Dropbox and download it on your phone
- Plug the phone into your PC with USB and copy the file over directly

### Step 6 — Install it
On your phone, open the APK file (e.g. tap it in your Downloads folder or in
the Gmail attachment). Android will show an "Update" screen (not "Install
new app") — that's how you know it worked. Tap through, done.

Your existing data (bookmarks, logs, settings) stays exactly as it was —
updating never wipes anything.

## Android Troubleshooting

**"App not installed" or it installs as a second, separate app instead of updating**
→ The signing certificate doesn't match the one already on your phone. This
means `keystore.properties` is missing/wrong, or you're using a different
keystore file than last time. Go back to the one-time setup section — you
must reuse the *exact same* `.keystore` file forever.

**Install screen doesn't say "Update", or Android complains about downgrading**
→ You forgot Step 2 (bump `versionCode`). Go bump it and rebuild.

**`gradlew` fails with "Could not reserve enough space for object heap" or
mentions a 32-bit `jre1.8...`**
→ Gradle is using the wrong Java. Open `Android/android/gradle.properties`
and check the `org.gradle.java.home=` line points at Android Studio's bundled
JDK (check in Android Studio: File → Settings → Build, Execution, Deployment
→ Build Tools → Gradle → "Gradle JDK" dropdown shows the correct path — copy
it in exactly, forward slashes).

**Any other red error during `./gradlew assembleRelease`**
→ Copy the full error text and send it over — paste the whole thing, not just
the last line.

## Android quick reference

```
# 1. Bump versionCode (+1) and versionName in Android/android/app/build.gradle
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
# 2. Grab android/app/build/outputs/apk/release/app-release.apk, send to phone, tap to install
```

---

# PART 2 — PC (ELECTRON / WINDOWS)

Good news: the PC side is simpler. It uses an installer (NSIS) which already
knows how to update an existing install — no keystore, no version-matching
gotchas like Android. You just need to bump the version number so you (and
the installer) can tell builds apart.

## Every time you want to release a PC update

### Step 1 — Make your code changes
Edit whatever files you're changing in `Electron/` as normal.

### Step 2 — Bump the version number
Open `Electron/package.json`. Find this line near the top:
```
"version": "2.3.1",
```
Bump it (e.g. `"2.3.2"`). Doesn't have to be the exact same number as the
Android version, but keeping them roughly in step makes it easier to
remember what's what.

### Step 3 — Build the installer
Open PowerShell in `Electron/` and run:
```
npm install
npm run build:win
```
This takes a minute or two. If it fails, jump to PC Troubleshooting below.

### Step 4 — Find the installer
It'll be inside a new `dist/` folder in `Electron/`, named something like:
```
Electron/dist/CMDRSYS Setup 2.3.2.exe
```

### Step 5 — Install it
Just double-click that `.exe` and click through the installer as normal — on
the same PC that already has CMDRSYS installed, it detects the existing
install and **updates it in place**. Your database and settings are untouched.

If you want to put it on a *different* PC for the first time, copy that same
`.exe` over and run it there — same installer works for both first installs
and updates.

## PC Troubleshooting

**`npm run build:win` fails immediately with a missing module error**
→ Run `npm install` again inside `Electron/` first, then retry the build.

**Windows SmartScreen shows a blue "Windows protected your PC" warning**
→ Expected — this app isn't code-signed with a paid certificate. Click "More
info" → "Run anyway". This doesn't affect updating; it happens on any unsigned
installer.

**The old version doesn't fully close / you get a "file in use" error during install**
→ Close the CMDRSYS desktop app completely before running the new installer
(check it's not still sitting in the system tray).

**Any other red error during the build**
→ Copy the full error text and send it over — paste the whole thing, not just
the last line.

## PC quick reference

```
# 1. Bump "version" in Electron/package.json
cd Electron
npm install
npm run build:win
# 2. Run the resulting Electron/dist/CMDRSYS Setup <version>.exe — same PC = auto-update
```

