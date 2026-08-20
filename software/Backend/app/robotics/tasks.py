"""
Canonical definitions of the five task scenarios of increasing complexity
described in the project proposal (pick-and-place, stacking, path tracing,
2-part assembly, complex assembly). Each task is a named sequence of
Cartesian end-effector targets in the robot's own local frame -- the same
space /solve_ik already expects.

This is the single source of truth for these five tasks: the offline
evaluation harness (evaluation/tasks.py) imports from here rather than
duplicating the waypoint data, and the live GET /tasks endpoint serves the
same list so the interactive apps can play the identical scenarios the
paper's Table 3 numbers were measured against.
"""

from typing import Dict, List

TaskDefinition = Dict[str, object]

TASKS: List[TaskDefinition] = [
    {
        "name": "pick_and_place",
        "label": "Pick-and-Place",
        "description": "Move a single object from Position A to Position B",
        "waypoints": [
            {"x": 0.30, "y": 0.20, "z": 0.40},
            {"x": 0.35, "y": -0.20, "z": 0.40},
        ],
    },
    {
        "name": "stacking",
        "label": "Stacking",
        "description": "Stack three objects in sequence on a target platform",
        "waypoints": [
            {"x": 0.30, "y": 0.20, "z": 0.35},
            {"x": 0.30, "y": 0.20, "z": 0.45},
            {"x": 0.30, "y": 0.20, "z": 0.55},
            {"x": 0.30, "y": 0.20, "z": 0.65},
        ],
    },
    {
        "name": "path_tracing",
        "label": "Path Tracing",
        "description": "Trace a continuous curved path (welding/painting simulation)",
        "waypoints": [
            {
                "x": 0.35 + 0.1 * (i / 9),
                "y": 0.10 + 0.15 * (0.5 - abs(0.5 - i / 9)),
                "z": 0.45,
            }
            for i in range(10)
        ],
    },
    {
        "name": "assembly_2part",
        "label": "Assembly (2-Part)",
        "description": "Insert a cylindrical peg into a matching hole",
        "waypoints": [
            {"x": 0.30, "y": 0.10, "z": 0.45},
            {"x": 0.30, "y": 0.10, "z": 0.38},
            {"x": 0.30, "y": 0.10, "z": 0.32},
        ],
    },
    {
        "name": "assembly_complex",
        "label": "Assembly (Complex)",
        "description": "Four-step pick, orient, insert, fasten sequence",
        "waypoints": [
            {"x": 0.25, "y": 0.15, "z": 0.45},   # pick
            {"x": 0.28, "y": 0.05, "z": 0.42},   # orient (lateral move)
            {"x": 0.28, "y": 0.05, "z": 0.33},   # insert
            {"x": 0.28, "y": 0.05, "z": 0.30},   # fasten (final seat)
        ],
    },
]

# A deliberately infeasible target (below floor clearance) used to measure
# Error Correction Accuracy: the fraction of these that the collision
# validator correctly rejects.
ADVERSARIAL_TARGETS: List[Dict[str, float]] = [
    {"x": 0.3, "y": 0.2, "z": -0.30},
    {"x": 0.0, "y": 0.0, "z": -0.50},
    {"x": 0.5, "y": 0.5, "z": -0.10},
]
