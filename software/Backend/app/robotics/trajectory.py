from typing import List

import numpy as np

try:
    from scipy.interpolate import CubicSpline
    _SCIPY_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    _SCIPY_AVAILABLE = False


def smooth_trajectory(waypoints: List[List[float]], samples_per_segment: int = 8) -> List[List[float]]:
    """
    Cubic-spline interpolation between joint-space waypoints, producing a
    smooth, physically continuous trajectory (matches the proposal's Motion
    Planning Agent: "cubic spline interpolation generates smooth, physically
    feasible velocity and acceleration profiles").

    Falls back to linear interpolation if scipy is unavailable, and returns
    the input unchanged for fewer than 3 waypoints (nothing to smooth).
    """
    if len(waypoints) < 3:
        return waypoints

    arr = np.array(waypoints)
    n_points, dof = arr.shape
    t = np.linspace(0, 1, n_points)
    t_fine = np.linspace(0, 1, max(n_points, (n_points - 1) * samples_per_segment + 1))

    if _SCIPY_AVAILABLE:
        splines = [CubicSpline(t, arr[:, j]) for j in range(dof)]
        smoothed = np.stack([s(t_fine) for s in splines], axis=1)
    else:
        smoothed = np.stack([np.interp(t_fine, t, arr[:, j]) for j in range(dof)], axis=1)

    return smoothed.tolist()


def velocity_profile(waypoints: List[List[float]], dt: float = 0.05) -> List[List[float]]:
    """Finite-difference joint velocities between consecutive waypoints."""
    if len(waypoints) < 2:
        return [[0.0] * (len(waypoints[0]) if waypoints else 6)]
    arr = np.array(waypoints)
    vel = np.diff(arr, axis=0) / dt
    vel = np.vstack([vel, vel[-1:]])
    return vel.tolist()
