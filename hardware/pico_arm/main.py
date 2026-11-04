"""
COGNIFORGE physical arm bridge -- runs on a Raspberry Pi Pico W.

Receives target joint angles over UDP (sent by the backend's
app/robotics/pico_bridge.py, one packet per control update) and drives five
hobby servos via PWM. Only the PWM signal wires come from the Pico; servo
power comes directly from a separate power bank (or other 5-6V supply) --
see the wiring note below, it's the most common reason this kind of setup
silently fails.

WIRING
------
Each servo has 3 wires: signal, power(+), ground.
  - signal  -> the Pico GPIO listed in SERVO_PINS below
  - power+  -> power bank / external 5-6V supply, NOT the Pico's 3V3 pin
               (the Pico cannot supply enough current for multiple servos)
  - ground  -> BOTH the power bank's ground AND a Pico GND pin

That last point is the one that's easy to miss: powering the servos from a
separate supply but never connecting that supply's ground back to the
Pico's ground leaves the PWM signal with no reference voltage to be
measured against, and the servos will jitter or ignore it entirely.

SETUP
-----
1. Flash MicroPython onto the Pico W if it isn't already
   (https://micropython.org/download/RPI_PICO_W/).
2. Edit WIFI_SSID / WIFI_PASSWORD below.
3. Copy this file onto the Pico as main.py (e.g. via Thonny or `mpremote
   cp main.py :main.py`) so it runs automatically on boot.
4. Power-cycle the Pico. It prints its IP address over USB serial once
   connected -- that's the PICO_HOST value the backend needs
   (backend/app/robotics/pico_bridge.py or the frontend's settings panel).
5. BEFORE connecting a servo to a live arm joint, test it disconnected from
   the arm first (or with the arm's mechanical range clear) and confirm it
   doesn't strain against a limit -- SERVO_LIMITS_DEG below are
   conservative guesses, not measured values for your specific arm.
"""

import json
import socket
import time

import machine
import network

# --------------------------------------------------------------- Config --
WIFI_SSID = "YOUR_WIFI_SSID"
WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"

UDP_PORT = 8888

# GPIO pin per joint, in the order the backend sends them:
# [base_rotation, shoulder, elbow, wrist_pitch, gripper]
SERVO_PINS = [2, 3, 4, 5, 6]

# Most SG90/MG90S-class clones respond well to a 500-2500us pulse range
# (some datasheets say 1000-2000us -- if a servo buzzes or strains at 0 or
# 180 degrees, narrow this range rather than the joint limits below).
SERVO_MIN_US = 500
SERVO_MAX_US = 2500
SERVO_FREQ_HZ = 50

# Conservative per-joint travel limits in degrees, clamped before any angle
# reaches a servo. These are guesses (a "wait and see" default), not
# measured limits for this specific arm -- manually jog each joint through
# its full mechanical range first and tighten these to match before
# trusting software alone to prevent a servo straining against the frame.
SERVO_LIMITS_DEG = [
    (0, 180),   # base rotation
    (0, 180),   # shoulder
    (0, 180),   # elbow
    (0, 180),   # wrist pitch
    (0, 60),    # gripper (0=open .. 60=closed; narrow/widen once measured)
]

# If no packet arrives for this long, stop actively driving the servos
# (leaves them at their last commanded position but no longer re-writes
# it) -- a deliberate choice over "hold forever": if the backend/network
# has genuinely gone away, continuously re-asserting the last PWM value is
# indistinguishable from a stuck connection either way, but this makes the
# distinction visible in the log rather than silently doing nothing.
COMMAND_TIMEOUT_S = 5.0


def connect_wifi() -> str:
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)

    print("Connecting to WiFi...")
    for _ in range(30):
        if wlan.isconnected():
            ip = wlan.ifconfig()[0]
            print(f"Connected. IP address: {ip}")
            return ip
        time.sleep(1)

    raise RuntimeError("Could not connect to WiFi -- check WIFI_SSID/WIFI_PASSWORD")


def angle_to_duty_ns(angle_deg: float) -> int:
    """Maps a 0-180 degree angle to a PWM duty cycle (nanoseconds high per
    cycle) between SERVO_MIN_US and SERVO_MAX_US."""
    angle_deg = max(0.0, min(180.0, angle_deg))
    pulse_us = SERVO_MIN_US + (SERVO_MAX_US - SERVO_MIN_US) * (angle_deg / 180.0)
    return int(pulse_us * 1000)


class ServoJoint:
    def __init__(self, pin: int, limits_deg):
        self.pwm = machine.PWM(machine.Pin(pin))
        self.pwm.freq(SERVO_FREQ_HZ)
        self.min_deg, self.max_deg = limits_deg
        self.current_deg = (self.min_deg + self.max_deg) / 2
        self.set_angle(self.current_deg)

    def set_angle(self, angle_deg: float):
        clamped = max(self.min_deg, min(self.max_deg, angle_deg))
        self.current_deg = clamped
        self.pwm.duty_ns(angle_to_duty_ns(clamped))


def main():
    status_led = machine.Pin("LED", machine.Pin.OUT)
    ip = connect_wifi()
    status_led.on()  # solid on once connected; blinks below on each packet

    joints = [ServoJoint(pin, limits) for pin, limits in zip(SERVO_PINS, SERVO_LIMITS_DEG)]

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", UDP_PORT))
    sock.settimeout(1.0)  # so the loop can check the command timeout periodically

    print(f"Listening for joint commands on udp://{ip}:{UDP_PORT}")
    last_command_time = time.time()

    while True:
        try:
            data, addr = sock.recvfrom(256)
        except OSError:
            # Timed out waiting for a packet -- normal, just re-check below.
            if time.time() - last_command_time > COMMAND_TIMEOUT_S:
                status_led.off()
            continue

        try:
            payload = json.loads(data)
            angles_deg = payload["j"]
            if len(angles_deg) != len(joints):
                raise ValueError(f"expected {len(joints)} joint angles, got {len(angles_deg)}")
        except Exception as e:
            print(f"Bad packet from {addr}: {e}")
            continue

        for joint, angle in zip(joints, angles_deg):
            joint.set_angle(angle)

        last_command_time = time.time()
        status_led.on()


if __name__ == "__main__":
    main()
