import json

from fastapi.testclient import TestClient

from app.main import TRAINING_WAYPOINT_TOLERANCE, app
from app.robotics.kinematics import MotionPlanner
from app.robotics.pico_bridge import pico_arm_bridge

# Same fixture as test_main_ws.py's SAFE_HAND_FRAME -- see that file for why
# these specific coordinates matter (genuinely within reach, not just
# assumed to be).
HAND_FRAME = {
    "timestamp": 1.0,
    "leftHand": {
        "handedness": "left",
        "joints": [
            {
                "name": "index-finger-tip",
                "position": {"x": -0.5, "y": -0.1, "z": 0.25},
                "orientation": {"x": 0, "y": 0, "z": 0, "w": 1},
            }
        ],
    },
    "scene_objects": {},
}


def _achieved_position_for(frame: dict) -> list:
    """Independently recomputes where the arm actually ends up for a given
    frame, so the test isn't just checking "some number came back" but that
    the returned distance matches a value computed the same way
    run_benchmark.py's tfs metric is (forward_kinematics of the resulting
    joints), from a second, separate MotionPlanner instance."""
    planner = MotionPlanner()
    hand = frame["leftHand"]["joints"][0]["position"]
    target = {"x": hand["x"] + 0.1, "y": hand["y"], "z": hand["z"]}  # matches IntentPredictionAgent's reach_forward offset
    joints = planner.solve_ik(target)
    return list(planner.forward_kinematics(joints)[:3, 3])


def test_training_result_absent_without_a_training_target():
    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        ws.send_text(json.dumps(HAND_FRAME))
        resp = json.loads(ws.receive_text())
        assert resp["training_result"] is None


def test_training_result_reports_reached_for_a_nearby_target():
    achieved = _achieved_position_for(HAND_FRAME)
    frame = dict(HAND_FRAME)
    frame["training_target"] = {"x": achieved[0], "y": achieved[1], "z": achieved[2]}

    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        ws.send_text(json.dumps(frame))
        resp = json.loads(ws.receive_text())
        result = resp["training_result"]
        assert result is not None
        assert result["reached"] is True
        assert result["distance"] < TRAINING_WAYPOINT_TOLERANCE
        assert result["tfs"] > 0.9


def test_training_result_reports_not_reached_for_a_far_target():
    frame = dict(HAND_FRAME)
    frame["training_target"] = {"x": 0.5, "y": 0.5, "z": 0.5}  # far from where HAND_FRAME actually reaches

    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        ws.send_text(json.dumps(frame))
        resp = json.loads(ws.receive_text())
        result = resp["training_result"]
        assert result is not None
        assert result["reached"] is False
        assert result["distance"] > TRAINING_WAYPOINT_TOLERANCE


def test_training_mode_suppresses_physical_arm_even_when_pico_enabled():
    """Safety regression test: an operator practicing in Training Mode must
    never move a real motor, even if a Pico happens to already be
    configured from a previous Arm Control session."""
    import socket

    listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    listener.bind(("127.0.0.1", 0))
    listener.settimeout(0.3)
    port = listener.getsockname()[1]

    pico_arm_bridge.configure("127.0.0.1", port)
    try:
        frame = dict(HAND_FRAME)
        frame["training_mode"] = True

        client = TestClient(app)
        with client.websocket_connect("/ws/stream") as ws:
            ws.send_text(json.dumps(frame))
            ws.receive_text()

        try:
            listener.recvfrom(256)
            received_something = True
        except socket.timeout:
            received_something = False
        assert received_something is False, "Pico received a command during training_mode -- safety gate failed"
    finally:
        pico_arm_bridge.disable()
        listener.close()
