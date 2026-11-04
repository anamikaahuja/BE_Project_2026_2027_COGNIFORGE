import React, { useEffect, useState, useRef } from 'react';
import { Engine } from './scene/Engine';
import { SessionClient, FinalizeResult } from './socket/SessionClient';
import { getBackendHttpBase, getBackendHost, setBackendHost } from './config/backend';

export type PlatformMode = 'desktop' | 'vr' | 'ar';

type DemoStatus = 'idle' | 'recording' | 'finalizing' | 'reviewing';

const MODE_COPY: Record<PlatformMode, { subtitle: string; entryHint: string }> = {
  desktop: {
    subtitle: 'Cognitive Robot Programming Prototype',
    entryHint: 'Move mouse to control robot via LangGraph',
  },
  vr: {
    subtitle: 'VR Edition -- put on your headset and press Enter VR',
    entryHint: 'Demonstrate tasks with your hands once inside VR',
  },
  ar: {
    subtitle: 'AR Edition -- point your phone at a flat surface and press Enter AR',
    entryHint: 'Tap Enter AR to place the workspace on a real surface',
  },
};

export const App = ({ mode = 'desktop' as PlatformMode }: { mode?: PlatformMode }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const sessionClientRef = useRef(new SessionClient());

  // App-level mode select, shown on launch: "Arm Control" is the existing
  // live shared-control / digital-twin experience (renamed conceptually,
  // not restructured); "Training" is a distinct operator-trainer flow
  // where a trainee attempts a scenario themselves and is scored, rather
  // than watching the arm execute one autonomously. Chosen once at
  // startup but switchable via the header button below.
  type AppMode = 'select' | 'arm_control' | 'training';
  const [appMode, setAppMode] = useState<AppMode>('select');

  const [isManual, setIsManual] = useState(false);
  const [joints, setJoints] = useState([0, 0, 0, 0, 0, 0]);
  const [stress, setStress] = useState([0, 0, 0, 0, 0, 0]);
  const [warnings, setWarnings] = useState<number[]>([]);
  const [requiresHitl, setRequiresHitl] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Demonstrate -> Review -> Edit session flow
  const [demoStatus, setDemoStatus] = useState<DemoStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finalizeInfo, setFinalizeInfo] = useState<FinalizeResult | null>(null);

  // AR place-then-reach flow: once an immersive-ar session is active, the
  // user places the workspace once, then taps anywhere to make the arm
  // reach there (see ARSession.ts / Engine.ts's handleArReach).
  const [arSessionActive, setArSessionActive] = useState(false);
  const [arPlaced, setArPlaced] = useState(false);

  // Backend host override: a phone (installed APK or a browser on the same
  // WiFi) can never reach "localhost" -- that resolves to the phone itself,
  // not the machine running the backend. There's no way to type an IP in
  // without a settings UI, so this exposes the existing setBackendHost()
  // mechanism (see config/backend.ts) directly in the app.
  const [showSettings, setShowSettings] = useState(false);
  const [hostInput, setHostInput] = useState(getBackendHost());

  const handleSaveBackendHost = () => {
      const trimmed = hostInput.trim();
      if (!trimmed) return;
      setBackendHost(trimmed);
      window.location.reload();
  };

  // Multi-Agent Ledger viewer: every one of the 9 LangGraph agents already
  // writes a hash-chained entry to the backend's SecureAuditor on every
  // single frame (see BaseAgent.run() in agents/graph.py) -- that pipeline
  // was otherwise completely invisible during a live demo, since only the
  // robot moving and the sparse Action Log actually show on screen. This
  // panel polls the existing /ledger endpoint (no backend changes needed)
  // and makes the real, growing, tamper-evident decision trail visible and
  // clickable, so "multi-agent" and "audit ledger" stop being claims in a
  // paper and become something a viewer can watch happen.
  type LedgerEntry = {
      id: number; timestamp: string; agent_name: string; action_type: string;
      decision_payload: string; prev_hash: string; hash: string;
  };
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerIntegrity, setLedgerIntegrity] = useState<{ valid: boolean; entries?: number; broken_at_id?: number } | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const AGENT_COLORS: Record<string, string> = {
      Gateway: '#8a8aff',
      Perception: '#00ccff',
      VisualReasoning: '#c084fc',
      IntentPredictor: '#ffd400',
      Reactive: '#ff4444',
      BDIPlanner: '#6366f1',
      MotionPlanner: '#00ff88',
      ErrorCorrection: '#ff8800',
      Meta: '#ffffff',
  };

  useEffect(() => {
      if (!showLedger) return;
      let cancelled = false;
      const poll = async () => {
          try {
              const res = await fetch(`${getBackendHttpBase()}/ledger?limit=15`);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const data = await res.json();
              if (cancelled) return;
              setLedgerEntries(data.ledger || []);
              setLedgerIntegrity(data.integrity || null);
              setLedgerError(null);
          } catch (e: any) {
              if (!cancelled) setLedgerError(e.message || 'Could not reach backend');
          }
      };
      poll();
      const interval = setInterval(poll, 1000);
      return () => { cancelled = true; clearInterval(interval); };
  }, [showLedger]);

  // Task Scenarios: the same five tasks (Pick-and-Place, Stacking, Path
  // Tracing, Assembly 2-Part, Assembly Complex) Table 3's benchmark numbers
  // were measured against -- GET /tasks serves the exact same list from
  // app/robotics/tasks.py, so this and the offline harness can never drift
  // apart. Selecting one plays it live via Engine.playTask() (real /solve_ik
  // calls against the real DLS solver, one per waypoint) instead of only
  // ever recording the operator's own manual demonstration.
  type TaskDef = { name: string; label: string; description: string; waypoints: { x: number; y: number; z: number }[] };
  const [tasks, setTasks] = useState<TaskDef[]>([]);
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [playingTask, setPlayingTask] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<{ index: number; total: number } | null>(null);

  useEffect(() => {
      let cancelled = false;
      (async () => {
          try {
              const res = await fetch(`${getBackendHttpBase()}/tasks`);
              if (!res.ok) return;
              const data = await res.json();
              if (!cancelled) {
                  const loaded: TaskDef[] = data.tasks || [];
                  setTasks(loaded);
                  if (loaded.length > 0) setSelectedTask(loaded[0].name);
              }
          } catch {
              // Backend not reachable yet -- the selector just stays empty,
              // same as every other panel before the backend connects.
          }
      })();
      return () => { cancelled = true; };
  }, []);

  const handleRunTask = async (task: TaskDef) => {
      if (!engineRef.current || playingTask) return;
      setPlayingTask(task.name);
      setTaskProgress({ index: 0, total: task.waypoints.length });
      addLog(`TASK: Running ${task.label} (${task.waypoints.length} waypoints)`);
      try {
          await engineRef.current.playTask(task.waypoints, (index, total) => {
              setTaskProgress({ index, total });
          });
          addLog(`TASK: ${task.label} complete`);
      } catch (e: any) {
          addLog(`TASK ERROR: ${e.message || 'failed'}`);
      } finally {
          setPlayingTask(null);
          setTaskProgress(null);
      }
  };

  // Physical arm bridge: an operator-facing toggle for the real 5-DOF
  // hardware arm (hardware/pico_arm/ + backend/app/robotics/pico_bridge.py).
  // Two independent things, deliberately not coupled: showing the visual
  // preview (physicalArmVisible, a pure frontend rendering choice) and
  // actually driving real servos (which needs the Pico's IP and only takes
  // effect after /pico/configure). You can preview the arm with no
  // hardware attached at all, or drive real hardware with the preview
  // hidden -- neither implies the other.
  //
  // Driven by direct per-motor jog control, not hand-tracking/IK: without
  // this arm's real link lengths and servo mounting measured, an
  // IK-computed target lands at the wrong point in space regardless of how
  // correct the IK math is. Jogging each servo's raw angle by hand and
  // watching the real arm respond sidesteps needing that calibration at
  // all -- see pico_bridge.py's module docstring.
  const [showPhysicalArmSettings, setShowPhysicalArmSettings] = useState(false);
  const [physicalArmVisible, setPhysicalArmVisible] = useState(false);
  const [picoHostInput, setPicoHostInput] = useState('');
  const [picoPortInput, setPicoPortInput] = useState('8888');
  const [picoStatus, setPicoStatus] = useState<{ enabled: boolean; host: string | null; port: number } | null>(null);

  // [base, shoulder, elbow, wrist, gripper] -- raw servo degrees, matching
  // main.py's SERVO_LIMITS_DEG defaults exactly (0-180 for the first four
  // joints, 0-60 for the gripper where 0=open/60=closed). 90 is a servo's
  // natural mechanical center for the arm joints; 0 leaves the gripper open.
  const JOG_JOINTS: { label: string; min: number; max: number }[] = [
      { label: 'BASE', min: 0, max: 180 },
      { label: 'SHOULDER', min: 0, max: 180 },
      { label: 'ELBOW', min: 0, max: 180 },
      { label: 'WRIST', min: 0, max: 180 },
      { label: 'GRIPPER', min: 0, max: 60 },
  ];
  const [jogJoints, setJogJoints] = useState<number[]>([90, 90, 90, 90, 0]);

  const togglePhysicalArmVisible = () => {
      const next = !physicalArmVisible;
      setPhysicalArmVisible(next);
      engineRef.current?.setPhysicalArmVisible(next);
  };

  // Fires on every slider drag event -- updates the visual twin
  // immediately (regardless of whether a Pico is even connected) and, only
  // when one is, forwards the full 5-joint array to it. Not force-sent:
  // pico_bridge.py's own ~12Hz throttle is what keeps a fast drag from
  // flooding the Pico's single-threaded loop, so a throttled request here
  // simply not landing is expected, not an error.
  const handleJogChange = async (index: number, value: number) => {
      const next = [...jogJoints];
      next[index] = value;
      setJogJoints(next);
      engineRef.current?.setPhysicalArmJoints(next);

      if (!picoStatus?.enabled) return;
      try {
          await fetch(`${getBackendHttpBase()}/pico/jog`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ joints: next }),
          });
      } catch (e: any) {
          addLog(`PICO ERROR: ${e.message || 'could not reach backend'}`);
      }
  };

  const refreshPicoStatus = async () => {
      try {
          const res = await fetch(`${getBackendHttpBase()}/pico/status`);
          if (res.ok) setPicoStatus(await res.json());
      } catch {
          // Backend not reachable -- leave the last known status showing
          // rather than clearing it, same convention as the other panels.
      }
  };

  const handleConfigurePico = async () => {
      const host = picoHostInput.trim();
      if (!host) return;
      try {
          const res = await fetch(`${getBackendHttpBase()}/pico/configure`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ host, port: parseInt(picoPortInput, 10) || 8888 }),
          });
          const data = await res.json();
          setPicoStatus(data);
          addLog(`PICO: Configured for ${host}:${data.port} -- use the Joint Jog sliders to move it`);
      } catch (e: any) {
          addLog(`PICO ERROR: ${e.message || 'could not reach backend'}`);
      }
  };

  const handleDisablePico = async () => {
      try {
          const res = await fetch(`${getBackendHttpBase()}/pico/disable`, { method: 'POST' });
          setPicoStatus(await res.json());
          addLog('PICO: Disabled -- physical arm will no longer receive commands');
      } catch (e: any) {
          addLog(`PICO ERROR: ${e.message || 'could not reach backend'}`);
      }
  };

  const summarizeDecision = (payloadJson: string): string => {
      try {
          const parsed = JSON.parse(payloadJson);
          const action = parsed.action || parsed.perception || '';
          return String(action).replace(/[{}']/g, '').slice(0, 70);
      } catch {
          return payloadJson.slice(0, 70);
      }
  };

  const addLog = (msg: string) => {
      setLogs(prev => {
          const updated = [...prev, msg];
          return updated.length > 5 ? updated.slice(1) : updated;
      });
  };

  const checkLimits = (currentJoints: number[], engine: Engine) => {
    const newWarnings: number[] = [];
    currentJoints.forEach((j, i) => {
        if (Math.abs(j) > 3.0) newWarnings.push(i);
    });
    setWarnings(newWarnings);
  };

  // Tracks the latest HITL flag for the onJointUpdate closure without being
  // an effect dependency -- see the mount effect below for why this matters.
  const requiresHitlRef = useRef(false);

  // Operator Training Mode: a trainee attempts a scenario's waypoints
  // themselves (live hand/mouse tracking) and is scored, rather than
  // watching the autoplay feature execute it autonomously. Progress is
  // tracked in a ref (mutated inside engine.onTrainingResult, a callback
  // set up once in the mount effect below -- same reasoning as
  // requiresHitlRef just above: a callback captured at mount time can't
  // safely close over state that changes afterward) and mirrored into
  // React state purely for rendering.
  type TrainingWaypointResult = { distance: number; tfs: number; timeMs: number };
  type TrainingProgress = {
      active: boolean;
      task: TaskDef | null;
      waypointIndex: number;
      waypointStartTime: number;
      results: TrainingWaypointResult[];
  };
  const trainingProgressRef = useRef<TrainingProgress>({ active: false, task: null, waypointIndex: 0, waypointStartTime: 0, results: [] });
  const [trainingTask, setTrainingTask] = useState<TaskDef | null>(null);
  const [trainingActive, setTrainingActive] = useState(false);
  const [trainingWaypointIndex, setTrainingWaypointIndex] = useState(0);
  const [trainingLiveDistance, setTrainingLiveDistance] = useState<number | null>(null);
  const [trainingFinalScore, setTrainingFinalScore] = useState<{
      tcr: number; avgTfs: number; totalTimeMs: number; waypointsReached: number; totalWaypoints: number;
  } | null>(null);

  const finishTrainingAttempt = () => {
      const progress = trainingProgressRef.current;
      const total = progress.task?.waypoints.length ?? 0;
      const reached = progress.results.length;
      setTrainingFinalScore({
          tcr: total > 0 ? (reached / total) * 100 : 0,
          avgTfs: reached > 0 ? progress.results.reduce((s, r) => s + r.tfs, 0) / reached : 0,
          totalTimeMs: progress.results.reduce((s, r) => s + r.timeMs, 0),
          waypointsReached: reached,
          totalWaypoints: total,
      });
      progress.active = false;
      setTrainingActive(false);
      engineRef.current?.setTrainingTarget(null);
      addLog(`TRAINING: Attempt complete -- ${reached}/${total} waypoints reached`);
  };

  const startTrainingAttempt = (task: TaskDef) => {
      if (!engineRef.current || trainingProgressRef.current.active) return;
      trainingProgressRef.current = { active: true, task, waypointIndex: 0, waypointStartTime: Date.now(), results: [] };
      setTrainingTask(task);
      setTrainingActive(true);
      setTrainingWaypointIndex(0);
      setTrainingLiveDistance(null);
      setTrainingFinalScore(null);
      engineRef.current.setTrainingTarget(task.waypoints[0]);
      addLog(`TRAINING: Attempt started -- ${task.label} (${task.waypoints.length} waypoints)`);
  };

  // Returning to the mode-select screen mid-attempt would otherwise leave
  // the training target marker floating in the scene and the ref marked
  // "active" forever (nothing else clears it once appMode moves away from
  // 'training').
  const exitToModeSelect = () => {
      if (trainingProgressRef.current.active) {
          trainingProgressRef.current = { active: false, task: null, waypointIndex: 0, waypointStartTime: 0, results: [] };
          setTrainingActive(false);
          setTrainingTask(null);
          setTrainingWaypointIndex(0);
          setTrainingLiveDistance(null);
          setTrainingFinalScore(null);
          engineRef.current?.setTrainingTarget(null);
      }
      setAppMode('select');
  };

  useEffect(() => {
    if (containerRef.current && !engineRef.current) {
        const engine = new Engine();
        engine.init(containerRef.current, mode);

        // IMPORTANT: this effect must run exactly once on mount. It
        // previously depended on `[requiresHitl]` so that the callback
        // below could read a fresh value -- but that meant every HITL
        // flag flip tore down and recreated the entire Three.js engine
        // (new scene, new WebSocket connection), which is why clicking
        // "Approve" appeared to do nothing: the approval fired, then the
        // resulting state change immediately destroyed the engine that
        // was supposed to reflect it. Reading/writing a ref instead of
        // closing over `requiresHitl` avoids needing the dependency.
        engine.onJointUpdate = (newJoints: number[], newStress: number[], hitlStatus: boolean) => {
            setJoints(newJoints);
            if (newStress) setStress(newStress);

            if (hitlStatus !== requiresHitlRef.current) {
                requiresHitlRef.current = hitlStatus;
                setRequiresHitl(hitlStatus);
                if (hitlStatus) {
                    addLog("REQUIRE_HITL_REVIEW: Operator input needed for contingency selection.");
                }
            }

            checkLimits(newJoints, engine);
        };

        // Fires on every WS frame while Training Mode is active (see
        // Engine.ts's onTrainingResult). Only records a waypoint once --
        // `result.reached` stays true for as long as the operator holds
        // the arm near the target, so without the ref-based progress
        // check below, the same waypoint would advance repeatedly for
        // every frame it stays reached on.
        engine.onTrainingResult = (result) => {
            const progress = trainingProgressRef.current;
            if (!progress.active || !progress.task) return;

            if (!result) {
                setTrainingLiveDistance(null);
                return;
            }
            setTrainingLiveDistance(result.distance);

            if (result.reached) {
                progress.results.push({
                    distance: result.distance,
                    tfs: result.tfs,
                    timeMs: Date.now() - progress.waypointStartTime,
                });
                const nextIndex = progress.waypointIndex + 1;
                if (nextIndex >= progress.task.waypoints.length) {
                    finishTrainingAttempt();
                } else {
                    progress.waypointIndex = nextIndex;
                    progress.waypointStartTime = Date.now();
                    setTrainingWaypointIndex(nextIndex);
                    setTrainingLiveDistance(null);
                    engine.setTrainingTarget(progress.task.waypoints[nextIndex]);
                }
            }
        };

        engine.animate();
        engineRef.current = engine;
        addLog("SYSTEM: Engine initialized. Awaiting telemetry.");
    }

    return () => {
        if (engineRef.current) {
            engineRef.current.dispose();
            engineRef.current = null;
        }
    };
  }, []);

  // Keeps Engine.trainingModeActive (and therefore the training_mode flag
  // sent on every WS frame -- see streamHandData) in sync with the app-level
  // mode select. This must cover the whole Training screen, not just an
  // in-progress attempt: the Pico safety gate in main.py's WS handler keys
  // off this same flag, so it needs to already be true the moment the
  // operator's hand starts moving in Training mode, before they've even
  // pressed START ATTEMPT.
  useEffect(() => {
      engineRef.current?.setTrainingMode(appMode === 'training');
  }, [appMode]);

  const handleJointChange = (index: number, val: string) => {
    const newJoints = [...joints];
    newJoints[index] = parseFloat(val);
    setJoints(newJoints);
    if (isManual && engineRef.current) {
        engineRef.current.setManualJoints(newJoints);
    }
  };

  const handleReset = async () => {
    try {
        const res = await fetch(`${getBackendHttpBase()}/reset`);
        const data = await res.json();
        if (data.joints) {
            setJoints(data.joints);
            engineRef.current?.setManualJoints(data.joints);
            if (!isManual) setIsManual(true); // Switch to manual to see the reset state
        }
    } catch (e) {
        console.error("Reset failed", e);
    }
  };

  const handleApprove = () => {
      if (engineRef.current) {
          engineRef.current.approveHITL();
          requiresHitlRef.current = false;
          setRequiresHitl(false);
          addLog("HITL_APPROVED: Operator approved trajectory branch.");
      }
  };

  const handleStartRecording = async () => {
      if (!engineRef.current) return;
      try {
          const id = await sessionClientRef.current.create('WebXR manipulation demonstration');
          setSessionId(id);
          engineRef.current.startRecording();
          setDemoStatus('recording');
          addLog(`SESSION_START: Recording demonstration ${id.slice(0, 8)}`);
      } catch (e: any) {
          addLog(`ERROR: Could not start session (${e.message || e}). Is the backend running?`);
          setDemoStatus('idle');
      }
  };

  const handleStopAndReview = async () => {
      if (!engineRef.current || !sessionId) return;
      const waypoints = engineRef.current.stopRecording();
      setDemoStatus('finalizing');
      addLog(`SESSION_STOP: Captured ${waypoints.length} waypoints. Finalizing...`);

      // Never leave the UI stuck on "FINALIZING": any failure below (too
      // few waypoints, a dropped request, backend unavailable) resets to
      // idle with a clear log message instead of hanging silently.
      try {
          for (const wp of waypoints) {
              await sessionClientRef.current.pushFrame(sessionId, wp);
          }

          const result = await sessionClientRef.current.finalize(sessionId);
          setFinalizeInfo(result);
          addLog(result.collision_free
              ? 'SESSION_FINALIZED: Trajectory is collision-free.'
              : `WARNING: ${result.violations.length} collision/workspace violation(s) detected.`);

          const instructions = await sessionClientRef.current.getInstructions(sessionId);
          engineRef.current.previewTrajectory(instructions.joints);
          setDemoStatus('reviewing');
      } catch (e: any) {
          addLog(`ERROR: Finalize failed (${e.message || e}). Try demonstrating for longer.`);
          setDemoStatus('idle');
          setSessionId(null);
      }
  };

  const handleApproveSession = async () => {
      if (!sessionId || !engineRef.current) return;
      try {
          await sessionClientRef.current.approve(sessionId);
          addLog('SESSION_APPROVED: Saved to skill library.');
      } catch (e: any) {
          addLog(`ERROR: Approve failed (${e.message || e}).`);
      } finally {
          engineRef.current.stopPreview();
          setDemoStatus('idle');
          setSessionId(null);
          setFinalizeInfo(null);
      }
  };

  const handleRejectSession = async () => {
      if (!sessionId || !engineRef.current) return;
      try {
          await sessionClientRef.current.reject(sessionId);
          addLog('SESSION_REJECTED: Pipeline reset for re-demonstration.');
      } catch (e: any) {
          addLog(`ERROR: Reject failed (${e.message || e}).`);
      } finally {
          engineRef.current.stopPreview();
          setDemoStatus('idle');
          setSessionId(null);
          setFinalizeInfo(null);
      }
  };

  // Wires the in-headset 3D panel's buttons (see VRPanel.ts) to the same
  // handlers the 2D desktop overlay uses. Re-runs on every render (no
  // dependency array) rather than once on mount, purely so the assigned
  // closure always sees the current `sessionId`/`demoStatus` -- the same
  // stale-closure trap the HITL flag hit previously, avoided here by never
  // freezing this callback in the first place.
  useEffect(() => {
      if (!engineRef.current) return;
      engineRef.current.onVRAction = (action) => {
          switch (action) {
              case 'start_demo': handleStartRecording(); break;
              case 'stop_demo': handleStopAndReview(); break;
              case 'approve_hitl': handleApprove(); break;
              case 'approve_session': handleApproveSession(); break;
              case 'reject_session': handleRejectSession(); break;
          }
      };
  });

  // Keeps the in-headset panel's visible buttons (e.g. "APPROVE" only
  // during review) in sync with React's session/HITL state, which the
  // WebGL scene has no other way to see.
  useEffect(() => {
      engineRef.current?.setUIState({ demoStatus, requiresHitl });
  }, [demoStatus, requiresHitl]);

  // Tracks whether a real immersive-ar session is currently active, so the
  // "PLACE ROBOT" button and reach hint only show up once there's an AR
  // camera view to place the workspace into.
  useEffect(() => {
      if (!engineRef.current) return;
      engineRef.current.onArSessionChange = (active) => {
          setArSessionActive(active);
          if (active) {
              setPhysicalArmVisible(true);
              engineRef.current?.setPhysicalArmVisible(true);
          }
          if (!active) setArPlaced(false);
      };
      engineRef.current.onArLog = (msg) => addLog(msg);
  });

  const handlePlaceRobot = () => {
      const placed = engineRef.current?.placeRobotAtReticle();
      if (placed) {
          setArPlaced(true);
          addLog('AR_PLACED: Workspace placed. Tap anywhere on a surface to move the arm there.');
      } else {
          addLog('AR_PLACE_FAILED: No surface detected yet -- point your phone at a flat surface first.');
      }
  };

  const toggleMode = () => {
    const nextMode = !isManual;
    setIsManual(nextMode);
    addLog(`MODE_SWITCH: Changed to ${nextMode ? 'MANUAL' : 'AI_SHADOWING'}`);
    if (engineRef.current) {
        engineRef.current.setManualMode(nextMode);
        if (nextMode) {
            engineRef.current.setManualJoints(joints);
        }
    }
  };

  // The HITL "DIRECT OVERRIDE" button previously just called toggleMode(),
  // which switches to manual control but never touches `requiresHitl` --
  // so the review dialog stayed on screen indefinitely after choosing it,
  // even though the operator had already made their choice (take manual
  // control instead of reviewing the AI's contingencies). Manual mode does
  // stop new server-pushed HITL flags from reapplying (Engine.ts gates the
  // whole WS message handler on `!isManualMode`), so clearing the flag once
  // here is enough -- a fresh decision will be made correctly if the
  // operator later switches back to AI Shadowing.
  const handleDirectOverride = () => {
      requiresHitlRef.current = false;
      setRequiresHitl(false);
      addLog("HITL_OVERRIDDEN: Switched to manual control instead of reviewing contingencies.");
      toggleMode();
  };

  // Auto-Highlighting Parser
  const renderHighlightedText = (text: string) => {
      if (text.includes("REQUIRE_HITL_REVIEW")) {
          return <span style={{ color: '#ffcc00' }}>{text}</span>;
      }
      if (text.includes("WARNING")) {
          return <span style={{ color: '#ff4444' }}>{text}</span>;
      }
      if (text.includes("HITL_APPROVED")) {
          return <span style={{ color: '#00ff00' }}>{text}</span>;
      }
      return <span style={{ color: '#cccccc' }}>{text}</span>;
  };

  // Manual joint jogging via 2D sliders assumes a mouse (desktop) or a
  // touchscreen you can drag on (phone AR); a headset user has neither, so
  // the VR build skips this panel entirely rather than showing controls
  // nobody in a headset can reach.
  const showManualControls = mode !== 'vr';
  const copy = MODE_COPY[mode];

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      {/* Three.js Container */}
      <div
        ref={containerRef}
        style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            overflow: 'hidden'
        }}
      />

      {/* UI Overlay */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {/* Mode Select: shown once on launch (backend is hosted separately,
              so this has nothing to do with connecting to it -- it's purely
              choosing between the two experiences below). Rendered on top of
              everything else via a high z-index rather than gating the whole
              return, so the Three.js engine and WebSocket connection already
              initializing behind it aren't disturbed by the later mode
              switch. */}
          {appMode === 'select' && (
              <div style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  background: 'rgba(4,4,10,0.97)', zIndex: 30, pointerEvents: 'auto',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontFamily: 'Arial', textAlign: 'center',
              }}>
                  <h1 style={{ margin: 0, fontSize: '40px', letterSpacing: '4px' }}>COGNIFORGE</h1>
                  <p style={{ margin: '10px 0 40px 0', opacity: 0.7 }}>{copy.subtitle}</p>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', padding: '0 20px' }}>
                      <button
                          onClick={() => setAppMode('arm_control')}
                          style={{
                              width: '260px', padding: '28px 22px', background: '#0088ff', color: 'white',
                              border: 'none', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                              boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                          }}
                      >
                          <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>ROBOTIC ARM CONTROL</div>
                          <div style={{ fontSize: '13px', opacity: 0.85 }}>
                              Live digital twin of the real 5-DOF arm -- drive it by hand and demonstrate tasks.
                          </div>
                      </button>
                      <button
                          onClick={() => setAppMode('training')}
                          style={{
                              width: '260px', padding: '28px 22px', background: '#00cc66', color: '#04240f',
                              border: 'none', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                              boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                          }}
                      >
                          <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>OPERATOR TRAINING</div>
                          <div style={{ fontSize: '13px', opacity: 0.85 }}>
                              Attempt scenario waypoints yourself, hands-only, and get scored on completion and fidelity.
                          </div>
                      </button>
                  </div>
              </div>
          )}

          {/* UI Header */}
          <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', fontFamily: 'Arial', pointerEvents: 'auto' }}>
            {/* maxWidth + wrap keeps this row from silently growing into the
                top-center Demonstration Session panel's space as more
                toggle buttons get added -- title+gear+AGENTS already
                nearly reached it, and adding ARM without this genuinely
                did overlap it (buttons under the session panel became
                unclickable, since it renders later in the DOM and sits on
                top there). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', maxWidth: '340px' }}>
                <h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '2px' }}>COGNIFORGE</h1>
                <button
                    onClick={() => setShowSettings(s => !s)}
                    title="Backend connection settings"
                    style={{
                        background: 'rgba(255,255,255,0.1)', border: '1px solid #666', color: 'white',
                        borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px'
                    }}
                >
                    &#9881;
                </button>
                <button
                    onClick={() => setShowLedger(s => !s)}
                    title="Watch the multi-agent audit ledger live"
                    style={{
                        background: showLedger ? '#00cc66' : 'rgba(255,255,255,0.1)',
                        border: '1px solid #666', color: 'white',
                        borderRadius: '6px', padding: '0 10px', height: '28px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace',
                    }}
                >
                    &#128279; AGENTS
                </button>
                <button
                    onClick={() => { setShowPhysicalArmSettings(s => !s); refreshPicoStatus(); }}
                    title="Physical 5-DOF arm: preview and hardware connection"
                    style={{
                        background: picoStatus?.enabled ? '#00cc66' : 'rgba(255,255,255,0.1)',
                        border: '1px solid #666', color: 'white',
                        borderRadius: '6px', padding: '0 10px', height: '28px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace',
                    }}
                >
                    &#129302; ARM
                </button>
                {appMode !== 'select' && (
                    <button
                        onClick={exitToModeSelect}
                        title="Return to mode select"
                        style={{
                            background: 'rgba(255,255,255,0.1)', border: '1px solid #666', color: 'white',
                            borderRadius: '6px', padding: '0 10px', height: '28px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace',
                        }}
                    >
                        SWITCH MODE
                    </button>
                )}
            </div>
            <p style={{ margin: '5px 0', opacity: 0.7 }}>{copy.subtitle}</p>

            {showSettings && (
                <div style={{
                    marginTop: '8px', padding: '10px', background: 'rgba(0,0,0,0.8)',
                    border: '1px solid #666', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px',
                    maxWidth: '260px'
                }}>
                    <div style={{ marginBottom: '6px', color: '#aaa' }}>
                        Backend host (IP of the machine running the server -- "localhost" only works on that same machine, never from a phone):
                    </div>
                    <input
                        type="text"
                        value={hostInput}
                        onChange={(e) => setHostInput(e.target.value)}
                        placeholder="e.g. 192.168.1.104"
                        style={{ width: '100%', padding: '6px', marginBottom: '6px', boxSizing: 'border-box' }}
                    />
                    <button
                        onClick={handleSaveBackendHost}
                        style={{ width: '100%', padding: '6px', background: '#0088ff', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        SAVE &amp; RELOAD
                    </button>
                </div>
            )}

            {showPhysicalArmSettings && (
                <div style={{
                    marginTop: '8px', padding: '10px', background: 'rgba(0,0,0,0.8)',
                    border: '1px solid #666', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px',
                    maxWidth: '280px'
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: '#ccc' }}>
                        <input type="checkbox" checked={physicalArmVisible} onChange={togglePhysicalArmVisible} />
                        Show 5-DOF arm preview in scene
                    </label>
                    <div style={{ borderTop: '1px solid #444', paddingTop: '8px' }}>
                        <div style={{ marginBottom: '6px', color: '#aaa' }}>
                            Pico W IP (printed over USB serial when it connects to WiFi -- see hardware/pico_arm/main.py):
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <input
                                type="text"
                                value={picoHostInput}
                                onChange={(e) => setPicoHostInput(e.target.value)}
                                placeholder="e.g. 192.168.1.120"
                                style={{ flex: 2, padding: '6px', boxSizing: 'border-box' }}
                            />
                            <input
                                type="text"
                                value={picoPortInput}
                                onChange={(e) => setPicoPortInput(e.target.value)}
                                style={{ flex: 1, padding: '6px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={handleConfigurePico} style={{ flex: 1, padding: '6px', background: '#00cc66', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                CONNECT
                            </button>
                            <button onClick={handleDisablePico} style={{ flex: 1, padding: '6px', background: '#663333', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                DISABLE
                            </button>
                        </div>
                        <div style={{ marginTop: '8px', color: picoStatus?.enabled ? '#00ff88' : '#888' }}>
                            {picoStatus?.enabled
                                ? `Live: jog sliders below send directly to ${picoStatus.host}:${picoStatus.port}`
                                : 'Not connected -- preview (if shown) still works, no hardware moves'}
                        </div>
                    </div>

                    {/* Direct per-motor jog control -- the only way this arm
                        moves now. No IK, no target position: each slider is
                        exactly the raw servo degree sent to the Pico, so
                        calibration is just watching the real arm and picking
                        values by eye. */}
                    <div style={{ borderTop: '1px solid #444', marginTop: '8px', paddingTop: '8px' }}>
                        <div style={{ marginBottom: '6px', color: '#aaa' }}>
                            Joint jog (raw servo degrees -- sent live if connected):
                        </div>
                        {JOG_JOINTS.map((joint, i) => (
                            <div key={joint.label} style={{ marginBottom: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span>{joint.label}</span>
                                    <span>{jogJoints[i].toFixed(0)}°</span>
                                </div>
                                <input
                                    type="range"
                                    min={joint.min}
                                    max={joint.max}
                                    step="1"
                                    value={jogJoints[i]}
                                    onChange={(e) => handleJogChange(i, parseFloat(e.target.value))}
                                    style={{ width: '100%', cursor: 'pointer' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>

          {/* AR Place/Reach controls -- only relevant once a real
              immersive-ar camera session is running. Bottom-center so it's
              reachable with a thumb while holding the phone one-handed. */}
          {mode === 'ar' && arSessionActive && (
              <div style={{
                  position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                  textAlign: 'center', pointerEvents: 'auto', width: '90%', maxWidth: '400px'
              }}>
                  {!arPlaced ? (
                      <button onClick={handlePlaceRobot} style={{
                          padding: '16px 32px', fontSize: '18px', fontWeight: 'bold',
                          background: '#0088ff', color: 'white', border: '3px solid white',
                          borderRadius: '12px', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                      }}>
                          PLACE ROBOT
                      </button>
                  ) : (
                      <div style={{
                          padding: '15px', background: 'rgba(0,0,0,0.85)',
                          border: '1px solid #00ccff', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px',
                          display: 'flex', flexDirection: 'column', gap: '10px'
                      }}>
                          <div style={{ color: '#00ccff', marginBottom: '4px', fontWeight: 'bold' }}>5-DOF AR JOINT CONTROL</div>
                          {JOG_JOINTS.map((joint, i) => (
                              <div key={joint.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ color: 'white', width: '70px', textAlign: 'left' }}>{joint.label}</span>
                                  <input
                                      type="range"
                                      min={joint.min}
                                      max={joint.max}
                                      step="1"
                                      value={jogJoints[i]}
                                      onChange={(e) => handleJogChange(i, parseFloat(e.target.value))}
                                      style={{ flex: 1, cursor: 'pointer' }}
                                  />
                                  <span style={{ color: 'white', width: '40px', textAlign: 'right' }}>{jogJoints[i].toFixed(0)}°</span>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          )}

          {/* Action Log Panel (Auto-highlighting) */}
          <div style={{
              position: 'absolute', bottom: 20, left: 20,
              background: 'rgba(0,0,0,0.6)', border: '1px solid #333',
              padding: '10px', width: '400px',
              fontFamily: 'monospace', fontSize: '12px',
              borderRadius: '4px', pointerEvents: 'auto'
          }}>
              <h3 style={{ margin: '0 0 10px 0', color: 'white' }}>AGENT ACTION LOG</h3>
              {logs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                      {renderHighlightedText(log)}
                  </div>
              ))}
          </div>

          {/* Multi-Agent Ledger: makes the otherwise-invisible 9-agent
              pipeline and its hash-chained audit trail visible on demand --
              every entry here is a real row from the backend's SQLite
              ledger, not a mockup. Anchored top-left, below the header and
              above the Action Log panel -- the right side is already
              occupied top-to-bottom by the joint control panel. */}
          {showLedger && (
              <div style={{
                  position: 'absolute', top: 100, left: 20,
                  background: 'rgba(0,0,0,0.85)', border: '1px solid #333',
                  padding: '12px', width: '480px', maxHeight: '40vh',
                  fontFamily: 'monospace', fontSize: '11px',
                  borderRadius: '4px', pointerEvents: 'auto',
                  display: 'flex', flexDirection: 'column',
              }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                      <h3 style={{ margin: 0, color: 'white' }}>MULTI-AGENT AUDIT LEDGER</h3>
                      <span style={{ color: '#888', fontSize: '10px' }}>live, polling 1/s</span>
                  </div>

                  {ledgerError && (
                      <div style={{ color: '#ff4444', marginBottom: '8px' }}>ERROR: {ledgerError}</div>
                  )}

                  {ledgerIntegrity && (
                      <div style={{
                          padding: '8px', marginBottom: '10px', borderRadius: '4px',
                          background: ledgerIntegrity.valid ? 'rgba(0,200,100,0.15)' : 'rgba(255,60,60,0.2)',
                          border: `1px solid ${ledgerIntegrity.valid ? '#00cc66' : '#ff4444'}`,
                          color: ledgerIntegrity.valid ? '#00ff88' : '#ff6666', fontWeight: 'bold',
                      }}>
                          {ledgerIntegrity.valid
                              ? `✓ CHAIN VERIFIED -- ${ledgerIntegrity.entries} DECISIONS, ZERO TAMPERING`
                              : `✗ CHAIN BROKEN AT ENTRY #${ledgerIntegrity.broken_at_id}`}
                      </div>
                  )}

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                      {ledgerEntries.length === 0 && !ledgerError && (
                          <div style={{ color: '#888' }}>Waiting for agent activity -- move the mouse or start a demonstration.</div>
                      )}
                      {ledgerEntries.map((e) => (
                          <div key={e.id} style={{
                              display: 'flex', gap: '8px', padding: '4px 0',
                              borderBottom: '1px solid #222', alignItems: 'baseline',
                          }}>
                              <span style={{
                                  color: AGENT_COLORS[e.agent_name] || '#ccc', fontWeight: 'bold',
                                  minWidth: '92px', flexShrink: 0,
                              }}>
                                  {e.agent_name}
                              </span>
                              <span style={{ color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {summarizeDecision(e.decision_payload)}
                              </span>
                              <span style={{ color: '#555', flexShrink: 0 }}>#{e.hash.slice(0, 6)}</span>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {/* Task Scenarios: the five task categories Table 3's benchmark
              numbers were measured against, playable live on demand. A
              compact dropdown + Run button rather than five stacked
              buttons -- every screen edge is already claimed (joint panel
              top-right, Action Log bottom-left, Three.js's natively
              injected VR/AR buttons bottom-center/bottom-right), so this
              sits in the one remaining gap: centered, just above those
              native buttons. */}
          {appMode === 'arm_control' && tasks.length > 0 && (
              <div style={{
                  position: 'absolute', bottom: 78, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.75)', border: '1px solid #333',
                  padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px',
                  fontFamily: 'monospace', fontSize: '12px',
                  borderRadius: '4px', pointerEvents: 'auto', whiteSpace: 'nowrap',
              }}>
                  <span style={{ color: '#888' }}>TASK:</span>
                  <select
                      value={selectedTask}
                      onChange={(e) => setSelectedTask(e.target.value)}
                      disabled={playingTask !== null}
                      style={{
                          background: '#1a1a1a', color: 'white', border: '1px solid #555',
                          borderRadius: '4px', padding: '5px 6px', fontFamily: 'monospace', fontSize: '12px',
                      }}
                  >
                      {tasks.map((task) => (
                          <option key={task.name} value={task.name} title={task.description}>{task.label}</option>
                      ))}
                  </select>
                  <button
                      onClick={() => {
                          const task = tasks.find(t => t.name === selectedTask);
                          if (task) handleRunTask(task);
                      }}
                      disabled={playingTask !== null}
                      style={{
                          background: playingTask ? '#333' : '#00cc66', color: playingTask ? '#888' : '#04240f',
                          border: 'none', borderRadius: '4px', padding: '6px 12px', fontWeight: 'bold',
                          fontFamily: 'monospace', fontSize: '12px', cursor: playingTask ? 'default' : 'pointer',
                      }}
                  >
                      {playingTask && taskProgress
                          ? `${taskProgress.index + 1}/${taskProgress.total}...`
                          : 'RUN'}
                  </button>
              </div>
          )}

          {/* Operator Training Mode panel -- occupies the same top-center
              slot as the Demonstration Session panel below, since the two
              modes are mutually exclusive and never shown together. */}
          {appMode === 'training' && (
              <div style={{
                  position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.7)', border: '1px solid #333',
                  padding: '14px', width: '320px',
                  fontFamily: 'monospace', fontSize: '12px',
                  borderRadius: '4px', pointerEvents: 'auto'
              }}>
                  <h3 style={{ margin: '0 0 10px 0', color: 'white' }}>OPERATOR TRAINING</h3>

                  {!trainingActive && !trainingFinalScore && (
                      <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <span style={{ color: '#888' }}>TASK:</span>
                              <select
                                  value={selectedTask}
                                  onChange={(e) => setSelectedTask(e.target.value)}
                                  disabled={playingTask !== null}
                                  style={{
                                      flex: 1, background: '#1a1a1a', color: 'white', border: '1px solid #555',
                                      borderRadius: '4px', padding: '5px 6px', fontFamily: 'monospace', fontSize: '12px',
                                  }}
                              >
                                  {tasks.map((task) => (
                                      <option key={task.name} value={task.name} title={task.description}>{task.label}</option>
                                  ))}
                              </select>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                  onClick={() => {
                                      const task = tasks.find(t => t.name === selectedTask);
                                      if (task) handleRunTask(task);
                                  }}
                                  disabled={playingTask !== null || tasks.length === 0}
                                  style={{
                                      flex: 1, padding: '8px',
                                      background: playingTask ? '#333' : '#444', color: playingTask ? '#888' : 'white',
                                      border: 'none', borderRadius: '4px', fontWeight: 'bold',
                                      cursor: playingTask ? 'default' : 'pointer',
                                  }}
                              >
                                  {playingTask && taskProgress
                                      ? `${taskProgress.index + 1}/${taskProgress.total}...`
                                      : 'WATCH DEMO'}
                              </button>
                              <button
                                  onClick={() => {
                                      const task = tasks.find(t => t.name === selectedTask);
                                      if (task) startTrainingAttempt(task);
                                  }}
                                  disabled={playingTask !== null || tasks.length === 0}
                                  style={{
                                      flex: 1, padding: '8px', background: '#00cc66', color: '#04240f',
                                      border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer',
                                  }}
                              >
                                  START ATTEMPT
                              </button>
                          </div>
                      </>
                  )}

                  {trainingActive && trainingTask && (
                      <div>
                          <p style={{ color: '#aaa', margin: '0 0 8px 0' }}>{trainingTask.label}</p>
                          <p style={{ color: '#ffcc00', margin: '0 0 4px 0' }}>
                              Waypoint {trainingWaypointIndex + 1} / {trainingTask.waypoints.length}
                          </p>
                          <p style={{ color: '#ccc', margin: 0 }}>
                              {trainingLiveDistance !== null
                                  ? `Distance to target: ${trainingLiveDistance.toFixed(3)} m`
                                  : 'Move toward the yellow marker'}
                          </p>
                      </div>
                  )}

                  {trainingFinalScore && (
                      <div>
                          <p style={{ color: '#00ff88', margin: '0 0 8px 0', fontWeight: 'bold' }}>ATTEMPT COMPLETE</p>
                          <p style={{ margin: '2px 0', color: '#ccc' }}>Task Completion Rate: {trainingFinalScore.tcr.toFixed(0)}%</p>
                          <p style={{ margin: '2px 0', color: '#ccc' }}>Avg. Trajectory Fidelity: {trainingFinalScore.avgTfs.toFixed(2)}</p>
                          <p style={{ margin: '2px 0', color: '#ccc' }}>Waypoints Reached: {trainingFinalScore.waypointsReached}/{trainingFinalScore.totalWaypoints}</p>
                          <p style={{ margin: '2px 0 10px 0', color: '#ccc' }}>Total Time: {(trainingFinalScore.totalTimeMs / 1000).toFixed(1)}s</p>
                          <button
                              onClick={() => setTrainingFinalScore(null)}
                              style={{ width: '100%', padding: '8px', background: '#0088ff', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                              TRY AGAIN
                          </button>
                      </div>
                  )}
              </div>
          )}

          {/* Demonstrate -> Review -> Edit Session Panel.
              NOTE: bottom-left/bottom-center of the screen is occupied by
              Three.js's natively-injected VRButton and the head-tracking
              toggle button, which sit outside this React overlay and can
              intercept clicks even when this panel paints on top visually
              (DOM hit-test order != visual stacking here). Anchored to the
              top instead to avoid that collision. */}
          {appMode === 'arm_control' && (
          <div style={{
              position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)', border: '1px solid #333',
              padding: '10px', width: '260px',
              fontFamily: 'monospace', fontSize: '12px',
              borderRadius: '4px', pointerEvents: 'auto'
          }}>
              <h3 style={{ margin: '0 0 10px 0', color: 'white' }}>DEMONSTRATION SESSION</h3>
              <p style={{ color: '#aaa', margin: '0 0 10px 0' }}>Status: {demoStatus.toUpperCase()}</p>

              {demoStatus === 'idle' && (
                  <button onClick={handleStartRecording} style={{
                      width: '100%', padding: '8px', background: '#0088ff', color: 'white',
                      border: 'none', cursor: 'pointer', fontWeight: 'bold'
                  }}>
                      START DEMONSTRATE
                  </button>
              )}

              {demoStatus === 'recording' && (
                  <button onClick={handleStopAndReview} style={{
                      width: '100%', padding: '8px', background: '#ff8800', color: 'white',
                      border: 'none', cursor: 'pointer', fontWeight: 'bold'
                  }}>
                      STOP + REVIEW
                  </button>
              )}

              {demoStatus === 'finalizing' && (
                  <p style={{ color: '#ffcc00' }}>Smoothing + validating trajectory...</p>
              )}

              {demoStatus === 'reviewing' && (
                  <>
                      {finalizeInfo && (
                          <p style={{ color: finalizeInfo.collision_free ? '#00ff88' : '#ff4444' }}>
                              {finalizeInfo.collision_free
                                  ? `Collision-free (${finalizeInfo.n_smoothed_waypoints} waypoints)`
                                  : `${finalizeInfo.violations.length} violation(s) found`}
                          </p>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={handleApproveSession} style={{
                              flex: 1, padding: '8px', background: '#00cc00', color: 'white',
                              border: 'none', cursor: 'pointer', fontWeight: 'bold'
                          }}>
                              APPROVE
                          </button>
                          <button onClick={handleRejectSession} style={{
                              flex: 1, padding: '8px', background: '#cc0000', color: 'white',
                              border: 'none', cursor: 'pointer', fontWeight: 'bold'
                          }}>
                              REJECT
                          </button>
                      </div>
                  </>
              )}
          </div>
          )}

          {/* HITL Intervention Prompt */}
          {requiresHitl && (
              <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  background: 'rgba(20,20,20,0.95)', border: '2px solid #ffcc00',
                  padding: '30px', color: 'white', fontFamily: 'Arial',
                  textAlign: 'center', borderRadius: '10px', pointerEvents: 'auto',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
              }}>
                  <h2 style={{ color: '#ffcc00', margin: '0 0 15px 0' }}>INPUT REVIEW REQUIRED</h2>
                  <p style={{ marginBottom: '25px' }}>Multiple trajectory contingencies generated.<br/>Review the ghost paths in the Digital Twin.</p>

                  <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                      <button onClick={handleApprove} style={{
                          padding: '10px 20px', background: '#00cc00', color: 'white',
                          border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                      }}>
                          APPROVE PRIMARY
                      </button>
                      {showManualControls && (
                          <button onClick={handleDirectOverride} style={{
                              padding: '10px 20px', background: '#444', color: 'white',
                              border: '1px solid #777', borderRadius: '4px', cursor: 'pointer'
                          }}>
                              DIRECT OVERRIDE
                          </button>
                      )}
                  </div>
              </div>
          )}

          {/* Manual Controls Panel -- desktop (mouse) and AR (touchscreen) only,
              and only in Arm Control mode (Training mode has its own panel
              and shouldn't let the operator jog joints directly, which
              would trivially defeat the scoring). */}
          {appMode === 'arm_control' && showManualControls && (
          <div style={{
            position: 'absolute', top: 20, right: 20,
            background: 'rgba(20, 20, 20, 0.9)',
            border: '1px solid #444',
            padding: '20px',
            color: 'white',
            fontFamily: 'monospace',
            width: '280px',
            pointerEvents: 'auto',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
          }}>
            <button
                onClick={toggleMode}
                style={{
                    width: '100%', padding: '10px', marginBottom: '10px',
                    background: isManual ? '#ffcc00' : '#444',
                    color: isManual ? 'black' : 'white',
                    border: 'none', cursor: 'pointer', fontWeight: 'bold'
                }}
            >
                MODE: {isManual ? 'MANUAL JOG' : 'AI SHADOWING'}
            </button>

            <button
                onClick={handleReset}
                style={{
                    width: '100%', padding: '10px', marginBottom: '20px',
                    background: '#ff4444',
                    color: 'white',
                    border: 'none', cursor: 'pointer', fontWeight: 'bold'
                }}
            >
                RESET POSES
            </button>

            {joints.map((val, i) => (
                <div key={i} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span>JOINT {i + 1}</span>
                        <span>{val.toFixed(2)} rad</span>
                    </div>
                    <input
                        type="range"
                        min="-6.28" max="6.28" step="0.01"
                        value={val}
                        onChange={(e) => handleJointChange(i, e.target.value)}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                </div>
            ))}

            <div style={{ fontSize: '10px', color: '#888', marginTop: '10px' }}>
                {isManual ? 'Use sliders to control joints' : copy.entryHint}
            </div>
          </div>
          )}
      </div>
    </div>
  );
};
