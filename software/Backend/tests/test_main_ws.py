import json

from fastapi.testclient import TestClient

from app.main import app

# Genuinely within the robot's real reach, empirically verified (not just
# checked against the workspace-radius formula) by sweeping this range
# through the actual solve_ik + validate_waypoint pipeline -- see
# HandTracking.ts's mouseFallbackHand, which this mirrors. The original
# fixture used (x=0.2, y=1.2, z=0.3): y=1.2 alone, with no offset at all,
# is already 1.3m from origin, 53% beyond WORKSPACE_RADIUS (0.85m). Every
# test built on that fixture was inadvertently exercising
# ErrorCorrectionAgent's "collision/workspace validation failed 3 times,
# escalate to HITL" path rather than the ambiguity-detection path it
# claimed to test -- both set requires_hitl=True, so the assertions passed
# for the wrong reason. Z is the height axis here (matching
# CollisionValidator's FLOOR_Z_CLEARANCE check and the arm's own
# kinematics), not Y.
SAFE_HAND_FRAME = {
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


def test_requires_hitl_flag_present_and_boolean():
    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        ws.send_text(json.dumps(SAFE_HAND_FRAME))
        resp = json.loads(ws.receive_text())
        assert isinstance(resp["requires_hitl"], bool)


def test_desktop_mouse_default_position_stays_within_reach():
    """Regression test for the actual dominant cause of a live bug report
    ("no matter which button I click, review keeps coming back"): the
    desktop mouse-fallback's coordinate mapping was never calibrated
    against the robot's real kinematics at all -- even the mouse sitting
    dead center produced a target whose solved position was below the
    floor and 53% beyond the workspace radius. Every such frame
    legitimately failed collision/workspace validation and, after 3 refine
    attempts, escalated to a critical REQUIRE_HITL_REVIEW that clicking
    "Approve" could never actually resolve, since the underlying position
    was never reachable. A held-still frame at the mouse's exact
    center/default position must never reach that critical escalation --
    correction_report's classification should never be "critical" for a
    position this ordinary."""
    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        for _ in range(4):
            ws.send_text(json.dumps(SAFE_HAND_FRAME))
            resp = json.loads(ws.receive_text())
            report = resp.get("correction_report") or {}
            assert report.get("classification") != "critical"
            assert resp["requires_hitl"] is False


def _hand_frame(z: float) -> dict:
    frame = json.loads(json.dumps(SAFE_HAND_FRAME))  # deep copy
    frame["leftHand"]["joints"][0]["position"]["z"] = z
    return frame


def test_hitl_approval_suppresses_requires_hitl_for_cooldown_window():
    """Regression test: IntentPredictionAgent only offers a second
    ("drop_hand") hypothesis when the last two frames show genuine downward
    (decreasing Z) velocity -- MotionPlanningAgent then only requests
    REQUIRE_HITL_REVIEW when that second hypothesis exists. Sending two
    frames with a real downward move triggers it; the cooldown in
    main.py's websocket handler must then suppress the flag for a short
    window after `hitl_approved: true` is received, even though the next
    frame continues the same downward trend and would otherwise
    re-trigger review."""
    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        ws.send_text(json.dumps(_hand_frame(0.35)))
        ws.receive_text()
        ws.send_text(json.dumps(_hand_frame(0.25)))  # 0.10m downward -- above the ambiguity threshold, still in reach
        first = json.loads(ws.receive_text())
        assert first["requires_hitl"] is True

        approve_frame = _hand_frame(0.15)  # continues the downward trend
        approve_frame["hitl_approved"] = True
        ws.send_text(json.dumps(approve_frame))
        after_approve = json.loads(ws.receive_text())
        assert after_approve["requires_hitl"] is False

        # Immediately after approval, still within the cooldown window --
        # despite the hand still moving down, which would otherwise
        # legitimately re-trigger REQUIRE_HITL_REVIEW.
        ws.send_text(json.dumps(_hand_frame(0.10)))
        follow_up = json.loads(ws.receive_text())
        assert follow_up["requires_hitl"] is False


def test_ordinary_continuous_control_does_not_require_hitl():
    """Regression test for the real failure mode a live user hit: the first
    fix tied HITL review to any downward motion above 1.5cm/frame, which
    sounds conservative but isn't -- at the ~20Hz the frontend streams at,
    ordinary continuous mouse-driven control (steering the arm around, not
    performing a deliberate drop gesture) routinely crosses 1.5cm between
    samples, so the review dialog kept reappearing during normal use even
    though the "every single frame" bug was fixed. A slow, steady downward
    drift emulating normal control (2cm/frame, well under the real
    drop-gesture threshold) must never trigger review."""
    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        z = 0.35
        for _ in range(8):
            ws.send_text(json.dumps(_hand_frame(z)))
            resp = json.loads(ws.receive_text())
            assert resp["requires_hitl"] is False
            z -= 0.02


def test_static_hand_never_requires_hitl():
    """A hand that isn't moving has no ambiguity to review -- regression
    guard for the bug this whole file's cooldown test used to route around:
    IntentPredictionAgent previously emitted a second hypothesis
    unconditionally on every frame, so REQUIRE_HITL_REVIEW fired
    continuously regardless of actual hand motion, and the review dialog
    could never permanently clear during normal continuous use."""
    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        ws.send_text(json.dumps(SAFE_HAND_FRAME))
        ws.receive_text()
        for _ in range(5):
            ws.send_text(json.dumps(SAFE_HAND_FRAME))
            resp = json.loads(ws.receive_text())
            assert resp["requires_hitl"] is False


def test_malicious_out_of_bounds_frame_does_not_crash_connection():
    """Regression test: a Gateway-rejected frame leaves `robot_trajectory`
    present-but-empty in the graph state. `.get("robot_trajectory", [{}])`
    does not fall back for a present-but-empty list, so `[][0]` raised
    IndexError and silently dropped the WebSocket connection on any
    malformed/adversarial frame -- a real availability bug, not just a
    cosmetic one."""
    malicious_frame = {
        "timestamp": 1.0,
        "leftHand": {
            "handedness": "left",
            "joints": [
                {
                    "name": "index-finger-tip",
                    "position": {"x": 999.0, "y": 0, "z": 0},
                    "orientation": {"x": 0, "y": 0, "z": 0, "w": 1},
                }
            ],
        },
    }
    client = TestClient(app)
    with client.websocket_connect("/ws/stream") as ws:
        ws.send_text(json.dumps(malicious_frame))
        resp = json.loads(ws.receive_text())
        assert resp["robot_joints"] == []

        # Connection must still be alive for a subsequent, valid frame.
        ws.send_text(json.dumps(SAFE_HAND_FRAME))
        resp2 = json.loads(ws.receive_text())
        assert resp2["status"] == "planned"
