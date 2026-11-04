export interface SerializedJoint {
  name: string;
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}

export interface SerializedHand {
  joints: SerializedJoint[];
}

export interface DemonstrationFrame {
  timestamp: number;
  leftHand: SerializedHand | null;
  rightHand: SerializedHand | null;
}

/**
 * Encapsulates the WebXR Hand Input Module capture logic: reads the 25
 * XRJointSpace poses per hand exposed via `renderer.xr.getHand(n)` and
 * serializes them into the plain-JSON DemonstrationFrame shape the backend's
 * FrameData schema expects (camelCase field names, matching
 * app.shared.schemas.CamelModel on the Python side).
 *
 * Falls back to a synthetic single-joint "hand" driven by the mouse cursor
 * when no WebXR hand-tracking input is present, so the system remains
 * testable on a desktop browser without a headset.
 */
export class HandTracking {
  public serializeHand(hand: any): SerializedHand | null {
    if (!hand || !hand.joints || Object.keys(hand.joints).length === 0) return null;

    const jointData: SerializedJoint[] = [];
    for (const jointName in hand.joints) {
      const joint = hand.joints[jointName];
      if (joint.jointSpace) {
        jointData.push({
          name: jointName,
          position: { x: joint.position.x, y: joint.position.y, z: joint.position.z },
          orientation: {
            x: joint.quaternion.x,
            y: joint.quaternion.y,
            z: joint.quaternion.z,
            w: joint.quaternion.w,
          },
        });
      }
    }
    return jointData.length > 0 ? { joints: jointData } : null;
  }

  /** Maps normalized mouse coordinates (roughly [-1, 1]) into the robot's
   * actual reachable workspace. The previous formula (mouseX, 1.2+mouseY,
   * -0.5) was never calibrated against the backend's real kinematics at
   * all: even the mouse sitting dead center produced a target whose
   * forward-kinematics-solved position sat below the floor and 53% beyond
   * WORKSPACE_RADIUS (0.85m, backend/app/robotics/simulation.py). Every
   * such frame legitimately failed collision/workspace validation, and
   * after MAX_REFINE_ATTEMPTS (ErrorCorrection agent) escalated to a
   * critical REQUIRE_HITL_REVIEW that no amount of clicking "Approve"
   * could resolve, since the underlying position was never reachable to
   * begin with -- this was the dominant cause of the review dialog
   * reappearing continuously regardless of which button was clicked.
   *
   * This range was found empirically (sweeping mouseX/mouseY through the
   * real solve_ik + validate_waypoint pipeline, not just checked against
   * the workspace-radius formula) centered near the arm's own home-pose
   * reach (~(-0.66, -0.11, 0.22), MotionPlanner.HOME_POSE's forward
   * kinematics) rather than assumed. Z is the axis IntentPredictionAgent
   * and CollisionValidator's floor check both treat as height -- mouseY
   * drives it directly (up on screen = higher), matching the same
   * convention used for the drop_hand contingency downstream. */
  public mouseFallbackHand(mouseX: number, mouseY: number): SerializedHand {
    return {
      joints: [
        {
          name: 'index-finger-tip',
          position: { x: -0.5 + mouseX * 0.15, y: -0.1, z: 0.25 + mouseY * 0.15 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
    };
  }

  public buildFrame(
    hand1: any,
    hand2: any,
    isXrPresenting: boolean,
    mouseX: number,
    mouseY: number
  ): DemonstrationFrame | null {
    let leftHand = this.serializeHand(hand1);
    const rightHand = this.serializeHand(hand2);

    if (!isXrPresenting && !leftHand) {
      leftHand = this.mouseFallbackHand(mouseX, mouseY);
    }

    if (!leftHand && !rightHand) return null;

    return { timestamp: Date.now(), leftHand, rightHand };
  }
}
