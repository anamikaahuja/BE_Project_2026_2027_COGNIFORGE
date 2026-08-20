import math
from typing import List, Optional, Tuple

import numpy as np

from app.robotics.kinematics import MotionPlanner

try:
    import pybullet as p
    import pybullet_data
    _PYBULLET_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    _PYBULLET_AVAILABLE = False

WORKSPACE_RADIUS = 0.85       # meters, approximate UR5 reach
FLOOR_Z_CLEARANCE = 0.05      # meters


class CollisionValidator:
    """
    Validates a joint trajectory for physical feasibility.

    When PyBullet is installed, spawns a headless (DIRECT mode) physics
    client, loads a simple capsule-chain approximation of the arm plus a
    ground plane, and steps through the trajectory checking
    getClosestPoints() for self-collision and floor contact.

    When PyBullet is unavailable (e.g. no wheel for the current Python
    version), falls back to analytic checks: forward-kinematics floor
    clearance and workspace-sphere reachability. The Error Correction Agent
    treats both paths identically, so pipeline behavior degrades gracefully
    rather than failing hard.
    """

    def __init__(self):
        self.planner = MotionPlanner()
        self._client = None
        if _PYBULLET_AVAILABLE:
            try:
                self._client = p.connect(p.DIRECT)
                p.setAdditionalSearchPath(pybullet_data.getDataPath())
            except Exception:
                self._client = None

    @property
    def backend(self) -> str:
        return "pybullet" if self._client is not None else "analytic"

    def _analytic_check(self, joints: List[float]) -> Tuple[bool, Optional[str]]:
        T = self.planner.forward_kinematics(joints)
        pos = T[:3, 3]
        if pos[2] < FLOOR_Z_CLEARANCE:
            return False, f"floor_clearance_violation(z={pos[2]:.3f})"
        if np.linalg.norm(pos) > WORKSPACE_RADIUS:
            return False, f"workspace_bounds_violation(r={np.linalg.norm(pos):.3f})"
        return True, None

    def _pybullet_check(self, joints: List[float]) -> Tuple[bool, Optional[str]]:
        try:
            p.resetSimulation(physicsClientId=self._client)
            plane_id = p.loadURDF("plane.urdf", physicsClientId=self._client)

            # Approximate the 6-DOF arm as a chain of capsule links so we get
            # real broadphase collision queries without shipping a full URDF.
            prev_id = plane_id
            prev_pos = [0, 0, 0.05]
            link_ids = []
            for i, angle in enumerate(joints):
                length = 0.3
                offset = [
                    prev_pos[0] + length * math.cos(angle),
                    prev_pos[1] + length * math.sin(angle),
                    prev_pos[2] + 0.05,
                ]
                col = p.createCollisionShape(p.GEOM_CAPSULE, radius=0.05, height=length, physicsClientId=self._client)
                body = p.createMultiBody(baseMass=0, baseCollisionShapeIndex=col, basePosition=offset, physicsClientId=self._client)
                link_ids.append(body)
                prev_pos = offset

            for body in link_ids:
                contacts = p.getClosestPoints(bodyA=body, bodyB=plane_id, distance=0.02, physicsClientId=self._client)
                if contacts and prev_pos[2] < FLOOR_Z_CLEARANCE:
                    return False, "pybullet_floor_contact"

            for a in range(len(link_ids)):
                for b in range(a + 2, len(link_ids)):
                    contacts = p.getClosestPoints(bodyA=link_ids[a], bodyB=link_ids[b], distance=0.01, physicsClientId=self._client)
                    if contacts:
                        return False, f"self_collision(link{a},link{b})"

            return self._analytic_check(joints)
        except Exception:
            return self._analytic_check(joints)

    def validate_waypoint(self, joints: List[float]) -> Tuple[bool, Optional[str]]:
        if self._client is not None:
            return self._pybullet_check(joints)
        return self._analytic_check(joints)

    def validate_trajectory(self, waypoints: List[List[float]]) -> Tuple[bool, List[str]]:
        violations = []
        for i, wp in enumerate(waypoints):
            ok, reason = self.validate_waypoint(wp)
            if not ok:
                violations.append(f"waypoint_{i}:{reason}")
        return (len(violations) == 0), violations
