# BE Capstone Project

# COGNIFORGE: A Verified Multi-Agent Architecture for Contingency-Aware, Audit-Traceable Robot Teleoperation in WebXR

---

## Team Details

| Sr. No. | Name of Student | Roll No. | Branch | Email ID |
| :-----: | --------------- | :------: | :----: | -------- |
| 1 | ANAMIKA AHUJA | 01 | AURO | 2023.anamika.ahuja@ves.ac.in |
| 2 | ADITYA SHARMA | 27 | AURO | d2024.aditya.sharma@ves.ac.in |
| 3 | SHRADDHA VAYACHAL | 30 | AURO | d2024.shraddha.vayachal@ves.ac.in |
| 4 | SANA SHAIKH | 62 | AURO | d2024.sana.shaikh@ves.ac.in |

---

## Guide Details

**Project Guide:** Mrs. Ramya T

**Department:** Automation and Robotics

**Institute:** Vivekanand Education Society's Institute of Technology (VESIT), Mumbai

---

## Problem Statement

The aim of this project is to develop a browser-based **WebXR robot teleoperation platform** using a **verified nine-node cooperative multi-agent architecture** to enable intuitive robot programming by demonstration. The proposed system integrates perception, reasoning, contingency-aware motion planning, Damped Least Squares (DLS) inverse kinematics, and a hash-chained audit framework to ensure safe, transparent, and audit-traceable robot operation across **Web, Desktop, Virtual Reality (VR), and Mobile Augmented Reality (AR)** platforms.

---

## Abstract

Industrial robot programming traditionally relies on vendor-specific programming languages, teach pendants, and manual configuration, making it complex, time-consuming, and inaccessible to non-expert users. Existing approaches also provide limited transparency into robot decision-making, making verification and auditing difficult.

**COGNIFORGE** addresses these challenges by developing a browser-based robot teleoperation platform that enables intuitive robot programming through natural hand demonstrations in an immersive WebXR environment.

The proposed system employs a **verified nine-node cooperative multi-agent architecture** integrating:

- Perception
- Visual Reasoning
- Intent Prediction
- Reactive Safety
- Belief–Desire–Intention (BDI) Planning
- Contingency-Aware Motion Planning
- Damped Least Squares Inverse Kinematics
- Error Correction
- Hash-Chained Audit Ledger

These components ensure safe, transparent, and verifiable robot operation.

The platform is designed for deployment across **Web, Desktop, Virtual Reality (VR), and Mobile Augmented Reality (AR)** environments, providing a flexible and cross-platform solution for robot teleoperation.

Although physical robot integration is planned for future work using **ROS 2** and **MoveIt 2**, the current implementation has been validated through comprehensive software verification and cross-platform testing.

The expected outcome is a secure, intelligent, and audit-traceable robot teleoperation framework that simplifies robot programming while enhancing safety, reliability, and transparency.

Potential applications include:

- Industrial Automation
- Smart Manufacturing
- Collaborative Robotics
- Research Laboratories
- Training & Education
- Remote Robot Operation

---

## Objectives

1. Study the limitations of existing industrial robot programming methods and analyze current WebXR and robot teleoperation technologies.
2. Design a browser-based WebXR robot teleoperation platform using a verified nine-node cooperative multi-agent architecture.
3. Implement intelligent perception, planning, inverse kinematics, contingency-aware motion planning, and audit-traceable decision logging.
4. Integrate and validate the proposed framework with a physical robotic manipulator using ROS 2 and MoveIt 2.
5. Evaluate the system through software verification, cross-platform deployment, and performance analysis.
6. Prepare comprehensive documentation and publish the research findings.

---

## Scope of the Project

The project includes:

- Design and development of a browser-based WebXR robot teleoperation platform.
- Implementation of a verified nine-node cooperative multi-agent architecture.
- Development of cross-platform applications for Web, Desktop, VR, and Mobile AR.
- Integration of Programming by Demonstration (PbD).
- Damped Least Squares inverse kinematics.
- Contingency-aware motion planning.
- Collision checking.
- Audit-traceable decision logging.
- Software verification and performance evaluation.
- Future integration with physical industrial robots using ROS 2 and MoveIt 2.

---

## Existing System

Existing industrial robot programming primarily relies on:

- Vendor-specific programming languages
- Teach pendants
- Kinesthetic teaching
- Conventional joysticks
- GUI-based robot control
- Standalone VR applications

While these approaches enable robot control, they often require specialized training and provide limited flexibility for intuitive human–robot interaction.

### Limitations

- Requires vendor-specific programming knowledge.
- Time-consuming manual robot programming.
- Difficult for non-expert users.
- Limited transparency and auditability.
- Poor adaptability to dynamic environments.
- Limited cross-platform support.
- Minimal intelligent decision-making.
- Limited contingency-aware planning.
- Difficult verification of robot actions.

---

## Proposed System

### Main Idea

Develop a browser-based WebXR robot teleoperation platform that enables intuitive robot programming through natural hand demonstrations using a verified nine-node cooperative multi-agent architecture.

### How It Works

1. Captures operator hand movements using WebXR.
2. Processes user inputs through intelligent software agents.
3. Performs perception and visual reasoning.
4. Predicts operator intent.
5. Executes contingency-aware motion planning.
6. Solves inverse kinematics using Damped Least Squares.
7. Performs collision checking.
8. Stores every decision inside a hash-chained audit ledger.
9. Supports future execution on physical robots through ROS 2 and MoveIt 2.

### Major Components

- WebXR User Interface
- Nine-Node Cooperative Multi-Agent Architecture
- Perception Module
- Visual Reasoning Module
- Intent Prediction Module
- Reactive Safety Module
- BDI Planning Module
- Motion Planning Module
- Error Correction Module
- Hash-Chained Audit Ledger
- Cross-Platform Deployment
- ROS 2 & MoveIt 2 Integration (Future Scope)

### Expected Benefits

- Simplifies robot programming.
- Improves operational safety.
- Enables transparent robot decision-making.
- Provides complete audit traceability.
- Supports Web, Desktop, VR, and AR.
- Creates a scalable framework for industrial deployment.

---

## System Architecture

![System Architecture](images/system_arch.png)

The proposed system follows a **browser-based WebXR architecture** built around a **verified nine-node cooperative multi-agent framework**. The operator interacts with the system through a WebXR interface, where natural hand movements are captured and interpreted as robot commands. These inputs are processed sequentially by the **Gateway Agent**, **Perception Agent**, **Visual Reasoning Agent**, and **Intent Prediction Agent** to understand the user's actions. The **Reactive Safety Agent** continuously checks for unsafe conditions, while the **Belief–Desire–Intention (BDI) Planning Agent** and **Motion Planning Agent** generate safe and efficient robot trajectories. The **Error Correction Agent** resolves execution issues, and the **Meta-Agent** monitors the overall system to coordinate communication between agents. All decisions and actions are securely recorded in a **hash-chained audit ledger**, ensuring transparency and traceability. The generated motion commands are validated using **Damped Least Squares inverse kinematics** and are designed for future execution on a physical robot through **ROS2 and MoveIt2**. The architecture supports deployment across **Web, Desktop, Virtual Reality (VR), and Mobile Augmented Reality (AR)** platforms, providing a scalable and cross-platform robot teleoperation solution. 

---
## Hardware Requirements

| Sr. No. | Component | Specification | Quantity | Purpose |
| :-----: | --------- | ------------- | :------: | ------- |
| 1 | Laptop / Desktop | Intel Core i5/Ryzen 5 or higher, 16 GB RAM, SSD | 1 | Development and Testing |
| 2 | Webcam / RGB Camera | HD (720p or higher) | 1 | Hand Tracking and User Input |
| 3 |  Mobile Phone Camera | Android Smartphone with HD Camera and WebXR-Compatible Browser | 1 | Hand Gesture Capture and User Input |
| 4 | VR Headset | Meta Quest 2 | 1 | Virtual Reality Testing |
| 5 | Industrial Robot  | ROS 2 Compatible Robotic Manipulator | 1 | Physical Robot Integration |

---

## Software Requirements

| Sr. No. | Software / Tool | Version | Purpose |
| :-----: | --------------- | :-----: | ------- |
| 1 | Visual Studio Code | Latest | Source Code Development |
| 2 | Node.js | v20+ | Backend Runtime and Package Management |
| 3 | Git & GitHub | Latest | Version Control and Collaboration |
| 4 | ROS 2 | Humble / Jazzy | Robot Communication |
| 5 | MoveIt 2  | Latest | Motion Planning |
| 6 | Google Chrome / Microsoft Edge | Latest | WebXR Application Testing |

---

## Technologies Used

### Programming Languages

- **TypeScript** – Used to develop the frontend application with type safety and improved maintainability.
- **JavaScript** – Used for implementing interactive web functionalities and client-side logic.
- **Python** – Used for AI algorithms, backend processing, and robot control logic.

### Web Technologies

- **WebXR API** – Enables immersive Virtual Reality (VR) and Augmented Reality (AR) experiences within the browser.
- **WebGL** – Renders interactive 3D graphics for robot visualization.
- **HTML5** – Provides the structural framework of the web application.
- **CSS3** – Used for responsive styling and user interface design.
- **Three.js** – Simplifies the creation and rendering of 3D scenes in WebXR.
- **React.js** – Builds a dynamic, component-based user interface.

### Artificial Intelligence

- **Multi-Agent Systems** – Coordinates multiple intelligent agents for distributed decision-making.
- **Belief–Desire–Intention (BDI) Planning** – Models intelligent agent reasoning and task planning.
- **Intent Prediction** – Interprets user actions to determine intended robot operations.
- **Visual Reasoning** – Analyzes visual information to support intelligent robot decisions.

### Robotics

- **Programming by Demonstration (PbD)** – Enables robots to learn tasks through user demonstrations.
- **Damped Least Squares (DLS) Inverse Kinematics** – Computes stable joint movements while avoiding singularities.
- **Motion Planning** – Generates safe and collision-free robot trajectories.
- **Collision Checking** – Detects and prevents potential collisions during robot motion.
- **ROS 2** – Provides the communication framework for robot integration and control.
- **MoveIt 2** – Performs robot motion planning, kinematics, and execution.

### Development Tools

- **Visual Studio Code** – Primary Integrated Development Environment (IDE) for coding and debugging.
- **Git** – Tracks source code changes and enables version control.
- **GitHub** – Hosts the project repository and supports team collaboration.
- **npm** – Manages JavaScript packages and project dependencies.
- **Vite** – Provides fast development and optimized frontend builds.

### Deployment Platforms

- **Web Browser** – Allows platform-independent access to the application.
- **Desktop Application** – Supports execution on Windows, macOS, and Linux systems.
- **Virtual Reality (VR)** – Enables immersive robot teleoperation using VR headsets.
- **Mobile Augmented Reality (AR)** – Provides portable AR-based interaction through smartphones.

### Security & Verification

- **Hash-Chained Audit Logging** – Maintains tamper-evident records of all robot actions and decisions.
- **Software Verification** – Validates the correctness and reliability of the implemented system.
- **Cross-Platform Testing** – Ensures consistent performance across supported devices and operating systems.

## Methodology

Explain the step-by-step approach.

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

| Week / Month | Task Planned          | Status                            |
| ------------ | --------------------- | --------------------------------- |
| Week 1       | Problem finalization  |             Completed 
| Week 2       | Literature survey     |             Completed                      |
| Week 3       | Requirement analysis  |             Completed                      |
| Week 4       | System design         |             Completed                      |
| Week 5       | Prototype development |              In progress                     |
| Week 6       | Testing               |                                   |
| Week 7       | Documentation         |                                   |
| Week 8       | Paper writing         |                                   |

---

## Weekly Progress Updates

Students must update this section every week.

| Week   | Date | Work Completed | Work Planned for Next Week | Issues / Challenges | GitHub Commit Link |
| ------ | ---- | -------------- | -------------------------- | ------------------- | ------------------ |
| Week 1 |      |                |                            |                     |                    |
| Week 2 |      |                |                            |                     |                    |
| Week 3 |      |                |                            |                     |                    |
| Week 4 |      |                |                            |                     |                    |
| Week 5 |      |                |                            |                     |                    |
| Week 6 |      |                |                            |                     |                    |
| Week 7 |      |                |                            |                     |                    |
| Week 8 |      |                |                            |                     |                    |

---

## Design Files

Upload and link all design files here.

| File Type       | File Name / Link | Description |
| --------------- | ---------------- | ----------- |
| CAD Model       |                  |             |
| Circuit Diagram |                  |             |
| PCB Design      |                  |             |
| Flowchart       |                  |             |
| Simulation File |                  |             |

---

## Circuit Diagram

Add circuit diagram image here.

```markdown
![Circuit Diagram](images/circuit_diagram.png)
```

---

## Flowchart / Algorithm

Add flowchart image here.

```markdown
![Flowchart](images/flowchart.png)
```

### Algorithm

1. Start
2. Initialize the system
3. Read input from sensors/user
4. Process the data
5. Generate output/control action
6. Display/store/transmit result
7. Stop

---

## Implementation Details

Explain the actual implementation of the project.

### Hardware Implementation

Write details about connections, components, power supply, sensors, actuators, PCB, enclosure, etc.

### Software Implementation

Write details about code structure, libraries used, algorithms, communication protocols, database, app, cloud, etc.

---

## Code Structure

```text
BE-Capstone-Project/
│
├── README.md
├── docs/
│   ├── literature_survey.md
│   ├── project_report.pdf
│   └── presentation.pptx
│
├── hardware/
│   ├── circuit_diagram.png
│   ├── pcb_design/
│   └── cad_model/
│
├── software/
│   ├── src/
│   ├── include/
│   └── tests/
│
├── images/
│   ├── system_architecture.png
│   ├── prototype_photo.jpg
│   └── results.png
│
└── references/
    └── papers/
```

---

## How to Run the Project

### Step 1: Clone the Repository

```bash
git clone https://github.com/username/project-name.git
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

or mention specific software/library installation steps.

### Step 3: Upload / Run the Code

```bash
python main.py
```

or

```bash
arduino-cli upload -p COMx --fqbn board_name
```

### Step 4: Observe the Output

Mention the expected output of the project.

---

## Testing and Results

| Test No. | Test Description | Expected Result | Actual Result | Status      |
| -------- | ---------------- | --------------- | ------------- | ----------- |
| 1        |                  |                 |               | Pass / Fail |
| 2        |                  |                 |               | Pass / Fail |
| 3        |                  |                 |               | Pass / Fail |

---

## Result Images / Videos

Add images or videos of the working prototype.

```markdown
![Prototype](images/prototype_photo.jpg)
```

Video Link:

```markdown

```
[https://youtu.be/yBu4Pf4i_TM](https://youtu.be/nwztSd6h4qg)
---

## Applications

Mention real-world applications of the project.

1.
2.
3.
4.

---

## Advantages

1.
2.
3.
4.

---

## Limitations

1.
2.
3.
4.

---

## Future Scope

Mention possible improvements.

1.
2.
3.
4.

---

## Research Paper / Publication

| Item                      | Details                                                   |
| ------------------------- | --------------------------------------------------------- |
| Paper Title               |                                                           |
| Conference / Journal Name |                                                           |
| Paper Status              | Not Started / Drafting / Submitted / Accepted / Published |
| Submission Date           |                                                           |
| Paper Link                |                                                           |

---

## References

Add references in IEEE format.

Example:

```text
[1] A. Author, B. Author, "Title of the Paper," Journal/Conference Name, vol. X, no. Y, pp. xx-yy, Year.
[2] Datasheet / Website / Book reference.
```

---

## Repository Update Guidelines

Each student team must update the GitHub repository regularly.

Minimum expected updates:

* Update README every week.
* Push code changes regularly.
* Upload circuit diagrams, CAD files, PCB files, reports and presentations.
* Add weekly progress in the progress table.
* Maintain proper folder structure.
* Do not upload unnecessary temporary files.
* Each major update should have a meaningful commit message.

Example commit messages:

```text
Added problem statement and objectives
Updated system architecture diagram
Added sensor interfacing code
Updated weekly progress for Week 3
Added testing results and prototype images
```

---

## Declaration

We declare that this project work is carried out by our team as part of the BE Capstone Project. The work will be regularly updated on GitHub and all references used will be properly cited.

---

## License

This project is for academic use only.

Optional:

```text
MIT License / Creative Commons / Institute Use Only
```

```
```
