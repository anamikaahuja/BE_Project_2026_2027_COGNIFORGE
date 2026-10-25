"""
Standardized task battery for COGNIFORGE evaluation, mirroring the five
tasks of increasing complexity described in the project proposal
(pick-and-place, stacking, path tracing, 2-part assembly, complex
assembly). Each task is defined as a sequence of Cartesian end-effector
targets; the benchmark harness resolves these to joint angles via the
real DLS IK solver, injects synthetic demonstration noise, and pushes them
through the actual `/session/*` pipeline.

The task definitions themselves live in app.robotics.tasks -- the same
list the live GET /tasks endpoint serves to the interactive apps, so this
harness and the on-demand in-app playback are always measuring/demoing the
identical five scenarios rather than two definitions that could drift.
"""

from app.robotics.tasks import ADVERSARIAL_TARGETS, TASKS, TaskDefinition

__all__ = ["ADVERSARIAL_TARGETS", "TASKS", "TaskDefinition"]
