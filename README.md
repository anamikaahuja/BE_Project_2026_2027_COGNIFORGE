# BE Capstone Project
# COGNIFORGE: A Verified Multi-Agent Architecture for Contingency-Aware, Audit-Traceable Robot Teleoperation in WebXR

## Team Details
| Sr. No. | Name of Student | Roll No. | Branch | Email ID |
| :---: | :--- | :---: | :---: | :--- |
| 1 | ANAMIKA AHUJA | 01 | AURO | 2023.anamika.ahuja@ves.ac.in |
| 2 | ADITYA SHARMA | 27 | AURO | d2024.aditya.sharma@ves.ac.in |
| 3 | SHRADDHA VAYACHAL | 30 | AURO | d2024.shraddha.vayachal@ves.ac.in |
| 4 | SANA SHAIKH | 62 | AURO | d2024.sana.shaikh@ves.ac.in |

## Guide Details
- **Project Guide:** Mrs. Ramya T
- **Department:** Automation and Robotics
- **Institute:** Vivekanand Education Society's Institute of Technology (VESIT), Chembur, Mumbai
- **Approval Video:** [https://youtu.be/3ZimL497r2U](https://youtu.be/3ZimL497r2U)

---

## Problem Statement
The aim of this project is to develop a browser-based WebXR robot teleoperation platform using a verified nine-node cooperative multi-agent architecture to enable intuitive robot programming by demonstration. The proposed system integrates perception, reasoning, contingency-aware motion planning, Damped Least Squares (DLS) inverse kinematics, and a hash-chained audit framework to ensure safe, transparent, and audit-traceable robot operation across Web, Desktop, Virtual Reality (VR), and Mobile Augmented Reality (AR) platforms.

---

## Abstract
Industrial robot programming traditionally relies on vendor-specific programming languages, teach pendants, and manual configuration, making it complex, time-consuming, and inaccessible to non-expert users. Existing approaches also provide limited transparency into robot decision-making, making verification and auditing difficult.

COGNIFORGE addresses these challenges by developing a browser-based robot teleoperation platform that enables intuitive robot programming through natural hand demonstrations in an immersive WebXR environment.

The proposed system employs a verified nine-node cooperative multi-agent architecture integrating:
- Perception
- Visual Reasoning
- Intent Prediction
- Reactive Safety
- Belief–Desire–Intention (BDI) Planning
- Contingency-Aware Motion Planning
- Damped Least Squares Inverse Kinematics
- Error Correction
- Hash-Chained Audit Ledger

These components ensure safe, transparent, and verifiable robot operation. The platform is designed for deployment across Web, Desktop, Virtual Reality (VR), and Mobile Augmented Reality (AR) environments, providing a flexible and cross-platform solution for robot teleoperation.

Although physical robot integration is planned for future work using ROS 2 and MoveIt 2, the current implementation has been validated through comprehensive software verification, physical twin assembly, and cross-platform testing.

**Potential applications include:**
- Industrial Automation
- Smart Manufacturing
- Collaborative Robotics
- Research Laboratories
- Training & Education
- Remote Robot Operation

---

## Objectives
1. Study the limitations of existing industrial robot programming methods and analyze current WebXR and robot teleoperation technologies.
2. Design a browser-based WebXR robot teleoperation platform using a verified nine-node cooperative multi-agent framework.
3. Implement intelligent perception, planning, inverse kinematics, contingency-aware motion planning, and audit-traceable decision logging.
4. Integrate and validate the proposed framework with a physical robotic manipulator using ROS 2 and MoveIt 2 (and an experimental 5-DOF serial arm).
5. Evaluate the system through software verification, cross-platform deployment, and performance analysis across benchmark tasks.
6. Prepare comprehensive documentation and publish the research findings.

---

## Scope of the Project
- Design and development of a browser-based WebXR robot teleoperation platform.
- Implementation of a verified nine-node cooperative multi-agent architecture.
- Development of cross-platform applications for Web, Desktop (Electron), VR (Meta Quest standalone APK), and Mobile AR (ARCore native).
- Integration of Programming by Demonstration (PbD).
- Damped Least Squares (DLS) inverse kinematics with singularity avoidance.
- Contingency-aware motion planning with dual-layer collision checking (PyBullet & analytic).
- Audit-traceable decision logging via SHA-256 cryptographic hash-chains.
- Software verification and performance evaluation across standardized 6-DOF pick-and-place benchmark tasks.
- Future integration with physical industrial robots using ROS 2 and MoveIt 2.

---

## Existing System
Existing industrial robot programming primarily relies on:
- Vendor-specific programming languages (RAPID, KRL, VAL, Karel)
- Handheld teach pendants
- Kinesthetic manual guiding
- Conventional joysticks and 2D control interfaces
- Standalone proprietary VR applications

### Limitations
- Requires vendor-specific programming knowledge and certified operator expertise.
- Time-consuming manual waypoint-by-waypoint configuration.
- Difficult and hazardous for non-expert users.
- Opaque decision-making with no auditability or explainability of agent actions.
- Poor adaptability to dynamic obstacles or sudden operator changes.
- Limited cross-platform support (often locked into expensive hardware or specific OS setups).
- Minimal autonomous intelligent reasoning during live operator control.
- Inability to verify trajectory safety cryptographically before and after execution.

---

## Proposed System

### Main Idea
Develop an industrial-grade, cross-platform WebXR teleoperation system enabling intuitive demonstration-based programming of a 6-DOF robotic manipulator (UR5) via spatial input devices, mediated by an autonomous LangGraph nine-node multi-agent verification pipeline and an immutable audit ledger.

### How It Works
1. **Input Capture:** Captures natural operator spatial gestures or mouse raycasts using WebXR (VR/AR/Desktop).
2. **Gateway Processing:** Dispatches real-time session updates and commands over bi-directional WebSockets and REST endpoints.
3. **Perception & Visual Reasoning:** Aggregates workspace point-cloud/object states and tracks target boundaries.
4. **Intent Prediction:** Infers high-level user intent from spatial demonstration primitives.
5. **Reactive Safety:** Evaluates workspace boundaries, joint limits, and human-in-the-loop interlocks.
6. **BDI & Motion Planning:** Forms execution goals and generates joint-space paths using Damped Least Squares (DLS) Inverse Kinematics.
7. **Collision Checking & Error Correction:** Validates paths against dual PyBullet/analytic collision engines and adapts routes around dynamic obstacles.
8. **Cryptographic Auditing:** Encapsulates the approved trajectory and state metadata into a SHA-256 hash-chained immutable audit ledger.
9. **Robot Trajectory Execution:** Executes trajectories on the digital twin and streams joint coordinates to physical hardware (direct-drive serial bridge / ROS 2).

### Major Components
- **WebXR Immersive Interface:** Built using Three.js and React, featuring an in-headset 3D control panel (`VRPanel.ts`) and procedural UR5 kinematics.
- **Nine-Node Multi-Agent Pipeline:** Built using LangGraph, coordinating Gateway, Perception, Visual Reasoning, Intent Prediction, Reactive Safety, BDI Planning, Motion Planning, Error Correction, and Meta-Supervisor agents.
- **Damped Least Squares (DLS) Kinematics Solver:** Calculates singularity-robust inverse kinematics.
- **Collision Validation Suite:** Analytic geometry bounding hulls paired with PyBullet simulation fallback.
- **ChromaDB Skill Memory:** Vector-indexed storage of demonstrated skills for replay and adaptation.
- **Hash-Chained Audit Ledger:** Merkle-inspired audit logging guaranteeing non-repudiation.
- **Cross-Platform Delivery Engine:** Standalone Desktop app (Electron), Meta Quest standalone VR (Capacitor/WebXR), and Mobile AR (Native Kotlin/ARCore).

---

## System Architecture

![System Architecture](images/system_architecture.png)

The proposed system follows a browser-based WebXR architecture built around a verified nine-node cooperative multi-agent framework. The operator interacts with the system through a WebXR interface, where natural hand movements are captured and interpreted as robot commands. These inputs are processed sequentially by the Gateway Agent, Perception Agent, Visual Reasoning Agent, and Intent Prediction Agent to understand the user's actions. The Reactive Safety Agent continuously checks for unsafe conditions, while the Belief–Desire–Intention (BDI) Planning Agent and Motion Planning Agent generate safe and efficient robot trajectories. The Error Correction Agent resolves execution issues, and the Meta-Supervisor Agent coordinates communication between all sub-systems. All decisions and actions are securely recorded in a hash-chained audit ledger, ensuring transparency and traceability. The generated motion commands are validated using Damped Least Squares inverse kinematics and are designed for execution on a physical robot through direct serial control and ROS 2 / MoveIt 2.

---

## Hardware Requirements
| Sr. No. | Component | Specification | Quantity | Purpose |
| :---: | :--- | :--- | :---: | :--- |
| 1 | Laptop / Development PC | Intel Core i5 / AMD Ryzen 5, 16 GB RAM, SSD, Dedicated GPU | 1 | Pipeline compilation, simulation, and primary 5V power host |
| 2 | VR Headset | Meta Quest 2 / Quest 3 with Touch Controllers | 1 | 6-DOF immersive demonstration and VR evaluation |
| 3 | Mobile Phone | Android Smartphone with ARCore support | 1 | Real-world camera passthrough AR teleoperation |
| 4 | Microcontroller Board | Raspberry Pi Pico (RP2040) | 1 | Micro-stepping serial bridge for servo arm actuation |
| 5 | Physical Robot Rig | Custom 3D-Printed 5-DOF Serial Arm / UR5 Manipulator | 1 | Hardware trajectory validation and bench testing |
| 6 | System Power Supply | Direct 5V DC Bus (Host Laptop USB Power Line) | 1 | Integrated power supply for microcontroller logic and servos |

---

## Software Requirements
| Sr. No. | Software / Tool | Version | Purpose |
| :---: | :--- | :--- | :--- |
| 1 | Operating System | Windows 11 / Linux Ubuntu 22.04 / macOS | Primary development and testing environments |
| 2 | Python | v3.10+ | Multi-agent backend, kinematics engine, and tests |
| 3 | Node.js | v18+ / v20+ | Frontend build toolchain and Electron packaging |
| 4 | FastAPI & Uvicorn | Latest | Asynchronous REST API and WebSocket gateway |
| 5 | LangGraph & LangChain | Latest | Multi-agent coordination and state routing |
| 6 | Three.js & Vite | Latest | Procedural WebXR rendering and user interface |
| 7 | Android Studio | Ladybug (2024+) | Kotlin ARCore and Capacitor APK builds |
| 8 | PyBullet | Latest | Physics validation and kinematic collision detection |
| 9 | ChromaDB | Latest | Vector memory for demonstrated skill trajectories |
| 10 | ROS 2 & MoveIt 2 | Humble / Jazzy | Physical industrial robot control (future scope) |

---

## Technologies Used

### Programming Languages
- **TypeScript & JavaScript:** Frontend user interface, 3D WebGL/WebXR scene rendering, and WebSocket client communication.
- **Python:** Multi-agent pipeline, DLS inverse kinematics, PyBullet physics integration, and SHA-256 ledger security.
- **Kotlin:** Native Android ARCore camera passthrough and hardware-accelerated AR rendering.

### Web & Spatial Technologies
- **WebXR Device API:** Standardized interface for head-mounted displays and hand tracking.
- **Three.js & WebGL:** GPU-accelerated 3D rendering of the UR5 arm and virtual twin environment.
- **React 18 & Vite:** Modular component UI state management and build tooling.

### Robotics & Mathematics
- **Damped Least Squares (DLS) Inverse Kinematics:** Computes joint rates avoiding singularity regions via $J^* = J^T (J J^T + \lambda^2 I)^{-1}$.
- **Denavit-Hartenberg (D-H) Analytical Modeling:** Exact geometric representation of the UR5 6-DOF industrial manipulator.
- **Collision Checking:** Analytic swept-sphere/cylinder bounding volumes + PyBullet collision world checking.

---

## Methodology
1. Literature survey
2. Problem identification
3. Requirement analysis
4. System design
5. Hardware/software development
6. Integration
7. Testing and validation
8. Documentation and publication

---

## Project Timeline
| Week / Month | Task Planned | Status |
| :---: | :--- | :---: |
| Week 1 (12–16 Aug 2026) | Problem finalization, repository establishment, and baseline documentation | Completed |
| Week 2 (17–23 Aug 2026) | Literature survey, backend schema design, and multi-agent state definitions | Completed |
| Week 3 (24–30 Aug 2026) | Inverse kinematics engine, DLS algorithm, and procedural Three.js digital twin | Completed |
| Week 4 (31 Aug–06 Sep 2026) | Custom 5-DOF mechanical fabrication and native Kotlin ARCore application | Completed |
| Week 5 (07–13 Sep 2026) | MicroPython serial bridge on RP2040 and full-duplex WebSocket streaming | Completed |
| Week 6 (14–20 Sep 2026) | LangGraph nine-node multi-agent integration and SHA-256 audit ledger | Completed |
| *21 Sep–03 Oct 2026* | *Mid-Term Capstone Evaluation, Committee Presentation, and Milestone Review* | Completed |
| Week 7 (04–10 Oct 2026) | PyBullet physical collision verification and contingency recovery routines | Completed |
| Week 8 (11–17 Oct 2026) | Cross-platform build packaging (Electron Desktop, Quest VR APK, ARCore APK) | Completed |
| Week 9 (18–24 Oct 2026) | Automated benchmark harness execution across 5 standardized robot tasks | Completed |
| Week 10 (25–31 Oct 2026) | End-to-end integration testing, latency profiling, and unit test verification | Completed |
| Week 11–12 (01–04 Nov 2026) | Comprehensive documentation, capstone final report, and paper writing | In progress |

---

## Weekly Progress Updates
| Week | Date | Work Completed | Work Planned for Next Week | Issues / Challenges | GitHub Commit Link |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **Week 1** | 12–16 Aug 2026 | Established and organized the COGNIFORGE GitHub repository. Revised the README with problem statement, objectives, scope, proposed system, and project timeline. Added application baseline and uploaded VR build. | Continue organizing backend and add remaining backend components and supporting project files. | Initial organization of existing project work into the required GitHub structure and documentation. | [Commit 1](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main), [Commit 2](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 2** | 17–23 Aug 2026 | Added additional backend components, including initialization and schema files. Organized documentation for the Multi-Agent, Digital Twin, and Robotics components. | Continue development and documentation of the multi-agent and robotics components. | Maintaining a structured repository while integrating different backend and robotics-related components. | [Commit 1](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main), [Commit 2](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 3** | 24–30 Aug 2026 | Continued development of multi-agent, digital-twin, and robotics components. Implemented DLS Inverse Kinematics solver and procedural UR5 Three.js scene. | Begin physical robot assembly and integrate hardware with the project system. | Kinematic singularities near manipulator workspace boundaries. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 4** | 31 Aug–06 Sep 2026 | Assembled 3D-printed body of the custom 5-DOF robotic manipulator and joined mechanical components. Added AR/VR research literature and built native Kotlin ARCore application. | Continue hardware integration and implement MicroPython serial communication on Raspberry Pi Pico. | Mechanical joint tolerances and visual drift during ARCore plane tracking. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 5** | 07–13 Sep 2026 | Continued work on the physical robotic manipulator, component assembly, and hardware connection attempts. Developed `pico_bridge.py` and tested direct 5V laptop power rail interfacing. | Build LangGraph multi-agent orchestration graph and cryptographic audit ledger. | Packet jitter and USB serial synchronization during continuous multi-servo writes. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 6** | 14–20 Sep 2026 | Integrated frontend application under software section, including Three.js robot scenes, WebSocket communication, and VR/AR modules. Cleaned up unnecessary repository files. | Prepare system architecture, slides, and demonstration for mid-term capstone review. | Managing large application file sizes and maintaining required GitHub directory hierarchy. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Review Gap** | 21 Sep–03 Oct 2026 | Prepared comprehensive project documentation, architecture flowcharts, and system demonstrations for the internal faculty review committee. Conducted Mid-Term Capstone Review. | Implement committee feedback, expand collision avoidance, and formalize multi-agent error recovery. | Addressing committee questions regarding agent explainability and non-repudiation. | Review Presentation |
| **Week 7** | 04–10 Oct 2026 | Integrated PyBullet collision simulation engine with analytic swept-sphere checking. Implemented contingency detour path generation inside the Error Correction Agent. | Package and build standalone debug binaries across all three target platforms. | Synchronizing PyBullet collision physics steps with high-frequency WebSocket teleoperation loops. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 8** | 11–17 Oct 2026 | Successfully compiled and packaged debug binaries for Desktop (macOS/Electron DMG), VR (Meta Quest standalone APK), and Android AR (ARCore native APK)[cite: 1]. | Construct automated benchmark evaluation harness to test multi-agent reasoning. | Handling large build binary sizes on GitHub and configuring Git buffer thresholds. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 9** | 18–24 Oct 2026 | Developed and executed automated benchmark harness (`run_benchmark.py`) evaluating 5 autonomous robotic tasks (Pick & Place, Insertion, Stacking, Clearance, Path Tracking). | Complete comprehensive test suite for kinematics, audit chain, and WebSocket handlers. | Validating trajectory convergence thresholds under dynamic obstacle placements. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 10** | 25–31 Oct 2026 | Completed 23 unit and integration tests using pytest covering forward/inverse kinematics, cryptographic SHA-256 audit ledger, and full LangGraph execution. | Finalize project logbook, clean repository structure, and expand paper draft. | Ensuring cryptographic tamper detection operates reliably across concurrent agent writes. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |
| **Week 11** | 01–04 Nov 2026 | Synchronized official GitHub repository with upstream fork, uploaded member research summaries (`Summary Sana.md`, `Summary Shraddha.md`), and updated project README. | Continue drafting academic research paper and prepare final presentation deck. | Managing multi-contributor Git synchronization and NTFS trailing space file issues on Windows. | [Commit](https://github.com/anamikaahuja/BE_Project_2026_2027_COGNIFORGE/commits/main) |

---

## Design Files
| File Type | File Name / Link | Description |
| :--- | :--- | :--- |
| **CAD Model** | `software/frontend/public/models/ARM_glb/` | Complete 3D CAD mesh parts (Part 1 to Part 11) for robot arm visualization |
| **CAD Model** | `software/frontend/public/models/ur5/` | True-scale Universal Robots UR5 link collada meshes (.dae) |
| **Circuit Diagram** | `images/circuit_diagram.png` | Interfacing schematic for Raspberry Pi Pico, PCA9685 servo driver, and host 5V laptop power rail |
| **Flowchart** | `images/system_architecture.png` | Comprehensive 9-agent LangGraph execution and state transition flowchart |

---

## Circuit Diagram
![Circuit Diagram](images/circuit_diagram.png)
*(Raspberry Pi Pico RP2040 UART/I2C connections to PCA9685 16-channel servo driver powered directly via the host laptop 5V USB bus).*

---

## Flowchart / Algorithm
![Flowchart](images/system_architecture.png)

### Algorithm: Damped Least Squares Motion Execution with Audit Chain
1. **Initialize:** Initialize FastAPI server, load DH parameters, connect WebXR client via WebSocket.
2. **Pose Ingestion:** Capture operator hand pose $\mathbf{x}_{\text{target}} \in \mathbb{R}^3 \times SO(3)$.
3. **Safety Verification:** Verify target pose lies inside the dextrous reachable workspace ($r \le 0.85\text{ m}$).
4. **Solve Inverse Kinematics:** 
   $$\Delta \boldsymbol{\theta} = J^T (J J^T + \lambda^2 I)^{-1} \mathbf{e}$$
   Compute incremental joint steps until $\|\mathbf{e}\| < \epsilon$ or maximum iterations reached.
5. **Collision Checking:** Evaluate swept cylinders across all links against environment bounding boxes.
6. **Contingency Handling:** If collision detected, invoke Error Correction Agent to compute detour waypoints.
7. **Ledger Commit:** Calculate block hash:
   $$H_i = \text{SHA-256}(H_{i-1} \,\|\, \text{Timestamp} \,\|\, \boldsymbol{\theta} \,\|\, \text{AgentID} \,\|\, \text{Decision})$$
8. **Actuation:** Stream verified joint vector $\boldsymbol{\theta}$ to WebXR twin and physical robot.
9. **Loop / Stop:** Await next demonstration frame or terminate on operator release.

---

## Implementation Details

### Hardware Implementation
- **Manipulator Rig:** 3D-printed 5-DOF articulating arm consisting of base pan, shoulder pitch, elbow pitch, wrist pitch, and end-effector gripper.
- **Actuation & Power:** Servos driven via PWM signals from a PCA9685 driver modulated by a Raspberry Pi Pico (RP2040) running custom MicroPython serial firmware (`hardware/pico_arm/main.py`). The entire logic and servo rail are powered directly via the host laptop's 5V DC USB power interface.

### Software Implementation
- **Multi-Agent Engine (`backend/app/agents/graph.py`):** Structured as a LangGraph state machine maintaining dynamic agent state, reactive safety thresholds, and replanning triggers.
- **Inverse Kinematics (`backend/app/robotics/kinematics.py`):** True-scale UR5 kinematic chain configured with standard Denavit-Hartenberg parameters:
  - $d = [0.089159, 0, 0, 0.10915, 0.09465, 0.0823]$
  - $a = [0, -0.425, -0.39225, 0, 0, 0]$
  - $\alpha = [\pi/2, 0, 0, \pi/2, -\pi/2, 0]$
- **Audit Ledger (`backend/app/core/audit.py`):** Append-only cryptographic log recording every perception input, planned trajectory, and safety override with SHA-256 hash validation.
- **WebXR Frontend (`frontend/src/`):** React 18 application built with Vite and Three.js, supporting HTTPS WebXR session initiation, procedural twin rendering (`RealRobot.ts`), and spatial UI interactions.

---

## Code Structure
