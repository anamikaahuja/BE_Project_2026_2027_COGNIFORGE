import math
import random

from app.robotics.arm5dof import MAX_REACH, Arm5DofKinematics


def test_solve_ik_round_trips_through_forward_kinematics():
    """The core correctness property for this arm's IK: solving for a
    reachable target and feeding the result back through forward
    kinematics should recover that target. This caught a real sign error
    during development -- the shoulder-angle correction term needs to be
    SUBTRACTED, not added, and a naive implementation that gets this wrong
    still produces syntactically valid joint angles, just ones that point
    at the wrong place in space, which a shape/type-only test would never
    catch."""
    arm = Arm5DofKinematics()
    rng = random.Random(42)
    max_err = 0.0
    for _ in range(500):
        x = rng.uniform(-0.2, 0.2)
        y = rng.uniform(-0.2, 0.2)
        z = rng.uniform(0.0, 0.25)
        target = {"x": x, "y": y, "z": z}

        # Skip targets we already know are beyond reach -- those are
        # deliberately clamped by solve_ik and covered separately below.
        r_wrist_upper_bound = math.hypot(x, y) + arm.l3
        z_wrist_upper_bound = z + arm.l3
        if math.hypot(r_wrist_upper_bound, z_wrist_upper_bound) > MAX_REACH * 1.5:
            continue

        joints = arm.solve_ik(target)
        got = arm.forward_kinematics(joints)
        err = math.dist((x, y, z), got)
        max_err = max(max_err, err)

    assert max_err < 0.01, f"IK/FK round-trip error too large: {max_err}"


def test_solve_ik_clamps_targets_beyond_reach_without_crashing():
    arm = Arm5DofKinematics()
    far_target = {"x": 5.0, "y": 5.0, "z": 5.0}
    joints = arm.solve_ik(far_target)
    assert len(joints) == 5
    assert all(math.isfinite(j) for j in joints)


def test_solve_ik_gripper_angle_passes_through_unchanged():
    arm = Arm5DofKinematics()
    joints = arm.solve_ik({"x": 0.1, "y": 0.0, "z": 0.1}, gripper_deg=45.0)
    assert joints[4] == 45.0
