import * as THREE from 'three';

/**
 * Wraps a WebXR 'immersive-ar' session with hit-test-based surface
 * placement, so the same COGNIFORGE scene that runs in VR (Meta Quest) can
 * also run in handheld AR (Android Chrome / ARCore) -- this is the "mobile
 * application that can be used as VR or as AR" requirement: one WebXR
 * codebase, two session modes, selected by whichever the device supports.
 *
 * Interaction model: a reticle tracks whatever real surface the phone's
 * camera is currently pointed at (via a continuous forward hit-test, the
 * same technique ARKit/ARCore quick-start samples use -- point the phone,
 * not the finger). Before placement, either tapping the "PLACE ROBOT"
 * button or tapping anywhere on screen drops the workspace there. After
 * placement, every tap is instead treated as a reach command: point at a
 * spot, tap, and the arm moves toward it (see Engine.ts's handleArReach,
 * which converts the reticle's world position to the robot's local frame
 * and asks the backend to solve IK for it).
 *
 * iOS Safari does not implement the WebXR Device API as of this writing, so
 * `isSupported()` will correctly report false there; the mobile app falls
 * back to the existing head-tracking "magic window" mode on that platform.
 */
export class ARSession {
  private renderer: THREE.WebGLRenderer;
  private reticle: THREE.Mesh;
  private hitTestSource: XRHitTestSource | null = null;
  private hitTestSourceRequested = false;
  private onPlacementConfirmed: ((position: THREE.Vector3) => void) | null = null;
  private onReachConfirmed: ((position: THREE.Vector3) => void) | null = null;
  private onLogMessage: ((msg: string) => void) | null = null;
  private hasBeenPlaced = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;

    const ringGeometry = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ccff });
    this.reticle = new THREE.Mesh(ringGeometry, ringMaterial);
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
  }

  public static async isSupported(): Promise<boolean> {
    const xr = (navigator as any).xr;
    if (!xr || !xr.isSessionSupported) return false;
    try {
      return await xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  public getReticle(): THREE.Mesh {
    return this.reticle;
  }

  public onPlace(handler: (position: THREE.Vector3) => void) {
    this.onPlacementConfirmed = handler;
  }

  public onReach(handler: (position: THREE.Vector3) => void) {
    this.onReachConfirmed = handler;
  }

  public onLog(handler: (msg: string) => void) {
    this.onLogMessage = handler;
  }

  /** Places the workspace at wherever the reticle currently is (the "PLACE
   * ROBOT" button calls this directly). Returns false if no surface is
   * currently detected, so the UI can tell the user to point at a flat
   * surface first instead of silently doing nothing. */
  public placeAtCurrentReticle(): boolean {
    if (!this.reticle.visible || !this.onPlacementConfirmed) return false;
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(this.reticle.matrix);
    this.onPlacementConfirmed(position);
    this.hasBeenPlaced = true;
    return true;
  }

  /** Requests an AR session with hit-test enabled and a tap-to-place
   * controller event, mirroring the pattern Three.js's ARButton uses. */
  public async createButton(scene: THREE.Scene): Promise<HTMLButtonElement> {
    const button = document.createElement('button');
    button.innerText = 'Enter AR';
    button.style.position = 'absolute';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.padding = '12px 24px';
    button.style.fontSize = '16px';
    button.style.color = '#fff';
    button.style.background = 'rgba(0, 136, 255, 0.6)';
    button.style.border = '2px solid #fff';
    button.style.borderRadius = '8px';
    button.style.cursor = 'pointer';
    button.style.zIndex = '999';

    const supported = await ARSession.isSupported();
    this.onLogMessage?.(`AR_SUPPORT_CHECK: immersive-ar supported=${supported}`);
    if (!supported) {
      button.disabled = true;
      button.innerText = 'AR NOT SUPPORTED';
      button.style.opacity = '0.4';
      return button;
    }

    button.addEventListener('click', async () => {
      if (this.renderer.xr.isPresenting) return;
      this.hasBeenPlaced = false;
      try {
        this.onLogMessage?.('AR_REQUEST: Requesting immersive-ar session...');
        const session = await (navigator as any).xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: document.body },
        });

        scene.add(this.reticle);
        await this.renderer.xr.setSession(session);
        this.setupController(scene, session);
      } catch (e: any) {
        this.onLogMessage?.(`ERROR: AR session request failed -- ${e?.message || e}`);
      }
    });

    return button;
  }

  private setupController(scene: THREE.Scene, session: any) {
    const controller = this.renderer.xr.getController(0);
    controller.addEventListener('select', () => {
      if (!this.reticle.visible) return;
      const position = new THREE.Vector3();
      position.setFromMatrixPosition(this.reticle.matrix);

      // Before the workspace has been placed, any tap places it (a
      // convenient fallback alongside the explicit "PLACE ROBOT" button --
      // some browsers are more reliable with a raw tap than with a
      // dom-overlay button). Once placed, taps become reach commands.
      if (!this.hasBeenPlaced) {
        this.onPlacementConfirmed?.(position);
        this.hasBeenPlaced = true;
      } else {
        this.onReachConfirmed?.(position);
      }
    });
    scene.add(controller);

    session.addEventListener('end', () => {
      this.hitTestSource = null;
      this.hitTestSourceRequested = false;
      this.hasBeenPlaced = false;
      this.reticle.visible = false;
    });
  }

  /** Call once per frame from the render loop while an AR session is active. */
  public updateHitTest(frame: XRFrame | undefined) {
    if (!frame) return;
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    const session = this.renderer.xr.getSession();
    if (!referenceSpace || !session) return;

    if (!this.hitTestSourceRequested) {
      this.hitTestSourceRequested = true;
      session.requestReferenceSpace('viewer').then((viewerSpace: XRReferenceSpace) => {
        session.requestHitTestSource?.({ space: viewerSpace })?.then((source: XRHitTestSource) => {
          this.hitTestSource = source;
        });
      });
    }

    if (this.hitTestSource) {
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        if (pose) {
          this.reticle.visible = true;
          this.reticle.matrix.fromArray(pose.transform.matrix);
        }
      } else {
        this.reticle.visible = false;
      }
    }
  }
}
