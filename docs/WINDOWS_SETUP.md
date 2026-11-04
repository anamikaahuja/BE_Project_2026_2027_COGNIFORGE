# Building COGNIFORGE on Windows

This is the step-by-step path from a fresh Windows laptop to a running
backend, a running desktop app, and a compiled VR/AR APK. Everything in
this repo is cross-platform (Node/Python/Gradle), so nothing here is a
workaround — it's the same build every other platform runs, just with
Windows-specific commands where they differ (mainly: activating a Python
venv, and where electron-builder puts a Windows installer instead of a
`.dmg`).

## 1. Install prerequisites

| Tool | Why | Get it |
|---|---|---|
| **Git for Windows** | clone the repo | https://git-scm.com/download/win |
| **Node.js 18+ (LTS)** | frontend, and all three apps | https://nodejs.org — installer adds `npm` automatically |
| **Python 3.10+** | backend | https://www.python.org/downloads/windows/ — **check "Add python.exe to PATH"** in the installer |
| **Android Studio** | VR + AR APK builds | https://developer.android.com/studio |

You don't need to separately install a JDK or the Android SDK command-line
tools — Android Studio bundles its own JDK and manages the SDK for you
through its own installer wizard and SDK Manager. That's the difference
from how this project was built in its primary dev environment (a
command-line-only Android SDK setup, documented in the paper's Section 4,
chosen there specifically to avoid a full Android Studio install's disk
footprint). On a normal Windows laptop, Android Studio is the easier path
and is what these instructions assume.

Skip the Android Studio install if you only want to run the backend,
frontend, and desktop app.

## 2. Clone the repo

```powershell
git clone https://github.com/AdityaPathare46/COGNIFORGE.git
cd COGNIFORGE
```

## 3. Backend

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Leave this running — it serves `http://localhost:8000`. In a new terminal,
confirm it's alive:

```powershell
curl http://localhost:8000/tasks
```

You should get back JSON listing the five task scenarios. If you'd rather
verify with the actual test suite:

```powershell
venv\Scripts\activate
pytest                                # 23 tests
python -m evaluation.run_benchmark    # re-runs the real benchmark, writes evaluation/results.json
```

`pybullet` (physics-engine collision validation) is optional — everything
in `requirements.txt` installs without it, and the collision validator
falls back to an equivalent analytic check automatically when it's absent.
If you want the physics-engine path specifically, try
`pip install pybullet` separately; unlike on the macOS setup this project
was primarily developed on (which hit a real macOS-SDK/clang incompatibility
in pybullet's bundled zlib shim — see `backend/requirements-optional.txt`),
Windows has prebuilt wheels for common Python versions and it may just work.

## 4. Frontend (browser)

New terminal, backend still running:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Move the mouse over the robot — the arm
should track it in real time.

## 5. Desktop app (Electron)

```powershell
cd apps\desktop
npm install
npm start          # launches it directly, for testing
```

To produce a real installer:

```powershell
npm run dist
```

This builds the frontend, copies it into `frontend-dist\`, and runs
`electron-builder`. `package.json`'s `build.win.target` is already set to
`nsis`, so on Windows this produces `apps\desktop\release\COGNIFORGE Setup <version>.exe`
— a normal Windows installer, not a `.dmg` (that's macOS-only; Linux gets
an `AppImage` the same way). No code-signing certificate is configured, so
Windows SmartScreen will show an "unrecognized app" warning the first time
it's run — click **More info → Run anyway**. This is expected for an
unsigned installer, not a build error.

## 6. VR app (Meta Quest APK)

```powershell
cd apps\vr
npm install
npm run sync            # builds the VR-tailored frontend, copies it into android\
npm run open:android    # opens android\ in Android Studio
```

The first time Android Studio opens the project it will run a Gradle sync
automatically (downloading the Android SDK platform/build-tools it needs —
this can take a few minutes on first run). Once sync finishes:

- **Build → Build Bundle(s) / APK(s) → Build APK(s)** produces a debug APK
  under `apps\vr\android\app\build\outputs\apk\debug\`.
- To install directly on a Quest connected over USB with Developer Mode
  enabled (via the Meta Quest mobile app): click the green **Run** button
  in Android Studio with the headset selected as the target device, or
  `adb install app-debug.apk` from that output folder.

## 7. AR app (native ARCore, Android phone)

**Read this before building AR specifically:** this app's real functionality
is a native Kotlin/ARCore implementation
(`apps/ar/android/app/src/main/java/com/cogniforge/ar/ar/NativeArActivity.kt`),
*not* a WebXR page running inside the Capacitor WebView. That distinction
matters because Capacitor's embedded WebView cannot run WebXR's
`immersive-ar` session at all — it's tied to the real Chrome app process,
which a generic `android.webkit.WebView` isn't. The app's launcher activity
is `NativeArActivity`, a hand-written OpenGL renderer with real camera
passthrough; opening it does not show a browser page, it opens the phone's
camera directly with the robot arm overlaid on it. See the research paper's
Section 5.1 for the full story of how this was discovered and rebuilt.

```powershell
cd apps\ar
npm install
npm run sync            # still needed: keeps the iOS fallback build (see below) in sync
npm run open:android    # opens android\ in Android Studio
```

Same as the VR app: let Gradle sync finish, then **Build → Build Bundle(s) /
APK(s) → Build APK(s)**, or **Run** with a phone connected over USB (enable
Developer Options → USB Debugging on the phone first). The app needs
**ARCore** ("Google Play Services for AR") installed on the target phone —
Play Store handles this automatically on any ARCore-certified device the
first time the app requests it.

*Why `npm run sync` if Android doesn't use the WebView build it produces:*
the same Capacitor project also targets iOS, which has no ARCore
equivalent and genuinely does fall back to a WebXR-based head-tracking mode
running in a real WebView — so the sync step still matters for that target.
On Android specifically, `app/build.gradle`'s `aaptOptions` already
excludes that web bundle from the packaged APK, so it costs you nothing to
run `sync` out of habit even though `NativeArActivity` never touches it.

### Connecting the phone/headset to your backend

A phone or Quest is a separate device on your network — it can't reach
`localhost:8000` (that would mean the device itself). In the AR app, tap
the ⚙ settings icon and enter your Windows machine's LAN IP directly
(**Settings → Network & internet → Wi-Fi → \[your network\] → Properties**
shows it, or run `ipconfig` and look for "IPv4 Address"). For VR/desktop
builds using the WebXR path, set it from DevTools:

```js
localStorage.setItem('cogniforge_backend_host', '192.168.1.50');
```

**Windows Firewall:** the first time a device on your LAN connects to
`uvicorn` on port 8000, Windows will likely prompt **"Windows Defender
Firewall has blocked some features of this app"** — allow access on
**Private networks**. If you don't get prompted and the connection still
fails, add an inbound rule manually: **Windows Defender Firewall with
Advanced Security → Inbound Rules → New Rule → Port → TCP 8000 → Allow**.

## Known Windows-specific gotchas

- **Long paths:** this repo's `node_modules` (especially inside
  `apps/*/node_modules` and Capacitor's Android plugin folders) nest
  deeply enough that very old Windows setups can hit the classic 260-
  character path limit. Windows 10/11 support long paths natively; if a
  build fails with a path-length-looking error, enable it once as
  Administrator: `git config --system core.longpaths true`, and via
  **Group Policy → Computer Configuration → Administrative Templates →
  System → Filesystem → Enable Win32 long paths**.
- **PowerShell execution policy:** if `npm run <script>` fails immediately
  with a message about scripts being disabled, that's PowerShell's default
  execution policy blocking `npm.ps1`, not a problem with this project —
  run PowerShell as Administrator once: `Set-ExecutionPolicy -Scope
  CurrentUser RemoteSigned`.
- **JDK/Gradle version:** don't set a system-wide `JAVA_HOME` unless you
  already have one pointing at JDK 17+. Android Studio uses its own
  bundled JDK for Gradle by default (**File → Settings → Build, Execution,
  Deployment → Build Tools → Gradle → Gradle JDK**), which avoids exactly
  the JDK-version mismatch this project's own Mac build had to work around
  manually (documented in the paper, Section 4: Gradle 8.14.3 requires
  JDK 17+).

## What "done" looks like

- `curl http://localhost:8000/tasks` returns the five task scenarios.
- The browser build at `localhost:3000` moves the arm with the mouse and,
  under **TASK: [dropdown] RUN**, plays one of the five tasks
  autonomously.
- The desktop installer launches, connects to the backend (same task
  dropdown works there too).
- The VR APK installs on a Quest and the arm responds to controller input
  once the backend host is set.
- The AR APK opens straight into a live camera view (not a browser page),
  detects a real surface, and places the arm on it after **PLACE ROBOT**.
