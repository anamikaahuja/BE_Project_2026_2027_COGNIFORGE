# COGNIFORGE AR

On Android, this is a **native ARCore application** — a hand-written Kotlin
+ OpenGL renderer with real camera passthrough
(`android/app/src/main/java/com/cogniforge/ar/ar/NativeArActivity.kt`), not
a web page. Point a phone at a real surface, tap **PLACE ROBOT**, and the
UR5 arm appears anchored there at true physical scale, tracked live by
ARCore as you move around it.

## Why this isn't a WebXR/Capacitor app on Android

Earlier in this project, AR followed the same pattern as the VR build: a
Capacitor-wrapped WebXR page (`frontend`'s `npm run build:ar`, output
`frontend/dist-ar`) requesting an `immersive-ar` session. A verification
pass on real Android hardware found that this cannot work at all —
Capacitor's embedded WebView is a plain `android.webkit.WebView`, and
`immersive-ar` camera passthrough is tied to the actual Chrome app process
(or a Trusted Web Activity wrapping it), not a generic embedded WebView, no
matter what permissions or manifest entries are added. The research
paper's Section 5.1 documents the full diagnosis. The fix was a rewrite,
not a workaround: `NativeArActivity` talks to ARCore directly, with a small
hand-written OpenGL ES renderer for the camera background and the robot
geometry (procedurally generated cylinders/spheres — see `Ur5Robot.kt` —
rather than loaded CAD meshes, since that's what let an earlier version of
this render as visually disconnected pieces despite correct math).

`NativeArActivity` is the app's actual launcher activity — opening the app
goes straight to the camera view.

## What the Capacitor/WebXR project is still for

The `dist-ar` build and Capacitor's Android project scaffolding are still
present because **iOS has no ARCore equivalent**, and Safari/WebKit doesn't
implement the WebXR Device API either — so the iOS build genuinely does
fall back to the original WebXR-based approach in a real WebView, using
head-tracking parallax (front camera via MediaPipe) instead of true AR.
`npm run sync` still rebuilds and copies that bundle in for the iOS
target; on Android it's excluded from the packaged `.apk` at the Gradle
level (`app/build.gradle`'s `aaptOptions`) since `NativeArActivity` never
touches it.

## Build status

The debug APK under `build-output/cogniforge-ar-debug.apk` is a real,
compiled build: a command-line Android SDK toolchain (Android SDK
Command-Line Tools, OpenJDK 21, Gradle 8.14.3, Android Gradle Plugin
8.13.0) was installed to avoid the disk footprint of a full Android Studio
install, and `./gradlew assembleDebug` produced this APK. It was verified
by decoding its manifest (`aapt dump badging` — confirms
`com.cogniforge.ar`, `NativeArActivity` as the sole launcher, the
`CAMERA`/`INTERNET` permissions and `android.hardware.camera.ar` feature
requirement) and by inspecting the packaged assets directly. See
`WINDOWS_SETUP.md` at the repo root for building it yourself via Android
Studio, which is the easier path on a normal machine.

iOS was not built or tested in the primary development environment (no
Mac with Xcode available); see below for what that would require.

## Build it yourself

### Android (the real AR experience)

```bash
npm install
npm run sync            # rebuilds the AR-tailored web build (for iOS; see above), copies into android/ + ios/
npm run open:android    # opens android/ in Android Studio
```

Let Gradle sync finish, then **Build → Build Bundle(s) / APK(s) → Build
APK(s)**, or **Run** with a phone connected over USB (enable Developer
Options → USB Debugging first). The target device needs **ARCore**
("Google Play Services for AR") — Play Store installs it automatically the
first time an ARCore app requests it on a certified device.

### iOS (head-tracking fallback only, not true AR)

```bash
npm run open:ios        # opens ios/App/App.xcworkspace in Xcode
```

Needs a Mac with full Xcode (not just Command Line Tools) and CocoaPods.

## Configuring the backend address

**Native Android app:** tap the ⚙ icon in the top-right of the camera view
and enter your backend machine's LAN IP directly — this is a real in-app
settings screen (`NativeArActivity.kt`, backed by `SharedPreferences`), not
a DevTools workaround.

**iOS fallback build:** set it once from the in-app DevTools console
(`chrome://inspect` from a desktop Chrome connected via USB debugging, or
Safari's Web Inspector for a WebKit-based session):

```js
localStorage.setItem('cogniforge_backend_host', '192.168.1.50');
```

then reload.
