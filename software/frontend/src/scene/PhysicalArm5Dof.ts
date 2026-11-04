import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE_HEIGHT = 0.07;
const UPPER_ARM_LENGTH = 0.105;
const FOREARM_LENGTH = 0.100;
const GRIPPER_LENGTH = 0.070;

const LINK_RADIUS = 0.012;
const JOINT_RADIUS = 0.016;
const BASE_RADIUS = 0.045;

// Colors based on user's GrabCAD images
const BASE_RED = 0x882222;
const BASE_GREY = 0x555555;
const ARM_YELLOW = 0xd4c244;
const ARM_RED = 0x882222;
const WRIST_BLACK = 0x222222;
const GEAR_BLUE = 0x1155cc;

export class PhysicalArm5Dof {
  private rig = new THREE.Group();
  private baseGroup = new THREE.Group();
  private shoulderGroup = new THREE.Group();
  private elbowGroup = new THREE.Group();
  private wristGroup = new THREE.Group();
  private fingerL = new THREE.Object3D();
  private fingerR = new THREE.Object3D();

  private isCADLoaded = false;

  constructor() {
    this.rig.rotation.x = -Math.PI / 2;
    this.buildProcedural();
    this.loadCADModel();
  }

  getObject(): THREE.Object3D {
    return this.rig;
  }

  private loadCADModel() {
    const loader = new GLTFLoader();
    loader.load(
        '/models/arm.glb',
        (gltf) => {
            console.log('[PhysicalArm5Dof] CAD model loaded successfully');
            while(this.rig.children.length > 0){ this.rig.remove(this.rig.children[0]); }

            this.baseGroup = new THREE.Group();
            this.shoulderGroup = new THREE.Group();
            this.elbowGroup = new THREE.Group();
            this.wristGroup = new THREE.Group();
            this.fingerL = new THREE.Object3D();
            this.fingerR = new THREE.Object3D();

            this.rig.add(this.baseGroup);
            this.baseGroup.add(this.shoulderGroup);
            this.shoulderGroup.add(this.elbowGroup);
            this.elbowGroup.add(this.wristGroup);
            this.wristGroup.add(this.fingerL);
            this.wristGroup.add(this.fingerR);

            const baseNode = gltf.scene.getObjectByName('base');
            const shoulderNode = gltf.scene.getObjectByName('shoulder');
            const elbowNode = gltf.scene.getObjectByName('elbow');
            const wristNode = gltf.scene.getObjectByName('wrist');
            const fingerLNode = gltf.scene.getObjectByName('fingerL');
            const fingerRNode = gltf.scene.getObjectByName('fingerR');

            if (baseNode && shoulderNode && elbowNode && wristNode) {
                this.baseGroup.add(baseNode);
                this.shoulderGroup.add(shoulderNode);
                this.elbowGroup.add(elbowNode);
                this.wristGroup.add(wristNode);
                if (fingerLNode) this.fingerL.add(fingerLNode);
                if (fingerRNode) this.fingerR.add(fingerRNode);
            } else {
                this.baseGroup.add(gltf.scene);
            }
            this.isCADLoaded = true;
        },
        undefined,
        (err) => {
            console.log('[PhysicalArm5Dof] No custom CAD model found, using procedural fallback.');
        }
    );
  }

  private linkBox(length: number, width: number, depth: number, color: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(length, width, depth);
    geometry.translate(length / 2, 0, 0);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
  }

  private jointCylinder(radius: number, depth: number, color: number): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(radius, radius, depth, 20);
    geom.rotateX(Math.PI / 2);
    return new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color }));
  }

  private buildProcedural() {
    // Bottom Base Cylinder (Dark Red)
    const baseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS, BASE_HEIGHT, 32),
      new THREE.MeshStandardMaterial({ color: BASE_RED, roughness: 0.6 }),
    );
    baseMesh.position.y = BASE_HEIGHT / 2;
    this.rig.add(baseMesh);

    // Base Rotating Mount (Dark Grey)
    this.baseGroup.position.y = BASE_HEIGHT;
    this.rig.add(this.baseGroup);
    
    const mountGeom = new THREE.CylinderGeometry(BASE_RADIUS * 0.8, BASE_RADIUS * 0.9, BASE_HEIGHT * 0.8, 20);
    mountGeom.translate(0, BASE_HEIGHT * 0.4, 0);
    const mount = new THREE.Mesh(mountGeom, new THREE.MeshStandardMaterial({ color: BASE_GREY }));
    this.baseGroup.add(mount);

    // Shoulder Link (Yellow, flat and wide)
    this.baseGroup.add(this.shoulderGroup);
    this.shoulderGroup.position.y = BASE_HEIGHT * 0.6;
    this.shoulderGroup.add(this.jointCylinder(JOINT_RADIUS * 1.5, 0.04, ARM_YELLOW));
    this.shoulderGroup.add(this.linkBox(UPPER_ARM_LENGTH, 0.03, 0.03, ARM_YELLOW));

    // Elbow Link (Dark Red, blocky)
    this.elbowGroup.position.x = UPPER_ARM_LENGTH;
    this.shoulderGroup.add(this.elbowGroup);
    this.elbowGroup.add(this.jointCylinder(JOINT_RADIUS * 1.2, 0.035, ARM_RED));
    this.elbowGroup.add(this.linkBox(FOREARM_LENGTH, 0.035, 0.035, ARM_RED));

    // Wrist / Servo housing (Black)
    this.wristGroup.position.x = FOREARM_LENGTH;
    this.elbowGroup.add(this.wristGroup);
    this.wristGroup.add(this.jointCylinder(JOINT_RADIUS, 0.04, WRIST_BLACK));
    this.wristGroup.add(this.linkBox(GRIPPER_LENGTH * 0.4, 0.03, 0.04, WRIST_BLACK));

    // Blue Gear detail
    const gear = this.jointCylinder(0.015, 0.042, GEAR_BLUE);
    gear.position.x = GRIPPER_LENGTH * 0.4;
    this.wristGroup.add(gear);

    // Red angled gripper fingers
    const fingerGeom = new THREE.BoxGeometry(0.04, 0.008, 0.01);
    fingerGeom.translate(0.02, 0, 0);
    const fingerMat = new THREE.MeshStandardMaterial({ color: BASE_RED });
    
    this.fingerL = new THREE.Mesh(fingerGeom, fingerMat);
    this.fingerR = new THREE.Mesh(fingerGeom, fingerMat);
    
    this.fingerL.position.set(GRIPPER_LENGTH * 0.4, 0.015, 0);
    this.fingerL.rotation.z = Math.PI / 8; // Slight inward angle
    
    this.fingerR.position.set(GRIPPER_LENGTH * 0.4, -0.015, 0);
    this.fingerR.rotation.z = -Math.PI / 8;

    this.wristGroup.add(this.fingerL, this.fingerR);
  }

  updateJoints(jointsDeg: number[]) {
    if (jointsDeg.length < 5) return;
    const [base, shoulder, elbow, wrist, gripper] = jointsDeg.map(THREE.MathUtils.degToRad);

    this.baseGroup.rotation.y = base;
    this.shoulderGroup.rotation.z = shoulder;
    this.elbowGroup.rotation.z = elbow;
    this.wristGroup.rotation.z = wrist;

    // Open/Close fingers
    const openness = 1 - THREE.MathUtils.clamp(gripper / THREE.MathUtils.degToRad(60), 0, 1);
    const spread = 0.015 + openness * 0.015;
    this.fingerL.position.y = spread;
    this.fingerR.position.y = -spread;
  }

  dispose() {
    this.rig.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
