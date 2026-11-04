# COGNIFORGE

A WebXR platform for teaching a robot arm by demonstration: put on a
headset, hold up a phone, or just use a mouse, show the robot what to do,
and a multi-agent backend (reactive safety, BDI planning, contingency-branch
motion planning, real inverse kinematics, collision validation, a
hash-chained audit ledger) turns that into real, collision-checked joint
trajectories. The robot itself is a real Universal Robots UR5 rig at true
physical scale and correct Denavit-Hartenberg geometry, not a stylized
placeholder.

One codebase ships as three platform-tailored apps:

| App | Platform | Path |
|---|---|---|
| Browser / Desktop | Any modern browser; packaged as a native Electron app | [`apps/desktop`](apps/desktop) |
| VR | Standalone Meta Quest (sideloaded APK) | [`apps/vr`](apps/vr) |
| AR | Android phone, native ARCore (real camera passthrough, not a web page); iOS falls back to head-tracking parallax | [`apps/ar`](apps/ar) |

Prebuilt debug binaries for all three (no toolchain needed to just run
them) are under `apps/*/build-output/`.

See `paper/` for the accompanying research paper and `backend/evaluation/`
for the automated benchmark harness and results. **Building on Windows?
See [`WINDOWS_SETUP.md`](WINDOWS_SETUP.md)** for a full step-by-step guide —
the commands below are written for macOS/Linux.

## Quick start (browser)

### Prerequisites
- [Docker](https://www.docker.com/products/docker-desktop/) (recommended), **or**
- [Node.js](https://nodejs.org/) (v18+) and [Python](https://www.python.org/) (v3.10+)

### Option 1: Docker

```bash
docker-compose up --build
```

- **Frontend:** https://localhost:3000
- **Backend API:** http://localhost:8000

### Option 2: Manual

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open https://localhost:3000 (Note: The frontend is now served over HTTPS using a basic SSL certificate, which is required for the WebXR API to function when accessed from devices like a Meta Quest headset on your local network. You may need to bypass the browser's security warning for the self-signed certificate on first load).

## The other two apps

```bash
cd apps/desktop && npm install && npm start   # Electron desktop app

cd apps/vr && npm install && npm run sync && npm run open:android   # Quest APK (needs Android Studio)

cd apps/ar && npm install && npm run sync && npm run open:android   # phone AR APK (needs Android Studio)
```

Compiling the Android builds needs the Android SDK (Android Studio is the
easiest path); the AR app specifically is a native Kotlin/ARCore app, not
a web page — see [`apps/ar/README.md`](apps/ar/README.md) for why. All
three have been compiled and verified end-to-end (manifest-decoded,
packaged assets inspected, and — for desktop/AR — launched against a live
backend); see each app's README for exactly how. iOS was not built or
tested (no Mac/Xcode available in the primary dev environment).

## Running the backend tests and evaluation harness

```bash
cd backend
source venv/bin/activate
pytest                        # 23 tests: kinematics, trajectory, collision, audit ledger, /solve_ik, full pipeline
python -m evaluation.run_benchmark   # automated 5-task benchmark against the real running system
```

These same five tasks (`GET /tasks`, defined once in
`backend/app/robotics/tasks.py`) are also playable live in every app: pick
one from the **TASK** dropdown and the arm executes it autonomously via
real `/solve_ik` calls, rather than only ever being reproduced offline by
the benchmark harness.

## Environment configuration

If you're using LLM-based reasoning in the agent pipeline, create a `.env` file in `backend/`:

```env
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

If the backend isn't on `localhost:8000` (e.g. a Quest headset reaching a
separate dev machine), set it once from the app's DevTools console:

```js
localStorage.setItem('cogniforge_backend_host', '192.168.1.50');
```

## Architecture

- **Frontend:** React + Vite + Three.js, a procedurally-generated UR5 rig at true physical scale (`frontend/src/scene/RealRobot.ts` — built from primitives so each link is guaranteed connected by construction, rather than loaded CAD meshes), WebXR VR/AR sessions, in-headset 3D control panel (`frontend/src/xr/VRPanel.ts`).
- **Backend:** FastAPI + LangGraph nine-agent pipeline (Gateway, Perception, Visual Reasoning, Intent Prediction, Reactive safety, BDI planning, Motion Planning with DLS inverse kinematics, Error Correction with PyBullet/analytic collision validation, Meta-supervisor), ChromaDB skill-library memory, hash-chained audit ledger.
- **Hardware (Optional):** Primary support for Universal Robots UR5. Also includes a direct-drive jog bridge for an experimental 5-DOF hobby servo arm (`hardware/pico_arm`).
- **Communication:** WebSocket for live shared control, REST for session-based record/review/approve flows.
