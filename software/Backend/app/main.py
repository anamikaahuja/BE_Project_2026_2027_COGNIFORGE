import asyncio
import json
import logging
import time
import uuid
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.agents.graph import app_graph
from app.core.audit import auditor
from app.core.memory import global_memory
from app.robotics.simulation import CollisionValidator
from app.robotics.trajectory import smooth_trajectory, velocity_profile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("COGNIFORGE")

app = FastAPI(title="COGNIFORGE API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------- Sessions --
# In-memory demonstration-session store. A session records a batch of
# frames/waypoints captured during a WebXR demonstration so it can be
# reviewed, approved/rejected, and (on approval) saved into the skill
# library -- separate from the live per-frame shared-control graph above,
# which reacts frame-by-frame rather than replaying a recorded batch.
class Session(BaseModel):
    id: str
    created_at: float
    status: str = "recording"          # recording | pending_review | approved | rejected
    waypoints: List[List[float]] = []
    smoothed: List[List[float]] = []
    description: str = "unlabeled manipulation task"


_sessions: Dict[str, Session] = {}
_collision_validator = CollisionValidator()


@app.get("/reset")
async def reset_robot():
    from app.robotics.kinematics import MotionPlanner
    planner = MotionPlanner()
    joints = planner.reset()
    return {"status": "reset", "joints": joints}


class IKRequest(BaseModel):
    x: float
    y: float
    z: float


@app.post("/solve_ik")
async def solve_ik(req: IKRequest):
    """Stateless single-target inverse kinematics. Used by the AR app's
    tap-to-reach interaction: the frontend converts a tapped point (from
    the WebXR hit-test reticle) into the robot's local frame and asks for
    the joint angles that reach it, then animates the arm there -- distinct
    from the live per-frame shared-control pipeline, which reacts to a
    continuous hand-tracking stream rather than a single one-off target."""
    from app.robotics.kinematics import MotionPlanner

    planner = MotionPlanner()
    joints = planner.solve_ik({"x": req.x, "y": req.y, "z": req.z})
    return {"joints": joints}


@app.get("/ledger")
async def get_audit_ledger(limit: int = 100):
    """Returns the hash-chained multi-agent decision ledger."""
    return {"ledger": auditor.get_ledger(limit), "integrity": auditor.verify_integrity()}


@app.get("/tasks")
async def get_tasks():
    """The five task scenarios (pick-and-place, stacking, path tracing,
    2-part assembly, complex assembly) the evaluation harness benchmarks
    against, exposed here so the interactive apps can play the identical
    scenarios live -- one source of truth, not a duplicated list."""
    from app.robotics.tasks import TASKS

    return {"tasks": TASKS}


# ------------------------------------------------------- Session endpoints --
@app.post("/session/create")
async def create_session(description: str = "unlabeled manipulation task"):
    session_id = str(uuid.uuid4())
    _sessions[session_id] = Session(id=session_id, created_at=time.time(), description=description)
    return {"session_id": session_id, "timestamp": _sessions[session_id].created_at}


@app.post("/session/{session_id}/frame")
async def append_frame(session_id: str, joints: List[float]):
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.waypoints.append(joints)
    return {"status": "appended", "n_waypoints": len(session.waypoints)}


@app.post("/session/{session_id}/finalize")
async def finalize_session(session_id: str):
    """Smooths the recorded waypoints (cubic spline) and validates the
    resulting trajectory for collisions, producing the review-ready plan."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if len(session.waypoints) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 waypoints to finalize")

    session.smoothed = smooth_trajectory(session.waypoints)
    ok, violations = _collision_validator.validate_trajectory(session.smoothed)
    session.status = "pending_review"

    auditor.log_decision("Meta", "SESSION_FINALIZED", {"session_id": session_id, "collision_free": ok})
    return {
        "session_id": session_id,
        "collision_free": ok,
        "violations": violations,
        "n_smoothed_waypoints": len(session.smoothed),
        "velocity_profile": velocity_profile(session.smoothed)[:5],
    }


@app.get("/session/{session_id}/instructions")
async def get_instructions(session_id: str):
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "status": session.status,
        "joints": session.smoothed or session.waypoints,
    }


@app.post("/session/{session_id}/approve")
async def approve_session(session_id: str):
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "approved"
    trajectory = session.smoothed or session.waypoints
    global_memory.save_skill(session_id, session.description, trajectory)
    auditor.log_decision("Meta", "SESSION_APPROVED", {"session_id": session_id})
    return {"status": "approved", "triggers_execution": True}


@app.post("/session/{session_id}/reject")
async def reject_session(session_id: str):
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "rejected"
    session.waypoints = []
    session.smoothed = []
    auditor.log_decision("Meta", "SESSION_REJECTED", {"session_id": session_id})
    return {"status": "rejected", "resets_pipeline": True}


# --------------------------------------------------------- Skill library --
@app.get("/skills/library")
async def get_skill_library():
    return {"skills": global_memory.list_skills()}


@app.post("/skills/save/{session_id}")
async def save_skill(session_id: str):
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    trajectory = session.smoothed or session.waypoints
    if not trajectory:
        raise HTTPException(status_code=400, detail="Session has no trajectory to save")
    ok = global_memory.save_skill(session_id, session.description, trajectory)
    return {"skill_id": session_id, "saved": ok}


# -------------------------------------------------------- Live WS pipeline --
@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("New XR stream connection established")

    msg_timestamps: List[float] = []
    # Per-connection HITL acknowledgement cooldown. The pipeline re-evaluates
    # contingencies on every incoming frame (10-20Hz), so without this an
    # operator's approval would be immediately overridden by the very next
    # frame re-declaring REQUIRE_HITL_REVIEW -- the banner could never clear.
    HITL_COOLDOWN_SECONDS = 2.0
    hitl_ack_until = 0.0

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            now = time.time()
            msg_timestamps.append(now)
            if len(msg_timestamps) > 10:
                msg_timestamps.pop(0)

            high_cognitive_load = len(msg_timestamps) == 10 and (now - msg_timestamps[0]) < 0.5

            if payload.get("hitl_approved"):
                hitl_ack_until = now + HITL_COOLDOWN_SECONDS

            state = {
                "raw_telemetry": payload,
                "frames": [],
                "primitives": [],
                "scene_graph": payload.get("scene_objects", {}),
                "current_action": "IDLE",
                "robot_trajectory": [],
                "contingencies": None,
                "rejected_trajectory": None,
                "errors": [],
                "meta_decision": "",
                "correction_report": None,
                "beliefs": {},
                "desires": [],
                "intentions": [],
                "human_intents": [],
                "insight_context": "",
                "memory_context": None,
                "refine_count": 0,
            }

            result = await app_graph.ainvoke(state)

            rejected = result.get("rejected_trajectory")
            rejected_joints = rejected[0].get("joints", []) if rejected else None

            # `.get("robot_trajectory", [{}])` only falls back to the
            # default when the key is *missing* -- the Gateway-rejection
            # path leaves it present but `[]` (its initial state value),
            # which previously caused `[][0]` to raise IndexError and drop
            # the WebSocket connection entirely on any malformed frame.
            robot_trajectory = result.get("robot_trajectory") or [{}]
            robot_joints = robot_trajectory[0].get("joints", [])

            wants_hitl = result.get("meta_decision") == "REQUIRE_HITL_REVIEW"
            requires_hitl = wants_hitl and time.time() >= hitl_ack_until

            await websocket.send_text(json.dumps({
                "status": "planned",
                "primitives": result.get("primitives"),
                "robot_joints": robot_joints,
                "contingencies": result.get("contingencies") if requires_hitl else None,
                "rejected_joints": rejected_joints,
                "requires_hitl": requires_hitl,
                "high_cognitive_load": high_cognitive_load,
                "correction_report": result.get("correction_report"),
                "server_time": time.time(),
            }))

    except WebSocketDisconnect:
        logger.info("XR stream connection closed")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
