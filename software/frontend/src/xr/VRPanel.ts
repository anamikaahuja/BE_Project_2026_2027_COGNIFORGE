import * as THREE from 'three';

export type VRAction = 'start_demo' | 'stop_demo' | 'approve_hitl' | 'approve_session' | 'reject_session';

export interface VRPanelState {
  demoStatus: 'idle' | 'recording' | 'finalizing' | 'reviewing';
  requiresHitl: boolean;
  statusLine?: string;
}

interface Button {
  mesh: THREE.Mesh;
  action: VRAction;
  label: string;
  color: string;
}

/**
 * The 2D HTML overlay (React panels: Demonstration Session, HITL approval,
 * manual jog) is invisible once an immersive-vr WebXR session starts -- the
 * DOM doesn't render inside the headset's stereo canvas, only the WebGL
 * scene does. Without this, "the VR app" would just be a viewer: you could
 * watch the robot move but never actually start a demonstration or approve
 * a contingency while wearing the headset.
 *
 * VRPanel is a small in-scene HUD (a background plate plus a handful of
 * button meshes with canvas-texture labels) meant to be parented to the
 * camera so it stays in view as a wrist/chest-height display, and hit-test
 * against the VR controller's pointing ray on its 'select' (trigger)
 * event -- see Engine.ts's controller wiring.
 */
export class VRPanel {
  private group: THREE.Group;
  private buttons: Button[] = [];
  private statusMesh: THREE.Mesh;
  private statusCanvas: HTMLCanvasElement;
  private statusTexture: THREE.CanvasTexture;

  constructor() {
    this.group = new THREE.Group();

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.26),
      new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    this.group.add(bg);

    this.statusCanvas = document.createElement('canvas');
    this.statusCanvas.width = 512;
    this.statusCanvas.height = 128;
    this.statusTexture = new THREE.CanvasTexture(this.statusCanvas);
    this.statusMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.08),
      new THREE.MeshBasicMaterial({ map: this.statusTexture, transparent: true })
    );
    this.statusMesh.position.set(0, 0.08, 0.001);
    this.group.add(this.statusMesh);

    this.drawStatus('IDLE');

    this.createButton('start_demo', 'START DEMO', 0x0088ff, -0.1, -0.03);
    this.createButton('stop_demo', 'STOP + REVIEW', 0xff8800, -0.1, -0.03);
    this.createButton('approve_hitl', 'APPROVE', 0x00cc00, -0.1, -0.09);
    this.createButton('approve_session', 'APPROVE', 0x00cc00, -0.1, -0.09);
    this.createButton('reject_session', 'REJECT', 0xcc0000, 0.1, -0.09);

    this.applyState({ demoStatus: 'idle', requiresHitl: false });
  }

  private createButton(action: VRAction, label: string, color: number, x: number, y: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    this.paintButton(ctx, canvas, label, color);
    const texture = new THREE.CanvasTexture(canvas);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.05),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
    mesh.position.set(x, y, 0.001);
    mesh.userData.action = action;
    this.group.add(mesh);
    this.buttons.push({ mesh, action, label, color: `#${color.toString(16).padStart(6, '0')}` });
  }

  private paintButton(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, label: string, color: number) {
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = hex;
    ctx.beginPath();
    const r = 10;
    ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, r);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  }

  private drawStatus(text: string) {
    const ctx = this.statusCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.statusCanvas.width, this.statusCanvas.height);
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.statusCanvas.width / 2, this.statusCanvas.height / 2);
    this.statusTexture.needsUpdate = true;
  }

  /** Updates which buttons are visible/interactable for the current app state. */
  public applyState(state: VRPanelState) {
    const forEach = (action: VRAction, visible: boolean) => {
      const btn = this.buttons.find((b) => b.action === action);
      if (btn) btn.mesh.visible = visible;
    };

    forEach('start_demo', state.demoStatus === 'idle');
    forEach('stop_demo', state.demoStatus === 'recording');
    forEach('approve_session', state.demoStatus === 'reviewing');
    forEach('reject_session', state.demoStatus === 'reviewing');
    forEach('approve_hitl', state.requiresHitl && state.demoStatus === 'idle');

    const label =
      state.statusLine ||
      (state.requiresHitl ? 'REVIEW REQUIRED' : state.demoStatus.toUpperCase());
    this.drawStatus(label);
  }

  /** Every clickable mesh currently visible, for controller raycasting. */
  public getInteractables(): THREE.Mesh[] {
    return this.buttons.filter((b) => b.mesh.visible).map((b) => b.mesh);
  }

  public getObject(): THREE.Group {
    return this.group;
  }
}
