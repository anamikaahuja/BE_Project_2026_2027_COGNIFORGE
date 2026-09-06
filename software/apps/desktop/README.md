# COGNIFORGE Desktop

A native Electron shell around the exact same WebXR/Three.js frontend used by
the browser, VR, and AR builds -- specifically the default (`desktop`-mode)
build, which is the only one of the three that keeps the full 2D control
panel (manual joint jog, mode toggle) alongside both the VR and AR entry
buttons. See `../vr` and `../ar` for the headset- and phone-focused builds.

## Why Electron gets you "VR" too

On a headset connected to a PC via a tethered/Link-style connection (e.g. a
Quest in Link mode), Chromium's WebXR implementation inside Electron can
still create an `immersive-vr` session against the desktop GPU exactly like
a browser does — the "Enter VR" button in the app works the same way here as
it does on the web build. For a fully standalone (untethered) headset
install, see `../vr`, which packages the VR-tailored frontend build as an
Android APK sideloadable directly onto Quest.

## Prerequisites

- The COGNIFORGE backend running and reachable (default: `localhost:8000`).
  See the root `README.md` for `docker-compose up` or the manual `uvicorn`
  setup.
- Node.js 18+.

## Run it

```bash
npm install
npm start        # builds the frontend, then launches the Electron window
```

`npm start` runs `frontend`'s production build first (`npm run build` in
`../../frontend`) and loads the resulting `frontend/dist/index.html` via
`BrowserWindow.loadFile`.

## Package an installer

```bash
npm run dist
```

Copies the frontend build into `frontend-dist/` and runs `electron-builder`
to produce a `.dmg` (macOS), NSIS installer (Windows), or `AppImage`
(Linux) under `release/`.

## Configuring the backend address

If the backend isn't on `localhost:8000` (e.g. it's running on another
machine on the LAN), open the app's DevTools console (View > Toggle
Developer Tools) and run:

```js
import('./src/config/backend.js').then(m => m.setBackendHost('192.168.1.50'));
```

or, more simply, set it once from the browser build served at that host and
the same override applies here too since both read the same `localStorage`
key (`cogniforge_backend_host`) — though note Electron's `file://` origin
has its own separate localStorage, so this needs to be set once per install.

## Verified

The packaged `.dmg` under `build-output/COGNIFORGE-desktop.dmg` is a real
build: mounted, installed to `/Applications`, and launched against a
locally running backend, then confirmed live via `lsof` showing established
TCP connections between the app's network process and the backend on port
8000, with real session/frame traffic in the backend's log. Earlier in
development it was also inspected via the Chrome DevTools Protocol (React
mounts, WebGL canvas renders, WebSocket connects with zero uncaught
exceptions), which is what originally surfaced the two `file://`-specific
bugs fixed at the shared-frontend level: an unhandled `WebSocket`
constructor exception from an empty `location.hostname`, and absolute
(`/assets/...`) Vite asset paths that don't resolve under `file://`. There's
a regression test for the former in `frontend/src/config/backend.test.ts`.
See `WINDOWS_SETUP.md` at the repo root for building the Windows installer.
