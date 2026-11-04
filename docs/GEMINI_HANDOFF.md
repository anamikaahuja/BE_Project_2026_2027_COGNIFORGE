# COGNIFORGE — Gemini Handoff Document

Hello Gemini! If you are reading this, you are assisting with the development of the **COGNIFORGE** project. Below is a comprehensive overview of the system architecture, its capabilities, the current directory structure, and prompts to guide further improvements.

## 1. Project Overview
COGNIFORGE is a high-fidelity, 6-DOF (Degree of Freedom) industrial robotic arm visualization platform. It features manual jog controls and integrates a multi-agent AI pipeline to facilitate real-time motion planning and robot teleoperation. 

## 2. Tech Stack
- **Frontend**: React, Vite, Three.js (for high-performance 3D rendering and Robot Visualization)
- **Backend**: Python, FastAPI, LangGraph (Multi-agent AI Orchestration)
- **Real-Time Communication**: WebSockets (used for real-time telemetry streaming and control signals)
- **Deployment**: Docker & Docker Compose (Containerized for seamless local execution)

## 3. System Architecture & How it Works
The platform operates on a client-server architecture bound together by WebSocket channels for sub-second latency:
1. **Frontend (Three.js)**: Loads the robotic arm assets in a 3D scene, provides manual UI controls to the user, and reflects live telemetry data seamlessly.
2. **Backend (FastAPI)**: Serves as the robust API gateway and WebSocket server. It maintains the state of the robot and acts as a bridge.
3. **AI Pipeline (LangGraph)**: Powers the multi-agent AI features, processing complex commands into feasible motion planning trajectories which are sent back to the frontend.

## 4. Directory Structure

```text
/Volumes/One Touch/COGNIFORGE/
├── README.md                 # Project documentation and setup guide
├── docker-compose.yml        # Multi-container orchestration (Frontend + Backend)
├── backend/                  # Python FastAPI application
│   ├── Dockerfile            # Container definition for the backend
│   ├── requirements.txt      # Python dependencies
│   └── app/
│       ├── main.py           # FastAPI entrypoint and WebSocket routing
│       ├── agents/           # LangGraph multi-agent configurations
│       ├── core/             # Core application logic and configuration
│       ├── robotics/         # Robotic kinematics and path-planning modules
│       └── shared/           # Shared models and utilities
└── frontend/                 # React/Vite/Three.js web application
    ├── Dockerfile            # Container definition for the frontend
    ├── package.json          # Node dependencies and scripts
    ├── vite.config.ts        # Vite configuration
    ├── index.html            # Entry HTML file
    └── src/
        ├── main.tsx          # React application root
        ├── scene/            # Three.js 3D scene logic and robotic models
        ├── socket/           # WebSocket client and state management
        └── xr/               # XR/VR specific implementations (if any)
```

## 5. Local Setup Context
The project can be run natively or via Docker:
- `docker-compose up --build` brings up both services instantly.
- The frontend exposes on `http://localhost:3000`.
- The backend exposes on `http://localhost:8000`.
- AI features require an `.env` file containing `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` within the backend directory.

## 6. Prompts for Further Improvement
As Gemini, you can take the lead in developing new capabilities. Use the following prompts to kickstart your work:

### Inverse Kinematics & Robotics
* "Review the `/backend/app/robotics/` module. How can we implement a more robust Inverse Kinematics (IK) solver for the 6-DOF robotic arm to handle singularity avoidance better?"
* "Currently, we rely on WebSockets for manual jogging. Write an optimization plan to handle packet drop and jitter without lagging the Three.js frontend."

### Multi-Agent AI (LangGraph)
* "Analyze the `/backend/app/agents/` setup. I want to add a 'Safety Agent' that intercepts trajectories proposed by the 'Planning Agent' to ensure the robot doesn't collide with the virtual floor. Write the code for this new LangGraph node."
* "Create a new FastAPI endpoint that accepts natural language commands (e.g., 'Move the arm to pick up the red box') and streams the calculated trajectory steps back to the frontend via our WebSocket connection."

### 3D Visualization (Three.js)
* "Looking at the `/frontend/src/scene/` components, propose a way to add dynamic shadowing and bloom effects using `@react-three/postprocessing` to make the metallic industrial arm look photorealistic."
* "We need visual feedback when the arm reaches a joint limit. Add a visual highlight or warning UI overlay in the React frontend whenever the backend telemetry reports a joint is maxed out."
