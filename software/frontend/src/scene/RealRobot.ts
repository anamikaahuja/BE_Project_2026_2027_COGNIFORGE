import * as THREE from 'three';

/**
 * UR5 joint rig built from procedurally-generated cylinder/sphere geometry,
 * using the UR5's actual URDF joint origins (fetched from
 * UniversalRobots/Universal_Robots_ROS2_Description's generated ur5.urdf),
 * so real joint angles from the backend map directly onto correctly
 * proportioned geometry.
 *
 * This previously loaded the real CAD-derived COLLADA meshes (see
 * public/models/ur5/ATTRIBUTION.md) instead. That approach was replaced
 * after live testing showed the rendered arm as visually disconnected
 * segments with visible gaps between links, despite the joint-transform
 * chain itself being numerically verified correct (each pivot lands at
 * exactly the expected distance from its parent, matching the real UR5's
 * link lengths) -- the fault was in an unverifiable assumption about where
 * each mesh's own local origin sits relative to the joint pivot it's
 * attached to, not in this rig's math. The same fault, independently
 * reached, was what motivated replacing the analogous CAD-mesh renderer in
 * the native Android AR build (see NativeArActivity.kt's class doc) with
 * procedural geometry; this file applies the identical fix here. Each
 * link's connecting cylinder is constructed to run from a joint's local
 * origin to exactly the coordinate the next joint's housing sphere is
 * placed at -- the same shared-construction value in both cases -- so
 * segments cannot fail to meet.
 *
 * URDF is authored in a Z-up, meters convention. Rather than hand-convert
 * every joint offset to Three.js's Y-up frame, the whole rig is built in
 * native URDF coordinates and a single -90-degree rotation about X is
 * applied at the root to convert the entire assembly to Y-up in one place.
 */

const LINK_RADIUS = 0.035;
const JOINT_RADIUS = 0.05;
const BASE_RADIUS = 0.07;
const BASE_HEIGHT = 0.04;
const LINK_COLOR = 0xc0c0c0;
const JOINT_COLOR = 0x1f1f1f;

interface JointSpec {
  // Translation from the parent joint's frame, in the URDF's native
  // (Z-up) meters convention -- copied directly from ur5.urdf.
  origin: [number, number, number];
  // Fixed origin rotation (roll, pitch, yaw), applied before the variable
  // joint rotation.
  rpy: [number, number, number];
}

// Order: base -> shoulder_pan -> shoulder_lift -> elbow -> wrist_1 -> wrist_2 -> wrist_3
// Values transcribed directly from ur5.urdf (UniversalRobots/Universal_Robots_ROS2_Description).
const JOINTS: JointSpec[] = [
  { origin: [0, 0, 0.089159], rpy: [0, 0, 0] },
  { origin: [0, 0, 0], rpy: [Math.PI / 2, 0, 0] },
  { origin: [-0.425, 0, 0], rpy: [0, 0, 0] },
  { origin: [-0.39225, 0, 0.10915], rpy: [0, 0, 0] },
  { origin: [0, -0.09465, 0], rpy: [Math.PI / 2, 0, 0] },
  { origin: [0, 0.0823, 0], rpy: [Math.PI / 2, Math.PI, Math.PI] },
];

export class RealRobot {
  private group: THREE.Group;
  private rig: THREE.Group; // holds the Z-up hierarchy before the Y-up correction
  private joints: THREE.Group[] = [];
  private meshMaterials: THREE.Material[] = [];
  private isPhantom: boolean;
  private currentJoints: number[] = [0, 0, 0, 0, 0, 0];
  private loaded = false;
  public readonly ready: Promise<void>;

  constructor(options: { isPhantom?: boolean } = {}) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, -0.6);

    this.rig = new THREE.Group();
    this.rig.rotation.x = -Math.PI / 2; // URDF Z-up -> Three.js Y-up
    this.group.add(this.rig);

    this.isPhantom = !!options.isPhantom;
    this.ready = this.build();
  }

  private material(color: number): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color });
    if (this.isPhantom) {
      mat.color.setHex(0xff3333);
      mat.transparent = true;
      mat.opacity = 0.35;
      mat.depthWrite = false;
    }
    this.meshMaterials.push(mat);
    return mat;
  }

  /** A cylinder spanning from local point `from` to local point `to`, both in the same parent frame. */
  private cylinderBetween(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.Mesh {
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.001), 16);
    geometry.translate(0, length / 2, 0); // span local Y in [0, length] instead of centered on origin
    const mesh = new THREE.Mesh(geometry, this.material(LINK_COLOR));
    mesh.position.copy(from);
    if (length > 1e-6) {
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    }
    return mesh;
  }

  private jointSphere(radius: number): THREE.Mesh {
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), this.material(JOINT_COLOR));
  }

  private async build(): Promise<void> {
    const baseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS, BASE_HEIGHT, 20),
      this.material(JOINT_COLOR)
    );
    baseMesh.position.y = BASE_HEIGHT / 2;
    this.rig.add(baseMesh);

    let parent: THREE.Object3D = this.rig;
    const localOrigin = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < JOINTS.length; i++) {
      const spec = JOINTS[i];
      const target = new THREE.Vector3(...spec.origin);

      // Connecting rod: from this frame's own origin out to where the next
      // joint's origin places it, drawn in this SAME parent frame the next
      // joint's originGroup below is about to be positioned in -- the
      // cylinder's endpoint and the joint sphere's center are therefore
      // both derived from the identical `spec.origin` value, so they
      // cannot fail to meet.
      parent.add(this.cylinderBetween(localOrigin, target, LINK_RADIUS));

      const originGroup = new THREE.Group();
      originGroup.position.set(...spec.origin);
      originGroup.rotation.copy(new THREE.Euler(spec.rpy[0], spec.rpy[1], spec.rpy[2], 'XYZ'));
      parent.add(originGroup);

      const jointGroup = new THREE.Group(); // rotates about local Z by the actual joint angle
      originGroup.add(jointGroup);
      this.joints.push(jointGroup);
      jointGroup.add(this.jointSphere(JOINT_RADIUS));

      parent = jointGroup;
    }

    this.updateJoints(this.currentJoints);
    this.loaded = true;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public getSimulatedStress(): number[] {
    return this.currentJoints.map((j) => Math.abs(j) * 4.2);
  }

  public highlightJoint(index: number, isWarning: boolean) {
    // Highlighting the whole robot on any warning is clearer than trying to
    // isolate one link's material subset.
    if (this.isPhantom) return;
    for (const mat of this.meshMaterials as any[]) {
      mat.emissive?.setHex?.(isWarning ? 0x330000 : 0x000000);
    }
  }

  public updateJoints(joints: number[]) {
    if (!joints || joints.length < 6) return;
    this.currentJoints = joints;
    if (this.joints.length < 6) return; // not built yet
    // All six UR5 joints rotate about their own local Z axis (per the
    // URDF's <axis xyz="0 0 1"/> on every joint) -- the DH-derived alpha
    // twists between links are already baked into each joint's fixed
    // origin rotation (JOINTS[i].rpy) above, so the variable part really
    // is just a single Z rotation at every stage.
    for (let i = 0; i < 6; i++) {
      this.joints[i].rotation.z = joints[i];
    }
  }

  public getObject() {
    return this.group;
  }
}
