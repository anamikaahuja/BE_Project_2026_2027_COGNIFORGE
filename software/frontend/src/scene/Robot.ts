import * as THREE from 'three';

// Real UR5 link dimensions (meters), matching backend/app/robotics/kinematics.py's
// DH parameters and the real CAD meshes in RealRobot.ts, so this procedural
// placeholder -- used as the initial view before RealRobot finishes loading,
// and for every phantom/intent/review/contingency ghost overlay -- is the
// correct physical size next to the real robot rather than a stylized
// approximation. A ghost twice the real robot's size would break the
// "digital twin" illusion the moment both are visible at once.
const BASE_RADIUS = 0.075;   // real UR5 base flange radius (~149mm diameter)
const BASE_HEIGHT = 0.05;
const D1 = 0.089;   // base -> shoulder
const A2 = 0.425;   // shoulder -> elbow
const A3 = 0.392;   // elbow -> wrist1
const D4 = 0.109;   // wrist1 -> wrist2
const D5 = 0.0946;  // wrist2 -> wrist3
const D6 = 0.0823;  // wrist3 -> tool flange

export class GhostRobot {
  private group: THREE.Group;
  private joints: THREE.Group[] = [];
  private jointMaterials: THREE.MeshStandardMaterial[] = [];
  private isPhantom: boolean;
  private currentJoints: number[] = [0,0,0,0,0,0];

  constructor(options: { isPhantom?: boolean } = {}) {
    this.group = new THREE.Group();
    this.isPhantom = !!options.isPhantom;
    this.init();
  }

  private applyMaterialSettings(mat: THREE.MeshStandardMaterial, baseColor: number) {
    if (this.isPhantom) {
      mat.color.setHex(0xff0000); // Red tint for phantom
      mat.transparent = true;
      mat.opacity = 0.3;
    } else {
      mat.color.setHex(baseColor);
    }
    return mat;
  }

  private createJointHub(radius: number, color: number = 0xffffff) {
    const group = new THREE.Group();
    const hubGeom = new THREE.CylinderGeometry(radius, radius, radius * 1.4, 32);
    const hubMat = new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.2 });
    this.applyMaterialSettings(hubMat, color);
    const hub = new THREE.Mesh(hubGeom, hubMat);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
    this.jointMaterials.push(hubMat);
    return group;
  }

  private createLink(length: number, crossSection: number = 0.07, color: number = 0xffcc00) {
    const group = new THREE.Group();
    const bodyGeom = new THREE.BoxGeometry(crossSection, length, crossSection);
    const bodyMat = new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.5 });
    this.applyMaterialSettings(bodyMat, color);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = length / 2;
    group.add(body);
    return group;
  }

  private createLabel(text: string) {
    if (this.isPhantom) return new THREE.Group(); // Hide labels on phantom
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 128; canvas.height = 128;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.beginPath(); ctx.arc(64,64,60,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'white'; ctx.font = 'bold 80px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text, 64,64);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(0.05, 0.05, 1); // real-scale label tag, not a giant floating disc
    return sprite;
  }

  private init() {
    // 1. BASE
    const baseMat = new THREE.MeshStandardMaterial();
    this.applyMaterialSettings(baseMat, 0x333333);
    const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS, BASE_HEIGHT, 32), baseMat);
    this.group.add(basePlate);
    const j1 = new THREE.Group(); this.group.add(j1); this.joints.push(j1);
    j1.add(this.createLabel("1"));
    const l1 = this.createLink(D1, 0.09, 0x666666); j1.add(l1);
    this.jointMaterials.push(baseMat); // Store base mat for joint 0 highlighting

    // 2. SHOULDER
    const j2 = this.createJointHub(0.06); j2.position.y = D1; l1.add(j2); this.joints.push(j2);
    const l2 = this.createLink(A2, 0.07); j2.add(l2); j2.add(this.createLabel("2"));

    // 3. ELBOW
    const j3 = this.createJointHub(0.05); j3.position.y = A2; l2.add(j3); this.joints.push(j3);
    const l3 = this.createLink(A3, 0.06); j3.add(l3); j3.add(this.createLabel("3"));

    // 4. WRIST 1 (Rotation/Yaw)
    const j4 = this.createJointHub(0.045); j4.position.y = A3; l3.add(j4); this.joints.push(j4);
    const l4 = this.createLink(D4, 0.05, 0x666666); j4.add(l4); j4.add(this.createLabel("4"));

    // 5. WRIST 2 (Tilt/Pitch) - ASYMMETRIC HINGE
    const j5 = new THREE.Group();
    const pivotGeom = new THREE.SphereGeometry(0.04, 16, 16);
    const pivotMat = new THREE.MeshStandardMaterial();
    this.applyMaterialSettings(pivotMat, 0xffffff);
    const pivot = new THREE.Mesh(pivotGeom, pivotMat);
    j5.add(pivot);
    this.jointMaterials.push(pivotMat);

    // Hinge housing
    const hingeGeom = new THREE.BoxGeometry(0.08, 0.05, 0.05);
    const hingeMat = new THREE.MeshStandardMaterial();
    this.applyMaterialSettings(hingeMat, 0xee7600);
    const hinge = new THREE.Mesh(hingeGeom, hingeMat);
    hinge.position.x = 0.03;
    j5.add(hinge);

    j5.position.y = D4;
    l4.add(j5);
    this.joints.push(j5);
    j5.add(this.createLabel("5"));

    // 6. WRIST 3 (Roll) - STRIPED DISC
    const j6 = new THREE.Group();
    const discGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.015, 32);
    const discMat = new THREE.MeshStandardMaterial();
    this.applyMaterialSettings(discMat, 0xeeeeee);
    const disc = new THREE.Mesh(discGeom, discMat);
    disc.rotation.x = Math.PI/2;
    j6.add(disc);
    this.jointMaterials.push(discMat);

    // Identification stripe
    const stripeMat = new THREE.MeshBasicMaterial();
    if (this.isPhantom) {
      stripeMat.color.setHex(0xff0000); stripeMat.transparent = true; stripeMat.opacity = 0.3;
    } else {
      stripeMat.color.setHex(0x000000);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.014), stripeMat);
    disc.add(stripe);

    j6.position.y = D5;
    j5.add(j6);
    this.joints.push(j6);
    j6.add(this.createLabel("6"));

    // GRIPPER (fits within the real wrist3 -> tool-flange offset, D6)
    const gBaseMat = new THREE.MeshStandardMaterial();
    this.applyMaterialSettings(gBaseMat, 0x111111);
    const gBase = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.06), gBaseMat);
    gBase.position.y = D6 * 0.35;
    j6.add(gBase);

    const fGeom = new THREE.BoxGeometry(0.014, D6 * 0.7, 0.03);
    const fMat = new THREE.MeshStandardMaterial();
    this.applyMaterialSettings(fMat, 0x444444);
    const f1 = new THREE.Mesh(fGeom, fMat);
    f1.position.set(0.024, D6 * 0.35, 0); gBase.add(f1);
    const f2 = new THREE.Mesh(fGeom, fMat);
    f2.position.set(-0.024, D6 * 0.35, 0); gBase.add(f2);

    this.group.position.set(0, 0, -0.6);
  }

  public getSimulatedStress(): number[] {
    return this.currentJoints.map(j => Math.abs(j) * 4.2);
  }

  public highlightJoint(index: number, isWarning: boolean) {
    if (this.isPhantom || index < 0 || index >= this.jointMaterials.length) return;

    // Original colors mapping for reset
    const originalColors = [0x333333, 0xffffff, 0xffffff, 0xcccccc, 0xffffff, 0xeeeeee];
    const mat = this.jointMaterials[index];

    if (isWarning) {
        mat.color.setHex(0xff0000); // Red warning
    } else {
        mat.color.setHex(originalColors[index] ?? 0xffffff);
    }
  }

  public updateJoints(joints: number[]) {
    if (!joints || joints.length < 6) return;
    this.currentJoints = joints;
    this.joints[0].rotation.y = joints[0]; // Base
    this.joints[1].rotation.z = joints[1]; // Shoulder
    this.joints[2].rotation.z = joints[2]; // Elbow
    this.joints[3].rotation.y = joints[3]; // W1 Rotation
    this.joints[4].rotation.z = joints[4]; // W2 Tilt (Updated to Z for proper hinge look)
    this.joints[5].rotation.y = joints[5]; // W3 Roll
  }

  public getObject() { return this.group; }
}
