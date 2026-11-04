"""
Bridges direct per-motor commands to the physical Pico W arm over UDP (see
hardware/pico_arm/main.py). Optional and off by default -- the rest of the
pipeline behaves identically whether or not a Pico is configured; this only
activates once a client explicitly enables it and supplies the Pico's IP
address. There's no auto-discovery: MicroPython's mDNS/multicast support is
thin enough that a manually-entered IP (printed over USB serial when the
Pico connects to WiFi, see main.py) is the more reliable path.

Deliberately no inverse kinematics or calibration layer here: an earlier
revision computed a target end-effector position via arm5dof.py's IK and
mapped that onto each servo's 0-180 range through a per-joint offset/sign
table, but both the IK and that mapping depend on link lengths and servo
mounting nobody has measured on this physical arm, so the automatically
computed angle landed at the wrong point in space. Direct per-motor jog
control sidesteps that entirely -- the operator sets and watches each
servo's own raw angle directly (see the frontend's Joint Jog panel and
main.py's /pico/jog), self-calibrating by eye rather than trusting an
unmeasured geometric model.
"""

import json
import socket
import time
from typing import List, Optional

# ~12Hz cap on UDP sends: plenty for servo motion (which has its own
# mechanical response lag well below this), and keeps traffic light enough
# that a Pico W's single-threaded MicroPython loop never falls behind --
# matters most here since a dragged slider can fire far more than 12
# change events per second.
MIN_SEND_INTERVAL_S = 0.08


class PicoArmBridge:
    """One shared instance for the process, mirroring how the rest of the
    backend (SecureAuditor, global_memory) shares a single instance rather
    than constructing one per request."""

    def __init__(self):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._last_sent = 0.0
        self.enabled = False
        self.host: Optional[str] = None
        self.port = 8888

    def configure(self, host: str, port: int = 8888):
        self.host = host
        self.port = port
        self.enabled = True

    def disable(self):
        self.enabled = False

    def status(self) -> dict:
        return {"enabled": self.enabled, "host": self.host, "port": self.port}

    def send_joints(self, servo_deg: List[float], force: bool = False) -> bool:
        """Sends raw 0-180 servo angles directly to the Pico -- what's
        passed in is what the servo gets (clamped to its full mechanical
        range; main.py's firmware clamps again per-joint against its own
        narrower SERVO_LIMITS_DEG). Returns whether a packet was actually
        sent -- callers should treat False as "throttled or disabled", not
        as an error to surface."""
        if not self.enabled or not self.host:
            return False
        now = time.time()
        if not force and (now - self._last_sent) < MIN_SEND_INTERVAL_S:
            return False

        commanded = [max(0.0, min(180.0, angle)) for angle in servo_deg]
        payload = json.dumps({"j": commanded}).encode("utf-8")
        try:
            self._sock.sendto(payload, (self.host, self.port))
        except OSError:
            # UDP is fire-and-forget; a transient send error here means
            # this one update is skipped, not that the connection needs
            # recovering -- the next frame retries on its own.
            return False
        self._last_sent = now
        return True


pico_arm_bridge = PicoArmBridge()
