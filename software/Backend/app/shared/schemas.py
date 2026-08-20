from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import List, Optional, Dict, Any


class CamelModel(BaseModel):
    """Base model that accepts/emits camelCase (matches the WebXR/JS client)
    while keeping snake_case attribute access in Python."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class Vector3(CamelModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Quaternion(CamelModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    w: float = 1.0


class JointPose(CamelModel):
    name: str
    position: Vector3
    orientation: Quaternion = Quaternion()


class HandPose(CamelModel):
    handedness: Optional[str] = None
    joints: List[JointPose] = []


class FrameData(CamelModel):
    timestamp: float
    left_hand: Optional[HandPose] = None
    right_hand: Optional[HandPose] = None


# --- Higher-level agent-pipeline schemas (proposal Ch.4/5 shared state) ---

class ActionPrimitive(CamelModel):
    label: str  # e.g. "PICK", "PLACE", "TRACE", "IDLE"
    grasp_type: str = "open_hand"  # power | precision | lateral | pinch | open_hand
    start_time: float = 0.0
    end_time: float = 0.0
    end_effector_pos: Vector3 = Vector3()
    confidence: float = 1.0


class ActionSequence(CamelModel):
    primitives: List[ActionPrimitive] = []


class Waypoint(CamelModel):
    joints: List[float]
    velocity: List[float] = []
    t: float = 0.0


class MotionPlan(CamelModel):
    waypoints: List[Waypoint] = []
    contingencies: List[List[float]] = []
    collision_free: bool = True


class CorrectionReport(CamelModel):
    anomalies: List[str] = []
    classification: str = "none"  # none | auto_correctable | user_review | critical
    corrected: bool = False
    message: str = ""


class MemoryContext(CamelModel):
    similar_tasks: List[Dict[str, Any]] = []
    warm_start_joints: Optional[List[float]] = None


class RobotInstructionSet(CamelModel):
    session_id: str
    joints: List[float]
    contingencies: List[List[float]] = []
    approved: bool = False
    log_hash: Optional[str] = None
