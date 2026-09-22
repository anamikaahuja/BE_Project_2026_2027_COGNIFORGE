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
          {/* UI Header */}
          <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', fontFamily: 'Arial', pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          </div>

          {/* AR Place/Reach controls -- only relevant once a real
              immersive-ar camera session is running. Bottom-center so it's
              reachable with a thumb while holding the phone one-handed. */}
          {mode === 'ar' && arSessionActive && (
              <div style={{
                  position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                  textAlign: 'center', pointerEvents: 'auto'
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
                          padding: '10px 20px', background: 'rgba(0,0,0,0.7)', color: '#00ccff',
                          border: '1px solid #00ccff', borderRadius: '8px', fontFamily: 'monospace', fontSize: '13px'
                      }}>
                          Tap anywhere on the surface to move the arm there
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
          {tasks.length > 0 && (
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

          {/* Demonstrate -> Review -> Edit Session Panel.
              NOTE: bottom-left/bottom-center of the screen is occupied by
              Three.js's natively-injected VRButton and the head-tracking
              toggle button, which sit outside this React overlay and can
              intercept clicks even when this panel paints on top visually
              (DOM hit-test order != visual stacking here). Anchored to the
              top instead to avoid that collision. */}
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
                          <button onClick={toggleMode} style={{
                              padding: '10px 20px', background: '#444', color: 'white',
                              border: '1px solid #777', borderRadius: '4px', cursor: 'pointer'
                          }}>
                              DIRECT OVERRIDE
                          </button>
                      )}
                  </div>
              </div>
          )}

          {/* Manual Controls Panel -- desktop (mouse) and AR (touchscreen) only */}
          {showManualControls && (
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
