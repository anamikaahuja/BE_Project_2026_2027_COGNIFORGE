import pytest

from app.agents.graph import app_graph


def _initial_state(raw_telemetry: dict) -> dict:
    return {
        "raw_telemetry": raw_telemetry,
        "frames": [],
        "primitives": [],
        "scene_graph": {},
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


@pytest.mark.asyncio
async def test_pipeline_processes_camel_case_frame_end_to_end():
    payload = {
        "timestamp": 1.0,
        "leftHand": {
            "handedness": "left",
            "joints": [
                {
                    "name": "index-finger-tip",
                    "position": {"x": 0.2, "y": 0.9, "z": -0.4},
                    "orientation": {"x": 0, "y": 0, "z": 0, "w": 1},
                }
            ],
        },
    }
    result = await app_graph.ainvoke(_initial_state(payload))

    # The single biggest regression this project shipped with: a schema
    # mismatch made every frame die inside the Gateway node. If that bug
    # reappears, `errors` will be non-empty and robot_trajectory will be [].
    assert result.get("errors") == []
    assert result.get("robot_trajectory")
    assert len(result["robot_trajectory"][0]["joints"]) == 6


@pytest.mark.asyncio
async def test_pipeline_rejects_malicious_out_of_bounds_telemetry():
    payload = {
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
    result = await app_graph.ainvoke(_initial_state(payload))
    assert any("Gateway rejection" in e for e in result.get("errors", []))


@pytest.mark.asyncio
async def test_pipeline_emergency_stop_when_hand_too_close_to_base():
    # Robot base sits at (0, 0, -0.6) in the WebXR scene; place the hand
    # within the 0.15m safety radius of it.
    payload = {
        "timestamp": 1.0,
        "leftHand": {
            "handedness": "left",
            "joints": [
                {
                    "name": "index-finger-tip",
                    "position": {"x": 0.02, "y": 0.02, "z": -0.58},
                    "orientation": {"x": 0, "y": 0, "z": 0, "w": 1},
                }
            ],
        },
    }
    result = await app_graph.ainvoke(_initial_state(payload))
    assert result.get("meta_decision") == "EMERGENCY_STOP"
    assert result["robot_trajectory"][0]["joints"] == [0.0] * 6


@pytest.mark.asyncio
async def test_pipeline_does_not_emergency_stop_for_desktop_mouse_fallback_position():
    # Regression guard for the z-threshold bug: Engine.ts's desktop
    # mouse-fallback reports the hand at roughly (-0.5+mouseX*0.15, -0.1,
    # 0.25+mouseY*0.15) -- see HandTracking.ts's mouseFallbackHand -- which
    # must NOT be treated as "near the robot base" (0, 0, -0.6).
    payload = {
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
    }
    result = await app_graph.ainvoke(_initial_state(payload))
    assert result.get("meta_decision") != "EMERGENCY_STOP"
