# COGNIFORGE VR

A Capacitor Android app built from the **VR-tailored** frontend build
(`frontend`'s `npm run build:vr`, output `frontend/dist-vr`) --
sideloadable directly onto a standalone Meta Quest headset, no PC or Link
cable required.

## What's different about the VR build

Compared to the desktop/browser build, `dist-vr` (via `src/App.tsx`'s
`mode="vr"`) and `Engine.ts`'s VR-mode wiring:

- Skips the AR entry button entirely (`ARSession` is never constructed) --
  a Quest headset has no meaningful handheld-AR mode to offer.
- Skips the 2D manual-joint-jog panel -- there's no mouse in a headset, and
  the sliders would be unreachable anyway.
- Once inside the `immersive-vr` session, the HTML overlay (which VR mode
  already trimmed down) disappears entirely -- WebXR renders straight to
  the stereo canvas. The real in-headset controls are the 3D panel attached
  to the camera (`frontend/src/xr/VRPanel.ts`): point a controller at it
  and pull the trigger to Start/Stop a demonstration or Approve/Reject a
  reviewed trajectory.

The robot itself is a procedurally-generated UR5 rig at true physical
scale (`frontend/src/scene/RealRobot.ts` -- built from primitives, each
link guaranteed connected by construction, rather than loaded CAD meshes),
and the scene's floor is aligned to
world y=0 to match WebXR's `local-floor` reference space -- so the arm
appears at its real ~0.85m reach standing on the headset user's actual
physical floor, not scaled or offset.

## Build status

The debug APK under `build-output/cogniforge-vr-debug.apk` is a real,
compiled build: a command-line Android SDK toolchain (Android SDK
Command-Line Tools, OpenJDK 21, Gradle 8.14.3, Android Gradle Plugin
8.13.0) was installed specifically to avoid the disk footprint of a full
Android Studio install, and `./gradlew assembleDebug` produced this APK
from the VR-tailored web build. It was verified by decoding its manifest
(`aapt dump badging` — confirms `com.cogniforge.vr`, `MainActivity` as the
launcher) and by inspecting the packaged assets directly, not just trusting
a green build. See `WINDOWS_SETUP.md` at the repo root for building it
yourself via Android Studio, which is the easier path on a normal machine.

## Build it yourself

```bash
npm install
npm run sync            # rebuilds the VR frontend, copies into android/
npm run open:android    # opens android/ in Android Studio
```

From Android Studio: `Run` with the Quest connected via USB (Developer Mode
enabled via the Meta Quest mobile app), or `Build > Generate Signed Bundle /
APK` and sideload with:

```bash
adb install app-debug.apk
```

or a tool like SideQuest.

## Configuring the backend address

Quest is a standalone headset -- it can't reach a backend at `localhost`
the way the desktop app can, since "localhost" would mean the headset
itself. Point it at your dev machine's LAN address once (both must be on
the same network) via the in-app DevTools console (`chrome://inspect` from
a desktop Chrome with the headset connected over USB, or Wi-Fi debugging):

```js
localStorage.setItem('cogniforge_backend_host', '192.168.1.50');
```

then reload.
