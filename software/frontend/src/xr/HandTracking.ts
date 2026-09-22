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

  public mouseFallbackHand(mouseX: number, mouseY: number): SerializedHand {
    return {
      joints: [
        {
          name: 'index-finger-tip',
          position: { x: mouseX, y: 1.2 + mouseY, z: -0.5 },
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
