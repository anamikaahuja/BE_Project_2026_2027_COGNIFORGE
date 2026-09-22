import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FaceDetector, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { GhostRobot } from './Robot';
import { RealRobot } from './RealRobot';
import { WIM } from './WIM';
import { WebSocketClient, PlannedMessage } from '../socket/WebSocketClient';
import { HandTracking } from '../xr/HandTracking';
import { ARSession } from '../xr/ARSession';
import { VRPanel, VRAction, VRPanelState } from '../xr/VRPanel';
import { getBackendHttpBase } from '../config/backend';

export class Engine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private hand1: any;
  private hand2: any;
  private controller1: any;
  private controller2: any;
  private robot: GhostRobot | RealRobot;
  private phantomRobot: GhostRobot;
  private intentRobot: GhostRobot;
  private wim!: WIM;
  private grid: THREE.GridHelper | null = null;
  private highCognitiveLoad: boolean = false;
  private workspaceBoundary: THREE.Mesh | null = null;
  private wsClient: WebSocketClient;
  private handTracking: HandTracking = new HandTracking();
  private arSession: ARSession | null = null;
  private vrPanel: VRPanel = new VRPanel();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  public onVRAction?: (action: VRAction) => void;
  private virtualBox: THREE.Mesh | null = null;
  private preArBackground: THREE.Color | null = null;
  public onArSessionChange?: (active: boolean) => void;
  // Surfaces AR diagnostics (support check, session errors, blend mode) into
  // the on-screen Action Log, since a phone in the field has no attached
  // devtools console to read WebXR failures from.
  public onArLog?: (msg: string) => void;
  private lastStreamTime: number = 0;
  private mouseX: number = 0;
  private mouseY: number = 0;

  // Review Mode: steps a dedicated ghost robot through a recorded/smoothed
  // trajectory so the user can inspect it before approving execution.
  private reviewRobot: GhostRobot | null = null;
  private reviewWaypoints: number[][] = [];
  private reviewIndex: number = 0;
  private reviewTimer: number | null = null;

  // Session recording (Demonstrate -> Review -> Edit flow)
  private isRecording: boolean = false;
  private recordedWaypoints: number[][] = [];
  
  // Head & Hand Tracking State
  private videoElement: HTMLVideoElement | null = null;
  private faceDetector: FaceDetector | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private headTrackingEnabled: boolean = false;
  private defaultBackground: THREE.Color | null = null;
  private lastVideoTime: number = -1;
  private faceX: number = 0;
  private faceY: number = 0;
  private wasPinched: boolean = false;
  private handCursorX: number = 0;
  private handCursorY: number = 0;
  private turntableGroup: THREE.Group;
  private previousHandX: number = 0;

  // All-zero joints put the UR5 in a fully foreshortened pose that's nearly
  // coaxial with the default camera view -- it reads as a stubby blob
  // rather than a recognizable articulated arm even though the mesh and
  // materials are correct. This bent "ready" pose (shoulder lifted, elbow
  // bent) is the same one the RESET POSES button and the backend's /reset
  // endpoint return, so first impression and reset always show a clearly
  // readable arm shape instead of the degenerate zero pose.
  private currentJoints: number[] = [0, -1.0, 1.3, -1.5, -1.57, 0];
  public targetJoints: number[] = [0, -1.0, 1.3, -1.5, -1.57, 0];

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x222222); // Solid gray instantly

    this.turntableGroup = new THREE.Group();
    this.scene.add(this.turntableGroup);

    // Tighter FOV (35) and closer camera for more dramatic "presence"
    this.camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 20);
    this.camera.position.set(0, 1.2, 1.6); 
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    try {
        this.robot = new GhostRobot();
        this.phantomRobot = new GhostRobot({ isPhantom: true });
        this.phantomRobot.getObject().visible = false;
        this.intentRobot = new GhostRobot({ isPhantom: true });
        (this.intentRobot.getObject().children[0] as any).material.color.setHex(0x00ff00);
        (this.intentRobot.getObject().children[0] as any).material.opacity = 0.3;
        this.intentRobot.getObject().visible = false;
        this.reviewRobot = new GhostRobot({ isPhantom: true });
        this.reviewRobot.getObject().traverse((child: any) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.color.setHex(0x00ccff);
                child.material.opacity = 0.5;
                child.material.transparent = true;
            }
        });
        this.reviewRobot.getObject().visible = false;
    } catch (e) {
        console.error("Robot init failed:", e);
        this.robot = null as any;
        this.phantomRobot = null as any;
        this.intentRobot = null as any;
        this.reviewRobot = null;
    }

    this.wsClient = new WebSocketClient();
  }

  public init(container: HTMLDivElement, platformMode: 'desktop' | 'vr' | 'ar' = 'desktop') {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.xr.enabled = true; // WebXR enabled
    container.appendChild(this.renderer.domElement);

    // Each platform build only offers the session type it's actually
    // targeting: a Quest headset has no meaningful "AR" mode to advertise,
    // and a phone AR app shouldn't lead with a VR button most phones can't
    // really honor. The desktop/browser build keeps both, since a desktop
    // may still have a tethered headset (Link) or be used to preview
    // either path during development.
    if (platformMode !== 'ar') {
        container.appendChild(VRButton.createButton(this.renderer));
    }

    if (platformMode !== 'vr') {
        this.arSession = new ARSession(this.renderer);
        this.arSession.onPlace((position) => {
            this.turntableGroup.position.copy(position);
        });
        this.arSession.onReach((position) => this.handleArReach(position));
        this.arSession.onLog((msg) => this.onArLog?.(msg));
        this.arSession.createButton(this.scene).then((btn) => container.appendChild(btn));
    }

    // WebXR session lifecycle: a real 'immersive-ar' session composites the
    // phone's camera feed underneath whatever the scene renders, but only
    // if the scene doesn't paint something opaque over it. The desktop
    // build's solid background color and enclosing "virtual room" box
    // (added below, for the anamorphic-depth illusion on a flat monitor)
    // would otherwise cover the camera feed entirely -- which is very
    // likely why AR "isn't working" today: the camera passthrough is being
    // rendered, just hidden behind an opaque scene. VR sessions report
    // environmentBlendMode 'opaque' and are left alone; only a non-opaque
    // (real passthrough) session triggers this.
    this.renderer.xr.addEventListener('sessionstart', () => {
        const session = this.renderer.xr.getSession();
        const isPassthroughAr = !!session && session.environmentBlendMode !== 'opaque';
        this.onArLog?.(`AR_SESSION_START: blendMode=${session?.environmentBlendMode ?? 'unknown'}`);
        if (isPassthroughAr) {
            this.preArBackground = this.scene.background as THREE.Color | null;
            this.scene.background = null;
            if (this.virtualBox) this.virtualBox.visible = false;
            // WebGLRenderer clears every frame to an opaque black by
            // default (clearAlpha=1) regardless of scene.background --
            // without this, every empty pixel paints solid black over the
            // camera layer the XR compositor draws underneath, which looks
            // identical to no camera passthrough at all even though the
            // session and background/virtualBox toggling above are all
            // working correctly. This is the standard gotcha covered by
            // Three.js's own ARButton example.
            this.renderer.setClearAlpha(0);
            this.onArSessionChange?.(true);
        }
    });
    this.renderer.xr.addEventListener('sessionend', () => {
        if (this.preArBackground !== null) {
            this.scene.background = this.preArBackground;
            this.preArBackground = null;
        }
        if (this.virtualBox) this.virtualBox.visible = true;
        this.renderer.setClearAlpha(1);
        this.onArSessionChange?.(false);
    });

    // Head-tracking parallax is a desktop-webcam feature (simulates
    // look-around depth on a flat monitor); meaningless once you're
    // already wearing a headset or holding a phone up to look through.
    if (platformMode === 'desktop') {
        const arButton = document.createElement('button');
        arButton.innerText = 'Toggle Head Tracking Parallax';
        arButton.style.position = 'absolute';
        arButton.style.bottom = '20px';
        arButton.style.left = '20px';
        arButton.style.padding = '12px 24px';
        arButton.style.fontSize = '16px';
        arButton.style.color = '#fff';
        arButton.style.background = 'rgba(0, 0, 0, 0.5)';
        arButton.style.border = '2px solid #fff';
        arButton.style.borderRadius = '8px';
        arButton.style.cursor = 'pointer';
        arButton.style.zIndex = '999';
        arButton.addEventListener('click', () => this.toggleHeadTracking());
        container.appendChild(arButton);
    }

    // WIM
    this.wim = new WIM();
    this.turntableGroup.add(this.wim.getObject());

    // Desktop Mouse Emulation
    window.addEventListener('mousemove', (e) => {
        this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
        
        // Mouse turntable rotation (if not in XR and mouse down)
        if (e.buttons === 1 && !this.headTrackingEnabled && !this.renderer.xr.isPresenting) {
            this.turntableGroup.rotation.y += e.movementX * 0.01;
        }
    });

    // Scene Design for Maximum Prototype Visibility
    this.defaultBackground = new THREE.Color(0x1a1a1a); // Charcoal Gray
    this.scene.background = this.defaultBackground;
    
    // Full-intensity ambient light washes out every surface to the same flat
    // brightness regardless of its normal, which is why the UR5 CAD mesh
    // (real geometric detail: joint housings, cable ports, mounting
    // flanges) was reading as a featureless gray/black blob instead of a
    // recognizable articulated arm -- there was no shading gradient left
    // for the eye to pick up the curvature and edges from. Three-point-style
    // lighting (dimmer ambient fill + a defined key light + a rim light from
    // the opposite side) restores that gradient so the real mesh detail is
    // actually visible.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambientLight);

    // Key light: strong, defined shadows so cylindrical links and joint
    // housings read as 3D rather than flat silhouettes.
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(5, 10, 5);
    this.scene.add(keyLight);

    // Rim/fill light from the opposite side so the shadow side of the arm
    // isn't pure black and its far edge stays visually separated from the
    // dark background.
    const rimLight = new THREE.DirectionalLight(0xaaccff, 0.6);
    rimLight.position.set(-4, 3, -6);
    this.scene.add(rimLight);

    // Virtual Box / Room to enhance Anamorphic Depth (desktop only -- see
    // the AR session-start handler below, which hides this and the opaque
    // background for real AR passthrough).
    const boxGeo = new THREE.BoxGeometry(4, 3, 4);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, side: THREE.BackSide });
    this.virtualBox = new THREE.Mesh(boxGeo, boxMat);
    this.virtualBox.position.set(0, 1.5, -0.5);
    this.scene.add(this.virtualBox);

    // Floor Grid
    this.grid = new THREE.GridHelper(20, 40, 0x555555, 0x333333);
    this.turntableGroup.add(this.grid);

    // Grounding Shadow Plane for enhanced presence
    const shadowGeo = new THREE.PlaneGeometry(2, 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    this.turntableGroup.add(shadowMesh);

    // Workspace Boundary
    const workspaceGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const workspaceMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        wireframe: true,
        transparent: true,
        opacity: 0.1
    });
    this.workspaceBoundary = new THREE.Mesh(workspaceGeometry, workspaceMaterial);
    this.workspaceBoundary.position.set(0, 0.75, -0.6); // Centered over robot
    this.turntableGroup.add(this.workspaceBoundary);

    // Robot: show the procedural placeholder immediately (synchronous,
    // always available), then swap in the real UR5 CAD meshes once they
    // finish loading. If loading fails for any reason (offline build,
    // missing asset files in a deployment), we simply keep the working
    // procedural fallback rather than crash or show nothing.
    if (this.robot) {
        this.turntableGroup.add(this.robot.getObject());
    }
    this.loadRealRobot();

    if (this.phantomRobot) {
        this.turntableGroup.add(this.phantomRobot.getObject());
    }
    if (this.intentRobot) {
        this.turntableGroup.add(this.intentRobot.getObject());
    }
    if (this.reviewRobot) {
        this.turntableGroup.add(this.reviewRobot.getObject());
    }

    // Position the turntable behind the camera's default view, but keep its
    // Y at 0: WebXR's 'local-floor' reference space (requested by VRButton)
    // puts world y=0 at the user's real physical floor, so anything other
    // than 0 here would make the floor grid and the real-scale robot appear
    // to float above or sink below where the headset user's feet actually
    // are. The desktop-only anamorphic camera (see animate()) is tuned to
    // frame the robot correctly from this floor-aligned position instead.
    this.turntableGroup.position.set(0, 0, -0.5);

    // Controllers
    this.controller1 = this.renderer.xr.getController(0);
    this.scene.add(this.controller1);
    this.controller2 = this.renderer.xr.getController(1);
    this.scene.add(this.controller2);

    // Thin visible ray from each controller so the user can actually aim at
    // the in-headset UI panel below -- without this, hitting a floating 3D
    // button is a blind guess.
    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
    ]);
    const rayMaterial = new THREE.LineBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.6 });
    for (const controller of [this.controller1, this.controller2]) {
        const ray = new THREE.Line(rayGeometry, rayMaterial);
        ray.name = 'controller-ray';
        ray.scale.z = 1.5;
        controller.add(ray);
        controller.addEventListener('select', () => this.handleControllerSelect(controller));
    }

    // In-headset control panel: since the 2D HTML overlay used on desktop
    // is invisible inside an immersive-vr session, the same core actions
    // (start/stop demonstration, approve/reject) need a real in-scene UI.
    // Parented to the camera so it stays in view like a wrist display.
    this.camera.add(this.vrPanel.getObject());
    this.vrPanel.getObject().position.set(0.32, -0.22, -0.7);
    this.vrPanel.getObject().rotation.set(-0.15, -0.3, 0);
    this.scene.add(this.camera);

    // Hands
    const handModelFactory = new XRHandModelFactory();
    this.hand1 = this.renderer.xr.getHand(0);
    this.hand1.add(handModelFactory.createHandModel(this.hand1, 'mesh'));
    this.scene.add(this.hand1);

    this.hand2 = this.renderer.xr.getHand(1);
    this.hand2.add(handModelFactory.createHandModel(this.hand2, 'mesh'));
    this.scene.add(this.hand2);

    // WebSocket Init
    this.initSocket();

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private loadRealRobot() {
    const realRobot = new RealRobot();
    realRobot.ready
      .then(() => {
          const previous = this.robot;
          this.turntableGroup.remove(previous.getObject());
          this.robot = realRobot;
          this.turntableGroup.add(this.robot.getObject());
          this.robot.updateJoints(this.currentJoints);
      })
      .catch((err) => {
          console.warn('[Engine] Real UR5 model failed to load; staying on procedural placeholder.', err);
      });
  }

  // --- External Control Hooks ---
  private isManualMode: boolean = false;
  private manualJoints: number[] = [0,0,0,0,0,0];

  public setManualMode(enable: boolean) {
    this.isManualMode = enable;
    console.log(`Control Mode: ${enable ? 'MANUAL' : 'AI'}`);
  }

  public setManualJoints(joints: number[]) {
    this.manualJoints = joints;
    if (this.isManualMode) {
        this.robot.updateJoints(this.manualJoints);
        this.currentJoints = [...joints];
        this.targetJoints = [...joints];
    }
  }

  public highlightJoint(index: number, isWarning: boolean) {
      if (this.robot) {
          this.robot.highlightJoint(index, isWarning);
      }
  }

  public setWorkspaceWarning(isWarning: boolean) {
      if (this.workspaceBoundary) {
          (this.workspaceBoundary.material as THREE.MeshBasicMaterial).color.setHex(isWarning ? 0xff0000 : 0x00ff00);
          (this.workspaceBoundary.material as THREE.MeshBasicMaterial).opacity = isWarning ? 0.4 : 0.1;
      }
  }

  /** Keeps the in-headset 3D panel's visible buttons in sync with the
   * React-owned session/HITL state (React state isn't reachable from
   * inside the WebGL scene, so the caller pushes it in explicitly). */
  public setUIState(state: VRPanelState) {
      this.vrPanel.applyState(state);
  }

  private handleControllerSelect(controller: THREE.Object3D) {
      const interactables = this.vrPanel.getInteractables();
      if (interactables.length === 0) return;

      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const hits = this.raycaster.intersectObjects(interactables, false);
      if (hits.length > 0) {
          const action = hits[0].object.userData.action as VRAction;
          this.onVRAction?.(action);
      }
  }

  public onJointUpdate?: (joints: number[], stress: number[], hitlStatus: boolean) => void;
  public contingencies: GhostRobot[] = [];

  private initSocket() {
    this.wsClient.onMessage((data: PlannedMessage) => {
        if (data.status === 'planned' && !this.isManualMode) {

            if (data.high_cognitive_load !== undefined) {
                this.highCognitiveLoad = data.high_cognitive_load;
                if (this.wim) this.wim.setVisibility(!this.highCognitiveLoad);
                if (this.grid) this.grid.visible = !this.highCognitiveLoad;
            }
            
            // Handle HITL Contingencies rendering (Multi-Hypothesis Visualization)
            if (data.contingencies && data.contingencies.length > 0) {
                const colors = [0x0088ff, 0xff8800, 0x88ff00, 0xff0088]; // Blue, Orange, Lime, Pink
                // Ensure we have enough ghost robots
                while (this.contingencies.length < data.contingencies.length) {
                    const g = new GhostRobot({ isPhantom: true });
                    const colorIndex = this.contingencies.length % colors.length;
                    g.getObject().traverse((child: any) => {
                        if (child.isMesh && child.material) {
                            child.material = child.material.clone();
                            child.material.color.setHex(colors[colorIndex]);
                            child.material.opacity = 0.25; 
                            child.material.transparent = true;
                        }
                    });
                    this.turntableGroup.add(g.getObject());
                    this.contingencies.push(g);
                }
                for (let i = 0; i < data.contingencies.length; i++) {
                    this.contingencies[i].updateJoints(data.contingencies[i]);
                    this.contingencies[i].getObject().visible = true;
                }
            } else {
                this.contingencies.forEach(g => g.getObject().visible = false);
            }

            if (data.robot_joints) {
                // If HITL is required, we don't automatically update targetJoints
                if (!data.requires_hitl) {
                    this.targetJoints = data.robot_joints;
                }
                
                // Show intent robot immediately
                if (this.intentRobot) {
                    this.intentRobot.updateJoints(data.robot_joints);
                    this.intentRobot.getObject().visible = true;
                }

                if (this.onJointUpdate && this.robot) {
                    this.onJointUpdate(data.robot_joints, this.robot.getSimulatedStress(), data.requires_hitl);
                }
            }
            if (data.rejected_joints) {
                this.phantomRobot.updateJoints(data.rejected_joints);
                this.phantomRobot.getObject().visible = true;
                this.setWorkspaceWarning(true);
                // Auto hide phantom after a short delay
                setTimeout(() => {
                    this.phantomRobot.getObject().visible = false;
                    this.setWorkspaceWarning(false);
                }, 2000);
            }
        }
    });

    this.wsClient.connect();
  }

  private async toggleHeadTracking() {
    this.headTrackingEnabled = !this.headTrackingEnabled;
    
    if (this.headTrackingEnabled) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            
            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = stream;
            this.videoElement.play();
            
            if (!this.faceDetector) {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                this.faceDetector = await FaceDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO"
                });
            }
            if (!this.handLandmarker) {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
            }
            
            console.log("Head & Hand Tracking Mode enabled.");
        } catch (err) {
            console.error("Error accessing webcam: ", err);
            this.headTrackingEnabled = false;
            alert("Could not access webcam for head tracking.");
        }
    } else {
        // Disable Head Tracking Mode
        if (this.videoElement && this.videoElement.srcObject) {
            const stream = this.videoElement.srcObject as MediaStream;
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
        }
        this.videoElement = null;
        this.faceX = 0;
        this.faceY = 0;
        console.log("Head Tracking Mode disabled.");
    }
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public animate() {
    this.renderer.setAnimationLoop((_time: number, frame?: XRFrame) => {
      this.streamHandData();

      // The in-headset panel only matters inside an XR session -- on
      // desktop the full 2D HTML overlay already covers everything, and
      // the camera-attached panel would otherwise show up as an
      // unnecessary, partially off-screen HUD in the regular browser view.
      this.vrPanel.getObject().visible = this.renderer.xr.isPresenting;

      if (this.renderer.xr.isPresenting && this.renderer.xr.getSession()?.environmentBlendMode !== 'opaque') {
          // A non-opaque blend mode indicates AR passthrough rather than VR.
          this.arSession?.updateHitTest(frame);
      }

      if (!this.isManualMode) {
          let updated = false;
          for (let i = 0; i < 6; i++) {
              this.currentJoints[i] = THREE.MathUtils.lerp(this.currentJoints[i], this.targetJoints[i], 0.1);
              if (Math.abs(this.currentJoints[i] - this.targetJoints[i]) > 0.001) updated = true;
          }
          if (updated && this.robot) {
              this.robot.updateJoints(this.currentJoints);
          }
      }

      if (!this.renderer.xr.isPresenting) {
        // Disable orbit controls in desktop so anamorphic lock works perfectly
        this.controls.enabled = false;
        
        // MediaPipe Face Tracking inference
        if (this.headTrackingEnabled && this.videoElement && this.videoElement.readyState >= 2 && this.faceDetector) {
            if (this.videoElement.currentTime !== this.lastVideoTime) {
                this.lastVideoTime = this.videoElement.currentTime;
                const detections = this.faceDetector.detectForVideo(this.videoElement, performance.now());
                if (detections.detections.length > 0) {
                    const bb = detections.detections[0].boundingBox;
                    if (bb) {
                        const centerX = bb.originX + bb.width / 2;
                        const centerY = bb.originY + bb.height / 2;
                        
                        // Map head position to physical meters relative to screen center
                        const targetFaceX = -((centerX / this.videoElement.videoWidth) * 2 - 1) * 0.3; // max 30cm sideways
                        const targetFaceY = -((centerY / this.videoElement.videoHeight) * 2 - 1) * 0.2; // max 20cm up/down
                        
                        this.faceX += (targetFaceX - this.faceX) * 0.15;
                        this.faceY += (targetFaceY - this.faceY) * 0.15;
                    }
                }
                
                // Process Hand Tracking for Turntable Rotation
                if (this.handLandmarker) {
                    const handResult = this.handLandmarker.detectForVideo(this.videoElement, performance.now());
                    let isPinched = false;
                    
                    if (handResult.landmarks.length > 0) {
                        const landmarks = handResult.landmarks[0];
                        const thumbTip = landmarks[4];
                        const indexTip = landmarks[8];
                        
                        const dist = Math.sqrt(
                            Math.pow(thumbTip.x - indexTip.x, 2) +
                            Math.pow(thumbTip.y - indexTip.y, 2) +
                            Math.pow(thumbTip.z - indexTip.z, 2)
                        );
                        
                        isPinched = dist < 0.08;
                        const avgX = 1.0 - ((thumbTip.x + indexTip.x) / 2);
                        
                        if (isPinched && !this.wasPinched) {
                            this.previousHandX = avgX;
                        } else if (isPinched && this.wasPinched) {
                            const deltaX = avgX - this.previousHandX;
                            this.turntableGroup.rotation.y += deltaX * 5.0; // Rotate Turntable!
                            this.previousHandX = avgX;
                        }
                    }
                    this.wasPinched = isPinched;
                }
            }
        }
        
        // ANAMORPHIC PROJECTION MATH (Head-Coupled Perspective)
        // Screen is physically at Z=0. Head is at (faceX, eyeHeight+faceY, headZ).
        const screenW = 0.5; // Virtual monitor width in meters
        const screenH = 0.3; // Virtual monitor height in meters
        const headZ = 0.5;   // Physical distance from eyes to screen in meters
        // Desktop-only camera height above the floor-aligned world origin.
        // The world itself (turntableGroup, robot, floor grid) sits at
        // real-world y=0 unconditionally -- required so WebXR's
        // 'local-floor' reference space lines up with the real floor when
        // in a headset -- so this offset exists purely to frame that
        // floor-standing, real-scale robot nicely for a desktop viewer,
        // without moving the world content VR depends on.
        const eyeHeight = 0.3;

        // Lock camera exactly to head position (looking perfectly straight -Z)
        this.camera.position.set(this.faceX, eyeHeight + this.faceY, headZ);
        this.camera.rotation.set(0, 0, 0); // Must not look at target!

        // Calculate asymmetric frustum bounds matching the physical screen edges
        const near = 0.1;
        const far = 20;
        const left = -screenW / 2 - this.faceX;
        const right = screenW / 2 - this.faceX;
        const bottom = -screenH / 2 - this.faceY;
        const top = screenH / 2 - this.faceY;
        
        // Scale to near clipping plane
        const L = left * (near / headZ);
        const R = right * (near / headZ);
        const B = bottom * (near / headZ);
        const T = top * (near / headZ);
        
        this.camera.projectionMatrix.makePerspective(L, R, T, B, near, far);
      } else {
          this.controls.enabled = true;
          this.controls.update();
      }

      this.renderer.render(this.scene, this.camera);
    });
  }

  public approveHITL() {
      this.wsClient.approveHitl();
      this.contingencies.forEach(g => g.getObject().visible = false);
  }

  /** Places the robot workspace at wherever the AR hit-test reticle
   * currently is (i.e. wherever the phone's camera is pointed at a
   * detected real surface). Returns false if no surface is currently
   * detected, so the caller can tell the user to point at a flat surface
   * first rather than silently doing nothing. */
  public placeRobotAtReticle(): boolean {
      return this.arSession?.placeAtCurrentReticle() ?? false;
  }

  /** Tap-to-reach: converts a tapped world-space point (from the AR
   * hit-test reticle) into the robot's own local frame and asks the
   * backend to solve inverse kinematics for it, then animates the arm
   * there via the same joint-lerp the live WebSocket control path uses --
   * so tapping a spot on a real table moves the arm toward that spot as
   * rendered in AR. */
  private async handleArReach(worldPosition: THREE.Vector3) {
      if (!this.robot) return;
      const local = this.robot.getObject().worldToLocal(worldPosition.clone());
      try {
          const res = await fetch(`${getBackendHttpBase()}/solve_ik`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: local.x, y: local.y, z: local.z }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (data.joints) {
              this.targetJoints = data.joints;
          }
      } catch (e) {
          console.error('[Engine] AR reach IK request failed', e);
      }
  }

  private isTaskPlaying: boolean = false;

  /** Autonomously plays one of the five task scenarios (Section 6's Table 3
   * benchmark tasks -- GET /tasks serves the exact same list) by solving IK
   * for each real Cartesian waypoint via the backend's real DLS solver and
   * animating the arm through them, waypoint by waypoint. Freezes live
   * telemetry/WS-driven joint updates for the duration (same mechanism the
   * joint sliders use) so mouse movement or the shared-control pipeline
   * can't fight the scripted motion, then restores whatever mode was active
   * before. Returns false without doing anything if a task is already
   * playing, rather than interleaving two scripted sequences. */
  public async playTask(
      waypoints: { x: number; y: number; z: number }[],
      onProgress?: (index: number, total: number) => void,
  ): Promise<boolean> {
      if (this.isTaskPlaying || !this.robot || waypoints.length === 0) return false;
      this.isTaskPlaying = true;
      const wasManual = this.isManualMode;
      this.setManualMode(true);
      try {
          for (let i = 0; i < waypoints.length; i++) {
              onProgress?.(i, waypoints.length);
              const wp = waypoints[i];
              const res = await fetch(`${getBackendHttpBase()}/solve_ik`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(wp),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const data = await res.json();
              if (data.joints) {
                  await this.animateToJoints(data.joints, 900);
              }
          }
          return true;
      } finally {
          this.isTaskPlaying = false;
          this.setManualMode(wasManual);
      }
  }

  /** Smoothly interpolates from the current joint pose to [target] over
   * [durationMs], driving the same manual-joint render path the slider
   * panel uses so this shares one rendering code path rather than adding a
   * second animation system. */
  private animateToJoints(target: number[], durationMs: number): Promise<void> {
      const start = [...this.currentJoints];
      return new Promise((resolve) => {
          const startTime = performance.now();
          const step = (now: number) => {
              const t = Math.min(1, (now - startTime) / durationMs);
              this.setManualJoints(start.map((s, i) => THREE.MathUtils.lerp(s, target[i], t)));
              if (t < 1) {
                  requestAnimationFrame(step);
              } else {
                  resolve();
              }
          };
          requestAnimationFrame(step);
      });
  }

  private streamHandData() {
    if (!this.wsClient.isOpen) return;

    // Don't send telemetry if we are in manual mode (optional choice)
    if (this.isManualMode) return;

    const now = Date.now();
    if (now - this.lastStreamTime < 50) return;
    this.lastStreamTime = now;

    const frame = this.handTracking.buildFrame(
        this.hand1,
        this.hand2,
        this.renderer.xr.isPresenting,
        this.mouseX,
        this.mouseY
    );
    if (!frame) return;

    this.wsClient.send({
      ...frame,
      robotFeedback: {
          currentJoints: this.currentJoints,
          stress: this.robot ? this.robot.getSimulatedStress() : []
      },
      scene_objects: {
          workspaceBoundary: this.workspaceBoundary ? {
              name: 'workspaceBoundary',
              position: this.workspaceBoundary.position.toArray(),
              type: 'Boundary'
          } : null,
          wim: this.wim ? {
              name: 'wim',
              position: this.wim.getObject().position.toArray(),
              type: 'Interface'
          } : null
      }
    });

    if (this.isRecording) {
        this.recordedWaypoints.push([...this.currentJoints]);
    }
  }

  // --- Session recording (Demonstrate -> Review -> Edit) ---
  public startRecording() {
      this.isRecording = true;
      this.recordedWaypoints = [];
  }

  public stopRecording(): number[][] {
      this.isRecording = false;
      return this.recordedWaypoints;
  }

  // --- Review Mode: steps a ghost robot through a trajectory for inspection ---
  public previewTrajectory(waypoints: number[][], stepMs: number = 120) {
      this.stopPreview();
      if (!this.reviewRobot || waypoints.length === 0) return;

      this.reviewWaypoints = waypoints;
      this.reviewIndex = 0;
      this.reviewRobot.getObject().visible = true;

      this.reviewTimer = window.setInterval(() => {
          if (!this.reviewRobot) return;
          this.reviewRobot.updateJoints(this.reviewWaypoints[this.reviewIndex]);
          this.reviewIndex = (this.reviewIndex + 1) % this.reviewWaypoints.length;
      }, stepMs);
  }

  public stopPreview() {
      if (this.reviewTimer !== null) {
          window.clearInterval(this.reviewTimer);
          this.reviewTimer = null;
      }
      if (this.reviewRobot) this.reviewRobot.getObject().visible = false;
      this.reviewWaypoints = [];
  }

  public dispose() {
    this.stopPreview();
    this.wsClient.dispose();
    this.renderer.dispose();
  }
}
