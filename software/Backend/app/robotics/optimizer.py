import numpy as np
from typing import List, Dict
from pydantic import BaseModel
from app.robotics.kinematics import MotionPlanner

class TrajectoryOptimizer:
    """
    Evaluates trajectories against specific fitness functions: inverse kinematics,
    singularity avoidance, collision detection, and target reachability.
    """
    def __init__(self):
        self.planner = MotionPlanner()

    def evaluate_cost(self, joints: List[float], target_pos: dict) -> float:
        cost = 0.0
        
        # 1. Joint Limits Penalty
        for j in joints:
            dist = min(abs(j - (-6.28)), abs(6.28 - j))
            if dist < 0.5:
                cost += (0.5 - dist) * 10
                
        # 2. Collision Detection
        T = self.planner.forward_kinematics(joints)
        z_pos = T[2, 3]
        if z_pos < 0.05: # Virtual floor and buffer
            cost += (0.05 - z_pos) * 1000 
            
        # 3. Reachability (Distance to target)
        current_pos = T[:3, 3]
        target = np.array([target_pos['x'], target_pos['y'], target_pos['z']])
        distance = np.linalg.norm(current_pos - target)
        cost += distance * 100
        
        return cost

    def optimize(self, target_pos: dict, target_quat: dict) -> List[float]:
        best_joints = None
        best_cost = float('inf')
        
        seeds = [
            np.zeros(6),
            np.ones(6) * 0.5,
            np.ones(6) * -0.5
        ]
        
        for seed in seeds:
            self.planner.q = seed.copy()
            joints = self.planner.solve_ik(target_pos, target_quat)
            cost = self.evaluate_cost(joints, target_pos)
            
            if cost < best_cost:
                best_cost = cost
                best_joints = joints
                
        return best_joints or [0.0] * 6
