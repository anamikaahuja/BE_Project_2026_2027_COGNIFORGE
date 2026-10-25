# COGNIFORGE Evaluation Harness

## What this is (and isn't)

The project proposal's evaluation plan called for a ten-participant human
user study on a Meta Quest 3. **That study was not run** — this environment
had no headset and no human subjects available. Rather than reuse the
proposal's placeholder numbers (87.8% TCR, 3.7s DEL, 0.91 TFS — figures that
were written before any implementation existed), this harness runs the
**real, working backend pipeline** against synthetic demonstrations and
reports what actually happens.

Methodology: each of the five task definitions in `tasks.py` (mirroring the
proposal's task battery) specifies an ideal Cartesian end-effector
trajectory. For each of 10 trials per task, Gaussian noise (σ = 1cm,
approximating natural hand tremor) is added to each waypoint, resolved to
joint angles via the actual Damped Least Squares IK solver
(`app/robotics/kinematics.py`), and pushed through the real
`/session/create → /frame → /finalize → /instructions → /approve` REST
pipeline — the same code path the WebXR frontend uses, exercising the real
cubic-spline smoothing and real collision validation.

## Metrics

| Metric | What it measures here | Caveat |
|---|---|---|
| TCR (Task Completion Rate) | % of trials the collision validator accepts | Reflects planning/validation correctness, not physical-world task success |
| DEL (Demonstration-to-Execution Latency) | Wall-clock time for `/finalize` (smoothing + collision check) | In-process `TestClient` timing — excludes real network/WebSocket and device-side latency the proposal's figure included |
| TFS (Trajectory Fidelity Score) | 1 − (FK error between the *ideal* noiseless target and the achieved final smoothed pose) / workspace radius | Measures whether noisy input still resolves to the intended target, not demonstrated-vs-executed path similarity |
| ECA (Error Correction Accuracy) | % of deliberately infeasible (below-floor) trajectories correctly rejected | Only 3 adversarial probes — a small sample |
| UES (User Effort Score) | **N/A** | Requires a real human-subject study; not fabricated |

## Running it

```bash
cd backend
source venv/bin/activate   # or ./venv/bin/python directly
python -m evaluation.run_benchmark
```

Writes `results.json` next to this file. The numbers will vary slightly
run-to-run only if the RNG seed in `run_benchmark.py` is changed — it's
fixed (`seed=42`) for reproducibility.

## Latest results

See `results.json` for the current run's output. As of the last run: 100%
TCR and 100% ECA across all five tasks and all three adversarial probes —
the task waypoints in `tasks.py` were deliberately chosen to sit inside the
robot's safe reachable workspace, so a 100% TCR here demonstrates the
pipeline's *correctness* on well-posed inputs, not its robustness under
harder conditions. A meaningful stress test (tighter tolerances, more
adversarial targets, workspace-boundary edge cases) is listed as future
work.
