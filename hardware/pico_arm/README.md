# Physical 5-DOF arm bridge

Drives a real 5-servo hobby arm by **direct per-motor jog control** from
the frontend -- the operator sets each servo's own raw angle with a
slider, watches the real arm respond, and picks values by eye. This is
deliberately separate from the hand-tracking/IK pipeline that drives the
simulated UR5: that pipeline's target positions only land at the right
point in space if this arm's real link lengths and servo mounting have
been measured and calibrated, and nobody has done that yet for this arm.
Jogging sidesteps needing that measurement at all.

```
Frontend Joint Jog panel (App.tsx)
        |  POST /pico/jog {"joints": [b, s, e, w, g]}  (raw 0-180 servo degrees)
        v
backend: pico_bridge.py --UDP--> Pico W --PWM--> real servos
        |
        v
same raw degrees also applied directly to PhysicalArm5Dof.ts's
visual twin from the UI, independent of the WebSocket
```

## 1. Wiring

Each servo has 3 wires: signal, power(+), ground.

| Wire | Goes to |
|---|---|
| Signal | A Pico W GPIO (see `SERVO_PINS` in `main.py`: 2, 3, 4, 5, 6 for base/shoulder/elbow/wrist/gripper) |
| Power (+) | The power bank / external 5-6V supply -- **not** the Pico's 3V3 pin, which cannot supply enough current for multiple servos |
| Ground | **Both** the power bank's ground **and** a Pico GND pin |

That last row is the one that's easy to skip and the most common reason
this exact setup silently fails: powering the servos from a separate
supply but never tying that supply's ground back to the Pico's ground
leaves the PWM signal with no reference voltage to be read against. The
servos will jitter or not respond at all, not fail loudly.

## 2. Flash and run the firmware

1. Install MicroPython on the Pico W if you haven't:
   https://micropython.org/download/RPI_PICO_W/
2. Open `main.py` and set `WIFI_SSID` / `WIFI_PASSWORD`.
3. Copy `main.py` onto the Pico as `main.py` (Thonny, or
   `mpremote cp main.py :main.py`) so it runs on boot.
4. Power-cycle the Pico. It prints its IP address over USB serial once
   WiFi connects -- that's the address you'll enter in the app.

## 3. Connect the app and jog it

In any of the apps (browser/desktop/VR), click the **ARM** button in the
header, enter the Pico's IP (port defaults to 8888), and click **CONNECT**.
The status line confirms once it's live. Below that, five sliders --
**BASE / SHOULDER / ELBOW / WRIST / GRIPPER** -- each send that joint's raw
servo degree (0-180, gripper 0-60) straight to the Pico as you drag them.
Click **DISABLE** to stop sending at any time -- the arm just holds its
last position (hobby servos don't drift on their own).

You can also check/enable/disable/jog it directly:

```bash
curl http://localhost:8000/pico/status
curl -X POST http://localhost:8000/pico/configure -H 'Content-Type: application/json' -d '{"host": "192.168.1.120"}'
curl -X POST http://localhost:8000/pico/jog -H 'Content-Type: application/json' -d '{"joints": [90, 90, 90, 90, 0]}'
curl -X POST http://localhost:8000/pico/disable
```

**Safety note:** the only thing that ever moves this arm is a deliberate
jog command from the UI or a direct `/pico/jog` call above -- there's no
automatic driving from hand tracking, the multi-agent pipeline, or
Training Mode. If you see the arm move, someone moved a slider.

## 4. Calibrate -- do this before trusting any motion

There's no inverse kinematics or per-servo offset/sign table to calibrate
anymore -- jog control sends exactly the raw degree you set, so there's
nothing hidden to get wrong there. What's still worth checking on a new
arm, one joint at a time, **with its mechanical range clear**:

### 4a. Which way each servo actually turns

Drag one slider at a time through its range and watch which way that
joint actually moves and how far -- there's no "correct" mapping to
verify against, just get a feel for how each joint responds before you
try coordinating more than one at once.

### 4b. Servo pulse range and travel limits (`hardware/pico_arm/main.py`)

If a servo buzzes or visibly strains at either end of its motion, narrow
`SERVO_MIN_US`/`SERVO_MAX_US` (pulse width) or `SERVO_LIMITS_DEG` (degrees)
for that joint -- both are conservative guesses, not measured values for
your specific servos. `main.py` clamps to these regardless of what the
slider sends, so a wrong slider value can't force a joint past them.

### 4c. Link lengths (`backend/app/robotics/arm5dof.py`) -- only if you revisit IK later

`arm5dof.py`'s IK solver still exists and is still tested, just not wired
into live control anymore. If you later measure this arm's real link
lengths and want to bring back target-position control instead of jogging
each motor by hand, that's the file to update and re-wire.

## What this is not

The servos on this arm are standard hobby servos with no position-feedback
wire. `PhysicalArm5Dof.ts`'s visual model mirrors the **commanded** angle
sent to the Pico, not a sensed measurement of where the arm actually is --
it's documented as an open-loop preview rather than presented as verified
feedback. If a servo stalls, slips, or the arm is moved by hand, the
preview will not reflect that.
