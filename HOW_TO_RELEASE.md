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

You can do this either **entirely from the command line** (Steps below) or
**using Android Studio's GUI** if you'd rather click buttons than type
commands — see "Using Android Studio instead" further down. Either way, do
Step 1 and Step 2 first.

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

---

## Using Android Studio instead (build, test, and sign with clicks, not commands)

This does the exact same thing as Steps 3–4 above, but through the Android
Studio interface. Do this **after** you've done Step 1 (code changes) and
Step 2 (bump `versionCode`/`versionName`) above — those two don't change.

### A) Sync your web changes into the Android project
Every time you change anything outside the `android/` subfolder (i.e. the
React/JS app, not native Android files), you need to rebuild the web bundle
first, or Android Studio will just be testing/signing your *old* code. Open
PowerShell in `Android/` and run:
```
npm run build
npx cap sync android
```
Then open (or switch to) Android Studio.

### B) Test it first — run on your phone or an emulator
Before making a release build, it's worth actually running the app to check
your changes work:
1. Plug your phone in via USB with **USB debugging** enabled (Settings →
   Developer Options → USB debugging — if you don't see Developer Options,
   tap "Build number" in About Phone 7 times to unlock it), or start an
   emulator from Android Studio's **Device Manager** (top-right toolbar icon
   that looks like a phone).
2. Pick your phone/emulator from the device dropdown in the toolbar (next to
   the green ▶ Run button).
3. Click the green ▶ **Run** button. Android Studio builds a debug version
   and installs it straight onto the selected device.
4. Poke around, confirm it works the way you expect.

This debug build is just for testing — it's not the signed release version,
and installing it won't interfere with your signed version already on the
phone (they're allowed to coexist since debug builds use a `.debug` package
suffix — see `applicationIdSuffix ".debug"` in `build.gradle`).

### C) Build and sign the release APK
Once you're happy it works:
1. Menu bar → **Build → Generate Signed Bundle / APK…**
2. Choose **APK** (not "Android App Bundle"), click **Next**.
3. Android Studio should offer to remember your keystore from before. If it
   asks you to browse for one, point it at
   `Android/android/cmdrsys-release.keystore` and enter the store password,
   key alias (`cmdrsys`), and key password from your
   `keystore.properties` file.
   **Do not click "Create new..." here** — that would generate a brand-new
   keystore, and your next release would then fail to update over this one
   (see Troubleshooting: "installs as a second, separate app"). Always
   reuse the same existing keystore file.
4. Click **Next**. Choose the **release** build variant, and check **V1
   and V2** signature versions if asked (both ticked is the safe default).
5. Click **Create/Finish**. Android Studio will show a notification bottom-right
   when it's done, with a **"locate"** link — click that to jump straight to
   the folder containing your signed APK.

The signed APK ends up in the same place as the command-line method:
`Android/android/app/build/outputs/apk/release/app-release.apk` — so Step 5
and Step 6 above (getting it onto your phone and installing) are identical
either way.

---

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

**Android Studio's "Generate Signed Bundle/APK" dialog won't accept your keystore, or says the password is wrong**
→ Double-check you're typing the passwords exactly as they appear in
`Android/android/keystore.properties` — copy-paste them rather than typing,
since these are case-sensitive.

**You accidentally clicked "Create new..." in the signing dialog and made a new keystore**
→ Delete the new keystore file it created and redo Part C, this time browsing
to your existing `cmdrsys-release.keystore` instead. If you already built and
installed an APK signed with the new one, see "installs as a second, separate
app" above.

## Android quick reference

**Command line:**
```
# 1. Bump versionCode (+1) and versionName in Android/android/app/build.gradle
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
# 2. Grab android/app/build/outputs/apk/release/app-release.apk, send to phone, tap to install
```

**Android Studio:**
```
# 1. Bump versionCode (+1) and versionName in Android/android/app/build.gradle
npm run build
npx cap sync android
# 2. Open Android Studio → ▶ Run on phone/emulator to test
# 3. Build → Generate Signed Bundle/APK… → APK → pick existing cmdrsys-release.keystore → release variant
# 4. Click "locate" on the finish notification, send that APK to phone, tap to install
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

