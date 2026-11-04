from app.robotics.trajectory import smooth_trajectory, velocity_profile


def test_smooth_trajectory_preserves_endpoints():
    waypoints = [[0, 0, 0, 0, 0, 0], [0.5, 0.2, -0.1, 0, 0, 0], [1.0, 0.4, 0.1, 0, 0, 0.2]]
    smoothed = smooth_trajectory(waypoints, samples_per_segment=4)

    assert len(smoothed) > len(waypoints)
    assert [round(v, 6) for v in smoothed[0]] == [round(v, 6) for v in waypoints[0]]
    assert [round(v, 6) for v in smoothed[-1]] == [round(v, 6) for v in waypoints[-1]]


def test_smooth_trajectory_passthrough_below_three_points():
    waypoints = [[0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1]]
    assert smooth_trajectory(waypoints) == waypoints


def test_velocity_profile_shape_matches_waypoints():
    waypoints = [[0] * 6, [1] * 6, [2] * 6]
    vel = velocity_profile(waypoints, dt=0.1)
    assert len(vel) == len(waypoints)
    assert vel[0][0] == 10.0  # (1-0)/0.1
