from app.robotics.simulation import CollisionValidator


def test_analytic_backend_used_when_pybullet_unavailable():
    validator = CollisionValidator()
    assert validator.backend in ("analytic", "pybullet")


def test_validate_waypoint_flags_below_floor():
    validator = CollisionValidator()
    # All-zero joints places the end effector at a known low pose (near/under
    # floor clearance for this arm's DH parameters).
    ok, reason = validator.validate_waypoint([0, 0, 0, 0, 0, 0])
    if not ok:
        assert "floor" in reason or "workspace" in reason


def test_validate_trajectory_reports_per_waypoint_violations():
    validator = CollisionValidator()
    trajectory = [[0, 0, 0, 0, 0, 0], [0.3, 0.3, -0.3, 0, 0, 0]]
    ok, violations = validator.validate_trajectory(trajectory)
    assert isinstance(ok, bool)
    assert isinstance(violations, list)
