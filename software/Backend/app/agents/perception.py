from collections import deque
from typing import Deque, Optional

import numpy as np

from app.shared.schemas import HandPose, Vector3

GRASP_TYPES = ["power", "precision", "lateral", "pinch", "open_hand"]


def calculate_distance(v1: Vector3, v2: Vector3) -> float:
    return float(np.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2 + (v1.z - v2.z) ** 2))


class PerceptionEngine:
    """
    Transforms raw hand-joint poses into semantically meaningful action
    primitives: gesture/grasp classification, and velocity-based action
    segmentation (idle -> moving -> grasp -> moving -> release).
    """

    PINCH_THRESHOLD = 0.02       # meters
    VELOCITY_IDLE_THRESHOLD = 0.01  # meters/frame considered "stationary"

    def __init__(self, history_len: int = 8):
        self._position_history: Deque[np.ndarray] = deque(maxlen=history_len)

    @staticmethod
    def detect_gestures(hand_pose: Optional[HandPose]) -> str:
        if not hand_pose or not hand_pose.joints:
            return "IDLE"

        joints = {j.name: j.position for j in hand_pose.joints}
        thumb_tip = joints.get("thumb-tip")
        index_tip = joints.get("index-finger-tip")

        if thumb_tip and index_tip:
            dist = calculate_distance(thumb_tip, index_tip)
            if dist < PerceptionEngine.PINCH_THRESHOLD:
                return "PINCH"
        return "IDLE"

    def classify_grasp(self, hand_pose: Optional[HandPose]) -> str:
        """Lightweight heuristic grasp classifier (stand-in for the proposal's
        LSTM 5-grasp-type classifier): uses fingertip spread to distinguish
        pinch/precision from a fuller power/open-hand grasp."""
        if not hand_pose or not hand_pose.joints:
            return "open_hand"

        joints = {j.name: j.position for j in hand_pose.joints}
        thumb_tip = joints.get("thumb-tip")
        index_tip = joints.get("index-finger-tip")
        if thumb_tip and index_tip:
            dist = calculate_distance(thumb_tip, index_tip)
            if dist < self.PINCH_THRESHOLD:
                return "pinch"
            if dist < 0.06:
                return "precision"
        return "open_hand"

    def segment_action(self, index_tip_pos: Vector3) -> str:
        """Velocity-based action segmentation: tracks recent end-effector
        speed to distinguish MOVING from an IDLE/settled hand, which the
        proposal uses to mark primitive boundaries."""
        p = np.array([index_tip_pos.x, index_tip_pos.y, index_tip_pos.z])
        self._position_history.append(p)

        if len(self._position_history) < 2:
            return "IDLE"

        velocity = np.linalg.norm(self._position_history[-1] - self._position_history[-2])
        return "IDLE" if velocity < self.VELOCITY_IDLE_THRESHOLD else "MOVING"
