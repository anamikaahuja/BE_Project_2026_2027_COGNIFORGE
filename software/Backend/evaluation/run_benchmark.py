"""
Automated evaluation harness for COGNIFORGE.

Methodology note (read before trusting these numbers): the project
proposal's original evaluation plan called for a ten-participant human
user study with a Meta Quest 3 headset. That study was never run -- no
headset or human subjects were available in the environment this system
was built in. This harness instead exercises the REAL, running backend
pipeline (the actual FastAPI endpoints, the actual DLS IK solver, the
actual cubic-spline smoothing, the actual collision validator) against
synthetic demonstrations: an "ideal" Cartesian trajectory per task, with
Gaussian noise added to approximate natural hand tremor, run through
`app.robotics.kinematics.MotionPlanner` to get joint-space waypoints.

This produces genuine measurements of system behavior (latency, collision
avoidance, trajectory-reconstruction accuracy) that were previously just
placeholder numbers in the proposal document. It does NOT measure
human-factors outcomes -- User Effort Score (UES) requires a real
human-subject study and is reported as N/A rather than fabricated.
"""

import json
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.robotics.kinematics import MotionPlanner
from evaluation.tasks import ADVERSARIAL_TARGETS, TASKS

TRIALS_PER_TASK = 10
DEMONSTRATION_NOISE_STD = 0.01  # meters, approximates hand tremor
WORKSPACE_SCALE = 0.85  # meters, matches simulation.WORKSPACE_RADIUS

client = TestClient(app)
rng = np.random.default_rng(42)


def noisy_target(target: dict) -> dict:
    return {
        "x": target["x"] + rng.normal(0, DEMONSTRATION_NOISE_STD),
        "y": target["y"] + rng.normal(0, DEMONSTRATION_NOISE_STD),
        "z": target["z"] + rng.normal(0, DEMONSTRATION_NOISE_STD),
    }


def run_task_trial(task: dict) -> dict:
    planner = MotionPlanner()
    session_resp = client.post(
        "/session/create", params={"description": task["name"]}
    ).json()
    session_id = session_resp["session_id"]

    recorded_joints = []
    for waypoint in task["waypoints"]:
        noisy = noisy_target(waypoint)
        joints = planner.solve_ik(noisy, seed=planner.q)
        recorded_joints.append(joints)
        client.post(f"/session/{session_id}/frame", json=joints)

    t0 = time.perf_counter()
    finalize_resp = client.post(f"/session/{session_id}/finalize")
    del_seconds = time.perf_counter() - t0

    if finalize_resp.status_code != 200:
        return {
            "success": False,
            "del_seconds": del_seconds,
            "tfs": 0.0,
            "violations": [finalize_resp.json().get("detail", "unknown error")],
        }

    result = finalize_resp.json()
    instructions = client.get(f"/session/{session_id}/instructions").json()
    smoothed = instructions["joints"]

    final_joints = smoothed[-1] if smoothed else recorded_joints[-1]
    achieved_pos = planner.forward_kinematics(final_joints)[:3, 3]
    ideal_target = task["waypoints"][-1]
    ideal_pos = np.array([ideal_target["x"], ideal_target["y"], ideal_target["z"]])
    error = float(np.linalg.norm(achieved_pos - ideal_pos))
    tfs = max(0.0, 1.0 - error / WORKSPACE_SCALE)

    client.post(f"/session/{session_id}/approve")

    return {
        "success": bool(result.get("collision_free")),
        "del_seconds": del_seconds,
        "tfs": tfs,
        "violations": result.get("violations", []),
    }


def run_error_correction_check() -> float:
    """Measures Error Correction Accuracy: the fraction of deliberately
    infeasible (below-floor) trajectories the collision validator
    correctly flags as not collision-free."""
    planner = MotionPlanner()
    correctly_flagged = 0

    for target in ADVERSARIAL_TARGETS:
        session_id = client.post(
            "/session/create", params={"description": "adversarial_probe"}
        ).json()["session_id"]

        safe_joints = planner.solve_ik({"x": 0.3, "y": 0.2, "z": 0.4}, seed=planner.q)
        bad_joints = planner.solve_ik(target, seed=planner.q)
        client.post(f"/session/{session_id}/frame", json=safe_joints)
        client.post(f"/session/{session_id}/frame", json=bad_joints)

        result = client.post(f"/session/{session_id}/finalize").json()
        if not result.get("collision_free", True):
            correctly_flagged += 1

    return correctly_flagged / len(ADVERSARIAL_TARGETS)


def main():
    results = {}

    for task in TASKS:
        trials = [run_task_trial(task) for _ in range(TRIALS_PER_TASK)]
        tcr = statistics.mean(1.0 if t["success"] else 0.0 for t in trials)
        del_mean = statistics.mean(t["del_seconds"] for t in trials)
        tfs_mean = statistics.mean(t["tfs"] for t in trials)

        results[task["name"]] = {
            "description": task["description"],
            "n_trials": TRIALS_PER_TASK,
            "tcr_percent": round(tcr * 100, 1),
            "del_seconds": round(del_mean, 4),
            "tfs": round(tfs_mean, 3),
        }
        print(f"{task['name']:20s} TCR={tcr*100:5.1f}%  DEL={del_mean:.4f}s  TFS={tfs_mean:.3f}")

    eca = run_error_correction_check()
    results["_error_correction_accuracy_percent"] = round(eca * 100, 1)
    results["_user_effort_score"] = "N/A -- requires human-subject study (not run in this environment)"
    results["_methodology"] = (
        "Synthetic demonstrations (ideal Cartesian waypoints + Gaussian noise, "
        "std=0.01m) resolved via the real DLS IK solver and pushed through the "
        "actual /session/* REST pipeline (real cubic-spline smoothing, real "
        "collision validation). Not a human-subject study."
    )

    print(f"\nError Correction Accuracy: {eca*100:.1f}%")

    out_path = os.path.join(os.path.dirname(__file__), "results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults written to {out_path}")


if __name__ == "__main__":
    main()
