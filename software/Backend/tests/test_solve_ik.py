import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.robotics.kinematics import MotionPlanner


def test_solve_ik_returns_six_joints_reaching_target():
    """Regression test for the AR tap-to-reach feature: the frontend posts
    a single target and expects joints that actually place the end
    effector near that target, not just any six numbers."""
    client = TestClient(app)
    target = {"x": 0.3, "y": 0.2, "z": 0.4}

    res = client.post("/solve_ik", json=target)
    assert res.status_code == 200

    joints = res.json()["joints"]
    assert len(joints) == 6

    planner = MotionPlanner()
    achieved = planner.forward_kinematics(joints)[:3, 3]
    error = np.linalg.norm(achieved - np.array([target["x"], target["y"], target["z"]]))
    assert error < 0.05, f"solve_ik did not converge closely enough, error={error}"


def test_solve_ik_rejects_malformed_request():
    client = TestClient(app)
    res = client.post("/solve_ik", json={"x": 0.3, "y": 0.2})  # missing z
    assert res.status_code == 422
