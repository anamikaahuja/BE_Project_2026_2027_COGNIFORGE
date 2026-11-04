import numpy as np

from app.robotics.kinematics import MotionPlanner


def test_forward_kinematics_returns_homogeneous_transform():
    planner = MotionPlanner()
    T = planner.forward_kinematics([0, 0, 0, 0, 0, 0])
    assert T.shape == (4, 4)
    assert np.allclose(T[3, :], [0, 0, 0, 1])


def test_ik_converges_to_reachable_target():
    planner = MotionPlanner()
    # A point well within the UR5-scale reach envelope.
    target = {"x": 0.3, "y": 0.2, "z": 0.4}
    joints = planner.solve_ik(target, seed=np.zeros(6))

    T = planner.forward_kinematics(joints)
    achieved = T[:3, 3]
    error = np.linalg.norm(achieved - np.array([target["x"], target["y"], target["z"]]))

    assert error < 0.05, f"IK did not converge closely enough, error={error}"


def test_ik_respects_joint_limits():
    planner = MotionPlanner()
    joints = planner.solve_ik({"x": 5.0, "y": 5.0, "z": 5.0}, seed=np.zeros(6))
    assert all(-2 * np.pi - 1e-6 <= j <= 2 * np.pi + 1e-6 for j in joints)


def test_reset_returns_home_pose():
    # All-zero joints put the UR5 in a degenerate, foreshortened pose that
    # doesn't visually read as an articulated arm; reset returns to a bent
    # "ready" pose instead (see MotionPlanner.HOME_POSE).
    planner = MotionPlanner()
    planner.q = np.array([1.0] * 6)
    assert planner.reset() == planner.HOME_POSE.tolist()
