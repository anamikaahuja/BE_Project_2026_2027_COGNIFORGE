import numpy as np
from typing import List


class MotionPlanner:
    """
    6-DOF industrial arm kinematics (UR5-style DH parameters).

    Inverse kinematics uses Damped Least Squares (DLS):
        dq = J^T (J J^T + lambda^2 I)^-1 * e
    which stays well-conditioned near kinematic singularities, unlike a plain
    Jacobian-transpose or pseudo-inverse update.
    """

    def __init__(self):
        # [a, alpha, d, theta_offset]
        self.dh_params = [
            [0, np.pi / 2, 0.089, 0],     # Base to Shoulder
            [-0.425, 0, 0, 0],            # Shoulder to Elbow
            [-0.392, 0, 0, 0],            # Elbow to Wrist 1
            [0, np.pi / 2, 0.109, 0],     # Wrist 1 to Wrist 2
            [0, -np.pi / 2, 0.0946, 0],   # Wrist 2 to Wrist 3
            [0, 0, 0.0823, 0],            # Wrist 3 to Tip
        ]

        self.dof = 6
        # All-zero joints put the UR5 in a fully foreshortened pose that
        # renders as a stubby blob rather than a recognizable articulated
        # arm (the mesh/materials are correct -- it's purely a degenerate
        # viewing angle at that specific configuration). This bent "ready"
        # pose matches the frontend's default so the arm looks like an arm
        # from the moment it appears, both on load and after reset.
        self.HOME_POSE = np.array([0, -1.0, 1.3, -1.5, -1.57, 0])
        self.q = self.HOME_POSE.copy()
        self.joint_limits = [(-2 * np.pi, 2 * np.pi)] * 6

    @staticmethod
    def get_transform(a, alpha, d, theta):
        ct, st = np.cos(theta), np.sin(theta)
        ca, sa = np.cos(alpha), np.sin(alpha)
        return np.array([
            [ct, -st * ca, st * sa, a * ct],
            [st, ct * ca, -ct * sa, a * st],
            [0, sa, ca, d],
            [0, 0, 0, 1],
        ])

    def forward_kinematics(self, q) -> np.ndarray:
        T = np.eye(4)
        for i in range(self.dof):
            a, alpha, d, offset = self.dh_params[i]
            T = T @ self.get_transform(a, alpha, d, q[i] + offset)
        return T

    def _numerical_jacobian(self, q: np.ndarray, current_p: np.ndarray, epsilon: float = 1e-4) -> np.ndarray:
        J = np.zeros((3, self.dof))
        for i in range(self.dof):
            q_plus = q.copy()
            q_plus[i] += epsilon
            p_plus = self.forward_kinematics(q_plus)[:3, 3]
            J[:, i] = (p_plus - current_p) / epsilon
        return J

    def solve_ik(
        self,
        target_pos: dict,
        target_quat: dict = None,
        seed: np.ndarray = None,
        max_iters: int = 60,
        damping: float = 0.08,
        tolerance: float = 1e-3,
    ) -> List[float]:
        """Damped Least Squares inverse kinematics solve for a target position."""
        q = (seed.copy() if seed is not None else self.q.copy()).astype(float)
        target_p = np.array([target_pos["x"], target_pos["y"], target_pos["z"]])

        for _ in range(max_iters):
            T = self.forward_kinematics(q)
            current_p = T[:3, 3]
            error = target_p - current_p
            if np.linalg.norm(error) < tolerance:
                break

            J = self._numerical_jacobian(q, current_p)
            JJt = J @ J.T
            damped = JJt + (damping ** 2) * np.eye(3)
            dq = J.T @ np.linalg.solve(damped, error)
            q += dq
            q = np.clip(q, -2 * np.pi, 2 * np.pi)

        self.q = q
        return q.tolist()

    def reset(self):
        self.q = self.HOME_POSE.copy()
        return self.q.tolist()
