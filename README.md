# CircuitMind

An AI-powered, browser-based electronics lab where you design circuits visually, simulate real physics in real time, and learn from an AI tutor that reads your actual circuit.

![CircuitMind](https://via.placeholder.com/1200x600/080f1a/38bdf8?text=CircuitMind)

## What it does

You drag and drop components onto a schematic canvas, wire them together, and hit simulate. A custom circuit solver written in Rust and compiled to WebAssembly runs Modified Nodal Analysis on your circuit and returns real voltage and current values. Those values feed into live D3 visualizations: an oscilloscope, a Bode plot, and a phasor diagram. An AI tutor powered by Claude watches your circuit and explains what is happening in plain English. You can also write MicroPython code that controls virtual GPIO pins wired directly into your schematic.

## Tech stack

| Layer | Technology |
|---|---|
| Circuit solver | Rust compiled to WebAssembly |
| Frontend | React + TypeScript |
| State management | Zustand + Immer |
| Visualizations | D3.js |
| 3D electron animation | Three.js / WebGL |
| AI tutor | Claude API (Anthropic) |
| Python runtime | Pyodide (MicroPython in browser) |
| Backend | FastAPI (Python) |
| Build tool | Vite |

## Features

- Drag and drop schematic editor with 10 component types
- Real time circuit simulation using a from-scratch MNA solver in Rust/WASM
- Animated electron flow along wires with speed proportional to current
- Live oscilloscope, Bode plot, and phasor diagram
- AI tutor that receives your actual netlist and simulation data
- MicroPython editor that controls virtual pins on your schematic
- Save and load circuits as JSON
- Keyboard shortcuts for every tool
- Zoom and pan with scroll and alt+drag

## Getting started

### Prerequisites

- Node.js v18+
- Rust + `wasm-pack`
- Python 3.10+

### Install

```bash
# Frontend
cd frontend
npm install
npm run dev

# Rust solver (run once, then on changes)
cd solver
wasm-pack build --target web --out-dir ../frontend/src/wasm

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Environment variables

Create `frontend/.env.local`:

```
ANTHROPIC_API_KEY=your-key-here
```

Get your API key at [console.anthropic.com](https://console.anthropic.com).

## Keyboard shortcuts

| Key | Action |
|---|---|
| S | Select tool |
| W | Wire tool |
| R | Place resistor |
| C | Place capacitor |
| L | Place inductor |
| V | Place voltage source |
| G | Place ground |
| Delete | Delete selected |
| Scroll | Zoom in/out |
| Alt + drag | Pan canvas |
| Escape | Cancel wire |

## Project structure

```
circuitmind/
├── frontend/          # React + TypeScript app
│   └── src/
│       ├── components/
│       │   ├── editor/       # Canvas, Toolbar
│       │   ├── visualizer/   # Oscilloscope, BodePlot, PhasorDiagram
│       │   ├── ai/           # AITutor
│       │   └── python/       # PyodideEditor
│       ├── hooks/            # useSimulator, useAI, usePyodide
│       ├── store/            # Zustand circuit store
│       └── types/            # TypeScript types
├── solver/            # Rust WASM circuit solver
│   └── src/
│       ├── matrix.rs         # Gaussian elimination
│       ├── components.rs     # MNA stamp functions
│       ├── mna.rs            # Modified Nodal Analysis
│       └── lib.rs            # WASM bindings
└── backend/           # FastAPI Python backend
    ├── main.py
    └── routes/
        ├── ai.py             # Claude streaming endpoint
        └── circuits.py       # Save/load circuits
```
## License

MIT