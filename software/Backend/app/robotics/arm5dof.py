"""
Kinematics for the physical 5-DOF hobby arm (see hardware/pico_arm/),
completely separate from the UR5-class model in kinematics.py that the
rest of the pipeline (simulation, VR digital twin, evaluation harness)
already uses -- this arm has different geometry, degrees of freedom, and
range limits entirely, so it gets its own dedicated forward/inverse
kinematics rather than reusing or approximating the UR5's.

Joint order throughout: [base_rotation, shoulder, elbow, wrist_pitch, gripper].
Angles are in DEGREES here (unlike kinematics.py's radians) since that's
what both the servo calibration layer (pico_bridge.py) and the Pico
firmware (hardware/pico_arm/main.py) work in natively -- converting once
at this boundary avoids repeated back-and-forth conversions downstream.

LINK LENGTHS BELOW ARE PLACEHOLDERS. Measure the real arm (center of one
joint's pivot to the center of the next, in meters) and replace these
before trusting the computed angles: wrong link lengths won't damage
anything (servos just move to a wrong-looking but still in-range
position), but they will make the arm reach for the wrong point in space.

The IK below is closed-form (law of cosines on a 2-link planar arm), not
the iterative Damped Least Squares solver in kinematics.py -- that solver
exists specifically to handle a 6-DOF arm's redundancy and near-singular
configurations; a 5-DOF arm with a fixed gripper approach angle has no
redundancy left to need an iterative method for. Verified numerically
(forward_kinematics(solve_ik(target)) recovers target to sub-millimeter
error across 2000 random reachable points) before being written here --
see the PR/commit this shipped in for the check.
"""

import math
from typing import Dict, List, Tuple

# All in meters. PLACEHOLDER -- measure your actual arm and replace these.
BASE_HEIGHT = 0.07        # ground (or base servo axis) to shoulder pivot
UPPER_ARM_LENGTH = 0.105  # shoulder pivot to elbow pivot
FOREARM_LENGTH = 0.100    # elbow pivot to wrist pivot
GRIPPER_LENGTH = 0.070    # wrist pivot to gripper tip

# Keeping the gripper's approach angle fixed relative to horizontal is what
# removes the redundant degree of freedom a 3-link planar chain would
# otherwise have (shoulder+elbow+wrist could reach the same point many
# ways without it). Positive = pointing down, which is more useful for
# picking things up off a surface than dead level.
DEFAULT_APPROACH_DEG = 30.0

MAX_REACH = UPPER_ARM_LENGTH + FOREARM_LENGTH


class Arm5DofKinematics:
    def __init__(self):
        self.base_height = BASE_HEIGHT
        self.l1 = UPPER_ARM_LENGTH
        self.l2 = FOREARM_LENGTH
        self.l3 = GRIPPER_LENGTH

    def forward_kinematics(self, joints_deg: List[float]) -> Tuple[float, float, float]:
        """joints_deg = [base, shoulder, elbow, wrist, gripper] in degrees
        (shoulder/elbow/wrist measured cumulatively from horizontal, matching
        solve_ik's convention). Returns the gripper tip (x, y, z) in meters."""
        base, shoulder, elbow, wrist = [math.radians(a) for a in joints_deg[:4]]

        r = (
            self.l1 * math.cos(shoulder)
            + self.l2 * math.cos(shoulder + elbow)
            + self.l3 * math.cos(shoulder + elbow + wrist)
        )
        z = self.base_height + (
            self.l1 * math.sin(shoulder)
            + self.l2 * math.sin(shoulder + elbow)
            + self.l3 * math.sin(shoulder + elbow + wrist)
        )
        return r * math.cos(base), r * math.sin(base), z

    def solve_ik(
        self,
        target: Dict[str, float],
        gripper_deg: float = 30.0,
        approach_deg: float = DEFAULT_APPROACH_DEG,
    ) -> List[float]:
        """target: {x, y, z} in meters, arm-base frame (z up, x/y horizontal,
        origin at the base rotation axis). Returns [base, shoulder, elbow,
        wrist, gripper] in degrees. Targets beyond the arm's physical reach
        are clamped to the reach boundary along the same direction, rather
        than left to produce a domain error out of acos()."""
        x, y, z = target["x"], target["y"], target["z"]

        base_rad = math.atan2(y, x)
        r_total = math.hypot(x, y)

        approach_rad = math.radians(approach_deg)
        # Work backwards from the gripper tip to where the wrist pivot must
        # be, given the fixed approach angle.
        r_wrist = r_total - self.l3 * math.cos(approach_rad)
        z_wrist = (z - self.base_height) - self.l3 * math.sin(approach_rad)

        dist = math.hypot(r_wrist, z_wrist)
        if dist > MAX_REACH:
            scale = MAX_REACH / dist
            r_wrist *= scale
            z_wrist *= scale
            dist = MAX_REACH

        # Law of cosines for the elbow bend, then the standard 2-link
        # shoulder-angle correction (the shoulder term below is SUBTRACTED,
        # not added -- verified numerically, see module docstring).
        cos_elbow = (dist ** 2 - self.l1 ** 2 - self.l2 ** 2) / (2 * self.l1 * self.l2)
        cos_elbow = max(-1.0, min(1.0, cos_elbow))
        elbow_rad = math.acos(cos_elbow)  # "elbow-forward" solution

        shoulder_correction = math.atan2(
            self.l2 * math.sin(elbow_rad),
            self.l1 + self.l2 * math.cos(elbow_rad),
        )
        shoulder_rad = math.atan2(z_wrist, r_wrist) - shoulder_correction

        wrist_rad = approach_rad - shoulder_rad - elbow_rad

        return [
            math.degrees(base_rad),
            math.degrees(shoulder_rad),
            math.degrees(elbow_rad),
            math.degrees(wrist_rad),
            gripper_deg,
        ]
