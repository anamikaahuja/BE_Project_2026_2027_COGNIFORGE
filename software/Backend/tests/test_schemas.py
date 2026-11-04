from app.shared.schemas import FrameData


def test_frame_data_accepts_camel_case_from_webxr_client():
    """Regression test: the WebXR frontend sends `leftHand`/`rightHand`
    (camelCase). Prior to the CamelModel alias fix, this raised a validation
    mismatch that silently broke the Gateway agent on every frame."""
    payload = {
        "timestamp": 12345.6,
        "leftHand": {
            "handedness": "left",
            "joints": [
                {
                    "name": "index-finger-tip",
                    "position": {"x": 0.1, "y": 1.2, "z": -0.5},
                    "orientation": {"x": 0, "y": 0, "z": 0, "w": 1},
                }
            ],
        },
    }
    frame = FrameData(**payload)
    assert frame.left_hand is not None
    assert frame.left_hand.joints[0].name == "index-finger-tip"
    assert frame.left_hand.joints[0].position.y == 1.2


def test_frame_data_ignores_unknown_top_level_fields():
    payload = {
        "timestamp": 1.0,
        "leftHand": None,
        "rightHand": None,
        "robotFeedback": {"currentJoints": [0, 0, 0, 0, 0, 0]},
        "sceneObjects": {},
    }
    frame = FrameData(**payload)
    assert frame.left_hand is None
    assert frame.right_hand is None
