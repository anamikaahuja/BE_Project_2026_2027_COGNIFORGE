from typing import List, Dict
from app.robotics.optimizer import TrajectoryOptimizer

class CTDECoordinator:
    """
    Centralized Training, Decentralized Execution Paradigm.
    This class aggregates trajectory optimization data centrally and delegates 
    execution down to individual joint commands.
    """
    def __init__(self):
        self.optimizer = TrajectoryOptimizer()
        
    def coordinate_trajectory(self, target_pos: dict, target_quat: dict) -> dict:
        """
        Coordinates the planning centrally. Generates a branching trajectory tree for contingencies.
        """
        # Primary optimal trajectory
        primary_joints = self.optimizer.optimize(target_pos, target_quat)
        
        # Contingency 1: Higher Z approach (avoiding potential floor dynamic obstacles)
        cont1_pos = target_pos.copy()
        cont1_pos["z"] += 0.3
        cont1_joints = self.optimizer.optimize(cont1_pos, target_quat)
        
        # Contingency 2: Offset X approach
        cont2_pos = target_pos.copy()
        cont2_pos["x"] += 0.2
        cont2_joints = self.optimizer.optimize(cont2_pos, target_quat)
        
        return {
            "primary": primary_joints,
            "contingencies": [cont1_joints, cont2_joints]
        }
