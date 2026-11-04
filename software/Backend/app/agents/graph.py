from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.perception import PerceptionEngine
from app.core.audit import auditor
from app.core.memory import global_memory
from app.robotics.coordinator import CTDECoordinator
from app.robotics.kinematics import MotionPlanner
from app.robotics.simulation import CollisionValidator
from app.shared.schemas import FrameData


class AgentState(TypedDict):
    """Shared state threaded through the LangGraph pipeline. Mirrors the
    proposal's Ch.5 schema (raw_frames / action_sequence / motion_plan /
    correction_report / memory_context / meta_status / final_instructions /
    error_log) while keeping the richer contingency-game + BDI fields the
    live shared-control layer relies on."""

    raw_telemetry: Optional[dict]
    frames: List[FrameData]
    primitives: List[str]
    scene_graph: Dict
    current_action: str
    robot_trajectory: List[dict]
    contingencies: Optional[List[List[float]]]
    rejected_trajectory: Optional[List[dict]]
    errors: List[str]
    meta_decision: str

    # Correction / QA (Error Correction Agent)
    correction_report: Optional[Dict[str, Any]]

    # BDI + contingency-game planning
    beliefs: Dict[str, Any]
    desires: List[str]
    intentions: List[str]
    human_intents: List[Dict[str, Any]]
    insight_context: str

    # Memory Agent (skill-library warm start)
    memory_context: Optional[Dict[str, Any]]

    # Guards against an unbounded refine loop between MotionPlanning <-> ErrorCorrection
    refine_count: int


class BaseAgent:
    def __init__(self, name: str, objective: str):
        self.objective = objective
        self.name = name

    def run(self, state: AgentState) -> dict:
        perception_data = self.perceive(state)
        action = self.act(perception_data, state)
        action = self.rethink(action, perception_data)

        if self.name == "Meta":
            global_memory.extract_insight([action], self.name)

        global_memory.add_interaction(self.name, "Environment", {"action": action})
        log_hash = auditor.log_decision(self.name, "P-A-R_LOOP", {
            "perception": str(perception_data)[:200],
            "action": str(action)[:200],
        })
        action["log_hash"] = log_hash
        return action

    def perceive(self, state: AgentState) -> Any:
        return state

    def act(self, perception_data: Any, state: AgentState) -> dict:
        return {}

    def rethink(self, action: dict, perception_data: Any) -> dict:
        return action


# ------------------------------------------------------------- Memory node --
def memory_retrieval_node(state: AgentState):
    context = global_memory.retrieve_insights("robot_operation")
    similar = global_memory.find_similar_skills("robot manipulation task", k=3)
    warm_start = None
    if similar:
        try:
            import json as _json
            warm_start = _json.loads(similar[0].get("final_joints", "null"))
        except Exception:
            warm_start = None
    return {
        "insight_context": context,
        "memory_context": {"similar_tasks": similar, "warm_start_joints": warm_start},
    }


class GatewayAgent(BaseAgent):
    """Sanitizes and validates incoming WebXR telemetry before it enters the
    cognitive pipeline. Rejects out-of-bounds coordinates (defends against
    malformed/adversarial input, per the project's multi-agent-security
    literature review)."""

    def __init__(self):
        super().__init__("Gateway", "Sanitize and validate incoming telemetry data.")

    def perceive(self, state: AgentState):
        return state.get("raw_telemetry")

    def act(self, raw_telemetry: Any, state: AgentState) -> dict:
        if not raw_telemetry:
            return {}
        try:
            sanitized_frame = FrameData(**raw_telemetry)
            for hand in (sanitized_frame.left_hand, sanitized_frame.right_hand):
                if hand and hand.joints:
                    for j in hand.joints:
                        if abs(j.position.x) > 10 or abs(j.position.y) > 10 or abs(j.position.z) > 10:
                            raise ValueError("Telemetry bounds violation (potential malicious input)")
            return {"frames": state.get("frames", [])[-9:] + [sanitized_frame]}
        except Exception as e:
            return {"errors": state.get("errors", []) + [f"Gateway rejection: {e}"]}


class PerceptionAgent(BaseAgent):
    """Extracts semantically meaningful action primitives (gesture, grasp
    type, movement segmentation) from sanitized hand-joint data."""

    def __init__(self):
        super().__init__("Perception", "Extract high-level intent from sanitized joint data.")
        self.engine = PerceptionEngine()

    def perceive(self, state: AgentState):
        frames = state.get("frames", [])
        return frames[-1] if frames else None

    def act(self, last_frame: Optional[FrameData], state: AgentState) -> dict:
        if not last_frame:
            return {}
        hand = last_frame.left_hand or last_frame.right_hand
        gesture = self.engine.detect_gestures(hand)
        grasp = self.engine.classify_grasp(hand)

        motion_state = "IDLE"
        if hand and hand.joints:
            index_tip = next((j for j in hand.joints if j.name == "index-finger-tip"), hand.joints[0])
            motion_state = self.engine.segment_action(index_tip.position)

        primitive = "GRASP" if gesture == "PINCH" else ("MOVING" if motion_state == "MOVING" else "IDLE")
        return {"primitives": [primitive], "current_action": f"{primitive}:{grasp}"}


class VisualReasoningAgent(BaseAgent):
    def __init__(self):
        super().__init__("VisualReasoning", "Construct scene graph for proactive planning.")

    def perceive(self, state: AgentState):
        return state.get("scene_graph", {})

    def act(self, scene_graph: Any, state: AgentState) -> dict:
        return {"scene_graph": scene_graph}


class IntentPredictionAgent(BaseAgent):
    """Generates multiple human-intent hypotheses (contingency-game style)
    from the current hand trajectory, so downstream planning can commit to a
    safe common trunk while preparing branches per hypothesis.

    A second ("drop_hand") hypothesis is only offered when the recent
    trajectory shows real downward motion consistent with that gesture --
    this used to be emitted unconditionally on every single frame with any
    hand present, which meant MotionPlanningAgent (below) generated a
    contingency and requested HITL review continuously: the 2-second
    cooldown in main.py's WebSocket handler could suppress the reappearing
    review banner for a couple of seconds after each approval, but with the
    operator's hand still moving, the very next frame past that window
    always re-declared REQUIRE_HITL_REVIEW regardless of what was actually
    happening -- there was never a real "resolved, no more contingencies"
    state to reach. Tying the second hypothesis to genuine velocity signal
    (available via the Gateway's 10-frame rolling window) restores the
    system's actual claim: review is requested when a trajectory is
    genuinely ambiguous, not on a fixed schedule regardless of intent.

    The first cut of this fix used a 1.5cm-per-frame threshold, which
    sounds small but isn't: at the ~20Hz the frontend streams at, ordinary
    continuous mouse-driven control crosses 1.5cm between samples on almost
    any deliberate movement, so the dialog kept reappearing during normal
    use even though the artifactual "every single frame" trigger was gone.
    The threshold below is a meaningful fraction of the drop_hand
    hypothesis's own 0.2m target offset -- large enough that routine
    steering doesn't cross it -- and the motion must also be predominantly
    vertical (not incidental to a fast horizontal movement), so a quick
    sideways reach doesn't get misread as a drop just because real mouse
    paths are rarely perfectly axis-aligned.

    "Downward" is measured on Z, not Y: CollisionValidator's floor check
    (FLOOR_Z_CLEARANCE, backend/app/robotics/simulation.py) and the arm's
    own empirically-measured kinematics both treat Z as height, so this
    (and drop_hand's target offset below) follow that convention rather
    than Three.js's Y-up scene convention the frontend renders with --
    those aren't the same axis in this backend's coordinate frame, and
    using Y here previously meant "drop toward the floor" didn't actually
    move the target any closer to the floor CollisionValidator checks."""

    DROP_VELOCITY_THRESHOLD = 0.06  # meters/frame of downward motion to count as a deliberate drop gesture

    def __init__(self):
        super().__init__("IntentPredictor", "Generate multiple human intent hypotheses.")

    def perceive(self, state: AgentState):
        frames = state.get("frames", [])
        return frames[-2:]

    def act(self, recent_frames: List[FrameData], state: AgentState) -> dict:
        last_frame = recent_frames[-1] if recent_frames else None
        hand = last_frame.left_hand or last_frame.right_hand if last_frame else None
        if not hand or not hand.joints:
            # Matches MotionPlanner.HOME_POSE's own forward-kinematics
            # reach (~(-0.66, -0.11, 0.22)) rather than an arbitrary point,
            # so an idle frame doesn't ask the arm to lurch somewhere it
            # was never actually reaching before.
            return {"human_intents": [{"intent": "idle", "probability": 1.0, "target_pos": {"x": -0.5, "y": -0.1, "z": 0.25}}]}

        index_tip = next((j for j in hand.joints if j.name == "index-finger-tip"), hand.joints[0])
        pos = index_tip.position.model_dump()
        h1_pos = {"x": pos["x"] + 0.1, "y": pos["y"], "z": pos["z"]}

        downward_velocity = 0.0
        horizontal_velocity = 0.0
        if len(recent_frames) == 2:
            prev_hand = recent_frames[0].left_hand or recent_frames[0].right_hand
            if prev_hand and prev_hand.joints:
                prev_tip = next((j for j in prev_hand.joints if j.name == "index-finger-tip"), prev_hand.joints[0])
                prev_pos = prev_tip.position
                downward_velocity = prev_pos.z - pos["z"]
                horizontal_velocity = ((prev_pos.x - pos["x"]) ** 2 + (prev_pos.y - pos["y"]) ** 2) ** 0.5

        is_ambiguous_drop = (
            downward_velocity > self.DROP_VELOCITY_THRESHOLD
            and downward_velocity > horizontal_velocity
        )
        if not is_ambiguous_drop:
            return {"human_intents": [{"intent": "reach_forward", "probability": 1.0, "target_pos": h1_pos}]}

        drop_probability = min(0.3 + downward_velocity, 0.6)
        h2_pos = {"x": pos["x"], "y": pos["y"], "z": max(pos["z"] - 0.2, 0.05)}
        return {"human_intents": [
            {"intent": "reach_forward", "probability": 1.0 - drop_probability, "target_pos": h1_pos},
            {"intent": "drop_hand", "probability": drop_probability, "target_pos": h2_pos},
        ]}


class ReactiveAgent(BaseAgent):
    """Immediate reflex safety layer -- runs before deliberative planning so
    an emergency stop can never be delayed behind BDI/contingency reasoning.

    Triggers on proximity to the robot base rather than a raw axis
    threshold: the earlier `z < 0.2` check assumed the hand's z-coordinate
    directly encoded "distance from robot", but the robot base sits at
    (0, 0, -0.6) in the WebXR scene -- so a plain z threshold would
    misfire for perfectly safe hand positions (e.g. the desktop
    mouse-fallback path, which reports z=-0.5) while failing to protect
    positions actually close to the base at other x/y offsets."""

    ROBOT_BASE = (0.0, 0.0, -0.6)
    SAFETY_RADIUS = 0.15  # meters

    def __init__(self):
        super().__init__("Reactive", "Immediate response to safety threats.")

    def perceive(self, state: AgentState):
        frames = state.get("frames", [])
        return frames[-1] if frames else None

    def act(self, last_frame: Optional[FrameData], state: AgentState) -> dict:
        hand = last_frame.left_hand or last_frame.right_hand if last_frame else None
        if not hand or not hand.joints:
            return {"meta_decision": "CONTINUE"}

        index_tip = next((j for j in hand.joints if j.name == "index-finger-tip"), hand.joints[0])
        p = index_tip.position
        bx, by, bz = self.ROBOT_BASE
        distance = ((p.x - bx) ** 2 + (p.y - by) ** 2 + (p.z - bz) ** 2) ** 0.5

        if distance < self.SAFETY_RADIUS:
            return {"meta_decision": "EMERGENCY_STOP", "robot_trajectory": [{"joints": [0.0] * 6}]}
        return {"meta_decision": "CONTINUE"}


class BDIPlanningAgent(BaseAgent):
    def __init__(self):
        super().__init__("BDIPlanner", "Long-term rational planning (Belief-Desire-Intention).")

    def perceive(self, state: AgentState):
        return {"intents": state.get("human_intents", []), "insights": state.get("insight_context", "")}

    def act(self, perception: Any, state: AgentState) -> dict:
        beliefs = state.get("beliefs", {})
        beliefs["human_intent_most_likely"] = perception["intents"][0] if perception["intents"] else None

        intentions = state.get("intentions", [])
        if beliefs.get("human_intent_most_likely", {}).get("intent") == "reach_forward":
            intentions = ["Assist Handover"]

        return {"beliefs": beliefs, "intentions": intentions}


class MotionPlanningAgent(BaseAgent):
    """Resolves each intent hypothesis to real robot joint angles via Damped
    Least Squares inverse kinematics (app.robotics.kinematics.MotionPlanner),
    replacing the earlier placeholder that fed raw hand XYZ straight into the
    joint-angle array."""

    def __init__(self):
        super().__init__("MotionPlanner", "Resolve intent hypotheses to collision-aware joint trajectories.")
        self.coordinator = CTDECoordinator()
        self.planner = MotionPlanner()

    def perceive(self, state: AgentState):
        return state.get("human_intents", []), state.get("memory_context"), state.get("refine_count", 0)

    def act(self, perception: Any, state: AgentState) -> dict:
        intents, memory_context, refine_count = perception
        if not intents:
            return {"robot_trajectory": [{"joints": [0.0] * 6}]}

        seed = None
        if memory_context and memory_context.get("warm_start_joints"):
            import numpy as np
            seed = np.array(memory_context["warm_start_joints"])

        primary_intent = dict(intents[0])
        if refine_count > 0:
            # Auto-correction nudge: prior attempt was rejected (e.g. floor
            # clearance), so retry with a higher approach -- mirrors the
            # proposal's "Auto-Correct (minor deviations)" loop.
            target = dict(primary_intent["target_pos"])
            target["z"] = target.get("z", 0.0) + 0.1 * refine_count
            primary_intent["target_pos"] = target

        self.planner.q = seed.copy() if seed is not None else self.planner.q
        primary_joints = self.planner.solve_ik(primary_intent["target_pos"], seed=seed)

        contingencies = []
        for intent in intents[1:]:
            contingencies.append(self.planner.solve_ik(intent["target_pos"], seed=seed))

        return {
            "robot_trajectory": [{"joints": primary_joints}],
            "contingencies": contingencies,
            "meta_decision": "REQUIRE_HITL_REVIEW" if contingencies else "EXECUTE",
        }


class ErrorCorrectionAgent(BaseAgent):
    """Quality-assurance layer between motion planning and execution.
    Combines rule-based joint/workspace checks with PyBullet (or analytic
    fallback) collision validation, classifying anomalies as
    auto-correctable, user-review-required, or critical."""

    def __init__(self):
        super().__init__("ErrorCorrection", "Detect and classify motion-plan anomalies before dispatch.")
        self.validator = CollisionValidator()

    def perceive(self, state: AgentState):
        return state.get("robot_trajectory", [])

    def act(self, traj: Any, state: AgentState) -> dict:
        # A collision-free trajectory means there's nothing for THIS agent
        # to flag -- it does not mean the upstream decision was EXECUTE.
        # This used to unconditionally overwrite meta_decision to EXECUTE
        # here, clobbering MotionPlanningAgent's REQUIRE_HITL_REVIEW
        # whenever the trajectory happened to validate cleanly -- which,
        # for an intent-ambiguity review (as opposed to a collision
        # rejection), is the *normal* case: a genuinely ambiguous but
        # perfectly safe trajectory validates fine, so ambiguity-based
        # review could never actually reach the operator. Preserving an
        # already-pending REQUIRE_HITL_REVIEW here is what makes that
        # review possible to see at all.
        upstream_decision = state.get("meta_decision")

        if not traj:
            return {"meta_decision": upstream_decision or "EXECUTE", "correction_report": {"classification": "none", "anomalies": []}}

        joints = traj[0].get("joints", [])
        ok, reason = self.validator.validate_waypoint(joints)

        if ok:
            decision = "REQUIRE_HITL_REVIEW" if upstream_decision == "REQUIRE_HITL_REVIEW" else "EXECUTE"
            return {"meta_decision": decision, "correction_report": {"classification": "none", "anomalies": []}}

        refine_count = state.get("refine_count", 0) + 1
        MAX_REFINE_ATTEMPTS = 3

        # Classify severity: floor/workspace violations are auto-correctable
        # (clamp and retry), self-collision is escalated for user review.
        classification = "user_review" if reason and "collision" in reason else "auto_correctable"

        if refine_count >= MAX_REFINE_ATTEMPTS:
            # Escalate to critical rather than looping forever: stop the arm
            # and hand the frame to the operator instead of retrying.
            return {
                "meta_decision": "REQUIRE_HITL_REVIEW",
                "rejected_trajectory": traj,
                "robot_trajectory": [{"joints": [0.0] * 6}],
                "refine_count": refine_count,
                "correction_report": {
                    "classification": "critical",
                    "anomalies": [reason] if reason else [],
                    "corrected": False,
                    "message": f"Exceeded {MAX_REFINE_ATTEMPTS} refine attempts; escalated to operator.",
                },
            }

        return {
            "meta_decision": "REFINE",
            "rejected_trajectory": traj,
            "robot_trajectory": [],
            "refine_count": refine_count,
            "correction_report": {
                "classification": classification,
                "anomalies": [reason] if reason else [],
                "corrected": classification == "auto_correctable",
            },
        }


class MetaAgent(BaseAgent):
    """Supervisory node: finalizes pipeline decisions, and on a successful
    EXECUTE persists the demonstrated trajectory into the skill library so
    future sessions can warm-start from it."""

    def __init__(self):
        super().__init__("Meta", "Hybrid coordination logic to finalize the pipeline.")

    def perceive(self, state: AgentState):
        return state.get("meta_decision", "EXECUTE"), state.get("robot_trajectory", [])

    def act(self, perception: Any, state: AgentState) -> dict:
        decision, traj = perception
        if decision == "EXECUTE" and traj:
            global_memory.save_skill(
                session_id=f"live_{id(state)}",
                description=str(state.get("current_action", "manipulation task")),
                trajectory=[t.get("joints", []) for t in traj],
            )
        return {"meta_decision": decision}


# ------------------------------------------------------------- Instances --
gateway_agent = GatewayAgent()
perception_agent = PerceptionAgent()
visual_reasoning_agent = VisualReasoningAgent()
intent_predictor = IntentPredictionAgent()
reactive_agent = ReactiveAgent()
bdi_planner = BDIPlanningAgent()
motion_planner_agent = MotionPlanningAgent()
error_correction_agent = ErrorCorrectionAgent()
meta_agent = MetaAgent()


def gateway_node(state: AgentState): return gateway_agent.run(state)
def perception_node(state: AgentState): return perception_agent.run(state)
def scene_graph_node(state: AgentState): return visual_reasoning_agent.run(state)
def intent_prediction_node(state: AgentState): return intent_predictor.run(state)
def reactive_node(state: AgentState): return reactive_agent.run(state)
def bdi_node(state: AgentState): return bdi_planner.run(state)
def motion_planning_node(state: AgentState): return motion_planner_agent.run(state)
def error_correction_node(state: AgentState): return error_correction_agent.run(state)
def meta_node(state: AgentState): return meta_agent.run(state)


def check_errors(state: AgentState) -> str:
    return "meta" if state.get("errors") else "perception"


def check_emergency(state: AgentState) -> str:
    return "meta" if state.get("meta_decision") == "EMERGENCY_STOP" else "bdi"


def should_refine(state: AgentState) -> str:
    return "motion_planning" if state.get("meta_decision") == "REFINE" else "meta"


workflow = StateGraph(AgentState)

workflow.add_node("memory_retrieval", memory_retrieval_node)
workflow.add_node("gateway", gateway_node)
workflow.add_node("perception", perception_node)
workflow.add_node("scene_graph", scene_graph_node)
workflow.add_node("intent_prediction", intent_prediction_node)
workflow.add_node("reactive", reactive_node)
workflow.add_node("bdi", bdi_node)
workflow.add_node("motion_planning", motion_planning_node)
workflow.add_node("error_correction", error_correction_node)
workflow.add_node("meta", meta_node)

workflow.set_entry_point("gateway")
workflow.add_conditional_edges("gateway", check_errors, {"perception": "perception", "meta": "meta"})
workflow.add_edge("perception", "memory_retrieval")
workflow.add_edge("memory_retrieval", "scene_graph")
workflow.add_edge("scene_graph", "intent_prediction")
workflow.add_edge("intent_prediction", "reactive")
workflow.add_conditional_edges("reactive", check_emergency, {"bdi": "bdi", "meta": "meta"})
workflow.add_edge("bdi", "motion_planning")
workflow.add_edge("motion_planning", "error_correction")
workflow.add_conditional_edges("error_correction", should_refine, {"motion_planning": "motion_planning", "meta": "meta"})
workflow.add_edge("meta", END)

app_graph = workflow.compile()
