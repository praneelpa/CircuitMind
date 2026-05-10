// src/store/circuitStore.ts
import {create} from "zustand";
import {immer} from "zustand/middleware/immer";
import { enableMapSet } from "immer";
enableMapSet();
import {
    Circuit,
    CircuitComponent,
    ComponentType,
    Wire,
    Point,
    SimulationResult,
    COMPONENT_PINS,
    COMPONENT_DEFAULTS,
    GRID_SIZE,
} from "../types/circuit";

// establishing helpers here
let _compCounter: Record<string, number> = {};
function nextLabel(type: ComponentType): string {
    const base = COMPONENT_DEFAULTS[type].label || type[0].toUpperCase();
    _compCounter[base] = (_compCounter[base] ?? 0) + 1;
    return `${base}${_compCounter[base]}`;
}
function uid(): string {
    return Math.random().toString(36).slice(2, 9);
}
export function snapToGrid(val: number): number {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

const MAX_HISTORY = 50;

// state shape
interface SelectionBox {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}
interface CircuitState {
    circuit: Circuit;
    selectedIds: Set<string>;
    wireInProgress: Point[] | null; // points being drawn for the active wire
    hoveredPin: string | null; // like circuit.ts, this will be "componentId:pinId"
    zoom: number;
    pan: Point;
    isDragging: boolean;
    simulationResult: SimulationResult | null;
    history: Circuit[];
    historyIndex: number;
    clipboard: {
        components: Record<string, CircuitComponent>;
        wires: Record<string, Wire>;
    } | null;
    selectionBox: SelectionBox | null;
    isSimulating: boolean;
    simSpeed: number;
    currentSpeed: number;
    hoveredComponentId: string | null;
}

interface CircuitActions {
    // component operations
    addComponent: (type: ComponentType, position: Point) => string;
    moveComponent: (id: string, delta: Point) => void;
    moveSelected: (delta: Point) => void;
    rotateComponent: (id: string) => void;
    rotateSelected: () => void;
    flipComponent: (id:string) => void;
    deleteComponent: (id: string) => void;
    updateComponentValue: (id: string, value: string) => void;
    updateComponentLabel: (id: string, label: string) => void;

    // wires
    startWire: (point: Point) => void;
    extendWire: (point: Point) => void;
    finishWire: () => void;
    cancelWire: () => void;
    deleteWire: (id: string) => void;

    // selection
    selectComponent: (id: string, multi?: boolean) => void;
    selectWire: (id: string, multi?: boolean) => void;
    selectAll: () => void;
    clearSelection: () => void;
    deleteSelected: () => void;

    // window select
    startSelectionBox: (point: Point) => void;
    updateSelectionBox: (point: Point) => void;
    finishSelectionBox: () => void;
    cancelSelectionBox: () => void;

    // copy paste duplicate and cut
    copy: () => void;
    paste: () => void;
    duplicate: () => void;
    cut: () => void;

    // undo redo
    undo: () => void;
    redo: () => void;
    pushHistory: () => void;

    // viewport
    setZoom: (zoom: number) => void;
    setPan: (pan: Point) => void;
    setHoveredPin: (pinKey: string | null) => void;
    setHoveredComponent: (id: string | null) => void;
    // sim
    setSimulating: (v:boolean) => void;
    setSimSpeed: (v:number) => void;
    setCurrentSpeed: (v: number) => void;
    setSimulationResult: (result: SimulationResult | null) => void;
    // circuit meta
    clearCircuit: () => void;
    loadCircuit: (circuit: Circuit) => void;
}

// initial conditions or state
const emptyCircuit = (): Circuit => ({
    id: uid(),
    name: "Untitled circuit",
    components: {},
    wires: {},
    nets: {},
    simulationResult: null,
});
function cloneCircuit(c:Circuit): Circuit {
    return JSON.parse(JSON.stringify(c));
}
// store
export const useCircuitStore = create<CircuitState & CircuitActions>()(
    immer((set,get) => ({
        circuit: emptyCircuit(),
        selectedIds: new Set(),
        wireInProgress: null,
        hoveredPin: null,
        zoom: 1,
        pan: {x: 0, y: 0},
        isDragging: false,
        simulationResult: null,
        history: [],
        historyIndex: -1,
        clipboard: null,
        selectionBox: null,
        isSimulating: false,
        simSpeed: 5,
        currentSpeed: 5,
        hoveredComponentId: null,

        // undo redo
        pushHistory() {
            const {circuit, history, historyIndex} = get();
            const snapshot = cloneCircuit(circuit);
            const newHistory = history.slice(0, historyIndex + 1);
            newHistory.push(snapshot);
            if(newHistory.length > MAX_HISTORY) newHistory.shift();
            set((state) => {
                state.history = newHistory;
                state.historyIndex = newHistory.length - 1;
            });
        },

        undo() {
            const {history, historyIndex} = get();
            if(historyIndex <= 0) return;
            const prev = history[historyIndex-1];
            set((state) => {
                state.circuit = cloneCircuit(prev);
                state.historyIndex = historyIndex-1;
                state.selectedIds.clear();
            });
        },

        redo() {
            const {history, historyIndex} = get();
            if (historyIndex >= history.length-1) return;
            const next = history[historyIndex + 1];
            set((state) => {
                state.circuit = cloneCircuit(next);
                state.historyIndex = historyIndex + 1;
                state.selectedIds.clear();
            });
        },

        addComponent(type, position) {
            get().pushHistory();
            const id = uid();
            const defaults = COMPONENT_DEFAULTS[type];
            const label = nextLabel(type);
            const snapped: Point = {
                x: snapToGrid(position.x),
                y: snapToGrid(position.y),
            };
            const component: CircuitComponent = {
                id,
                type,
                position: snapped,
                rotation: 0,
                label,
                value: defaults.value,
                unit: defaults.unit,
                pins: COMPONENT_PINS[type].map((p) => ({...p})),
                selected: false,
            };
            set((state) => {
                state.circuit.components[id] = component;
            });
            return id;
        },
        moveComponent(id, delta) {
            set((state) => {
                const c = state.circuit.components[id];
                if (!c) return;
                c.position.x = snapToGrid(c.position.x + delta.x);
                c.position.y = snapToGrid(c.position.y + delta.y);
            });
        },
        moveSelected(delta) {
            set((state) => {
                state.selectedIds.forEach((id) => {
                    const c = state.circuit.components[id];
                    if (c) {
                        c.position.x = snapToGrid(c.position.x + delta.x);
                        c.position.y = snapToGrid(c.position.y + delta.y);
                    }
                });
            });
        },
        rotateComponent(id) {
            set((state) => {
                const c = state.circuit.components[id];
                if (!c) return;
                c.rotation = (c.rotation + 90) % 360;
            });
        },
        rotateSelected() {
            get().pushHistory();
            set((state) => {
                state.selectedIds.forEach((id) => {
                    const c = state.circuit.components[id];
                    if (c) c.rotation = (c.rotation + 90) % 360;
                });
            });
        },
        flipComponent(id) {
            get().pushHistory();
            set((state) => {
                const c = state.circuit.components[id];
                if (!c) return;
                c.rotation = (c.rotation + 180) % 360;
            });
        },
        deleteComponent(id) {
            get().pushHistory();
            set((state) => {
                delete state.circuit.components[id];
                state.selectedIds.delete(id);
            });
        },
        updateComponentValue(id, value) {
            get().pushHistory();
            set((state) => {
                const c = state.circuit.components[id];
                if (c) c.value = value;
            });
        },
        updateComponentLabel(id, label) {
            set((state) => {
                const c = state.circuit.components[id];
                if (c) c.label = label;
            });
        },
        // wires
        startWire(point) {
            const snapped: Point = {x: snapToGrid(point.x), y: snapToGrid(point.y) };
            set((state) => {
                state.wireInProgress = [snapped, { ...snapped }];
            });
        },
        extendWire(point) {
            const snapped: Point = {x: snapToGrid(point.x), y: snapToGrid(point.y)};
            set((state) => {
                if (!state.wireInProgress) return;
                const pts = state.wireInProgress;
                // orthogonal routing
                const start = pts[0];
                const dx = Math.abs(snapped.x - start.x);
                const dy = Math.abs(snapped.y - start.y);
                if (dx >= dy) {
                    pts[pts.length - 1] = {x: snapped.x, y: start.y};
                } else {
                    pts[pts.length - 1] = {x: start.x, y: snapped.y};
                }
            });
        },
        finishWire() {
            get().pushHistory();
            const {wireInProgress} = get();
            if (!wireInProgress || wireInProgress.length < 2) {
                set((state) => {state.wireInProgress = null;});
                return;
            }
            const start = wireInProgress[0];
            const end = wireInProgress[wireInProgress.length - 1];
            if (start.x === end.x &&  start.y === end.y) {
                set((state) => {state.wireInProgress = null;});
                return;
            }
            const id = uid();
            const wire: Wire = {
                id, 
                points: [...wireInProgress],
                selected: false,
            };
            set((state) => {
                state.circuit.wires[id] = wire;
                state.wireInProgress = null;
            });
        },
        cancelWire() {
            set((state) => { state.wireInProgress = null; });
        },
        deleteWire(id) {
            get().pushHistory();
            set((state) => {
                delete state.circuit.wires[id];
                state.selectedIds.delete(id);
            });
        },
        // selection
        selectComponent(id, multi = false) {
            set((state) => {
                if (!multi) {
                    Object.values(state.circuit.components).forEach(
                        (c) => (c.selected = false)
                    );
                    Object.values(state.circuit.wires).forEach(
                        (w) => (w.selected = false)
                    );
                    state.selectedIds.clear();
                }
                const c = state.circuit.components[id];
                if (c) {
                    c.selected = true;
                    state.selectedIds.add(id);
                }
            });
        },
        selectWire(id, multi = false) {
            set((state) => {
                if (!multi) {
                    Object.values(state.circuit.components).forEach(
                        (c) => (c.selected = false)
                    );
                    Object.values(state.circuit.wires).forEach(
                        (w) => (w.selected = false)
                    );
                    state.selectedIds.clear();
                }
                const w = state.circuit.wires[id];
                if (w) {
                    w.selected = true;
                    state.selectedIds.add(id);
                }
            });
        },
        selectAll() {
            set((state) => {
                Object.values(state.circuit.components).forEach((c)=> {
                    c.selected = true;
                    state.selectedIds.add(c.id);
                });
                Object.values(state.circuit.wires).forEach((w) => {
                    w.selected = true;
                    state.selectedIds.add(w.id);
                });
            });
        },
        clearSelection() {
            set((state) => {
                Object.values(state.circuit.components).forEach(
                    (c) => (c.selected = false)
                );
                Object.values(state.circuit.wires).forEach((w) => (w.selected = false));
                state.selectedIds.clear();
            });
        },
        deleteSelected() {
            if (get().selectedIds.size===0) return;
            get().pushHistory();
            set((state) => {
                state.selectedIds.forEach((id) => {
                    delete state.circuit.components[id];
                    delete state.circuit.wires[id];
                });
                state.selectedIds.clear();
            });
        },
        startSelectionBox(point) {
            set((state) => {
                state.selectionBox = {
                    startX: point.x,
                    startY: point.y,
                    endX: point.x,
                    endY: point.y,
                };
            });
        },
        updateSelectionBox(point) {
            set((state) => {
                if (!state.selectionBox) return;
                state.selectionBox.endX = point.x;
                state.selectionBox.endY = point.y;
            });
        },
        finishSelectionBox() {
            const {selectionBox, circuit} = get()
            if (!selectionBox) return;
            const minX = Math.min(selectionBox.startX, selectionBox.endX);
            const maxX = Math.max(selectionBox.startX, selectionBox.endX);
            const minY = Math.min(selectionBox.startY, selectionBox.endY);
            const maxY = Math.max(selectionBox.startY, selectionBox.endY);
            set((state) => {
                state.selectedIds.clear();
                Object.values(state.circuit.components).forEach((c) => (c.selected = false));
                Object.values(state.circuit.wires).forEach((w) => (w.selected = false));
                Object.values(circuit.components).forEach((c)=> {
                    if (
                        c.position.x >= minX && c.position.x <= maxX &&
                        c.position.y >= minY && c.position.y <= maxY
                    ) {
                        state.circuit.components[c.id].selected = true;
                        state.selectedIds.add(c.id);
                    }
                });
                Object.values(circuit.wires).forEach((w) => {
                    const allInside = w.points.every(
                        (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
                    );
                    if (allInside) {
                        state.circuit.wires[w.id].selected =true;
                        state.selectedIds.add(w.id);
                    }
                });
                state.selectionBox=null;
            });
        },
        cancelSelectionBox() {
            set((state) => {state.selectionBox = null;});
        },

        // copy paste duplicate cut
        copy() {
            const {circuit, selectedIds} =get();
            if(selectedIds.size === 0) return;
            const components: Record<string, CircuitComponent> = {};
            const wires: Record<string, Wire>={}
            const circuitClone = cloneCircuit(circuit);
            selectedIds.forEach((id) => {
                if(circuitClone.components[id]) components[id] = circuitClone.components[id];
                if(circuitClone.wires[id]) wires[id] = circuitClone.wires[id];
            });
            set((state) => {
                state.clipboard={components, wires};
            });
        },
        paste() {
            const {clipboard} = get();
            if (!clipboard) return;
            const OFFSET = GRID_SIZE * 2;
            set((state) => {
                state.selectedIds.clear();
                Object.values(state.circuit.components).forEach((c) => (c.selected = false));
                Object.values(state.circuit.wires).forEach((w) => (w.selected = false));
                Object.values(clipboard.components).forEach((comp) => {
                    const newId = uid();
                    state.circuit.components[newId] = {
                        ...JSON.parse(JSON.stringify(comp)),
                        id: newId,
                        label: nextLabel(comp.type),
                        position: {
                            x: comp.position.x + OFFSET,
                            y: comp.position.y + OFFSET,
                        },
                        selected: true,
                    };
                    state.selectedIds.add(newId);
                });
                Object.values(clipboard.wires).forEach((wire) => {
                    const newId = uid();
                    state.circuit.wires[newId] = {
                        ...JSON.parse(JSON.stringify(wire)),
                        id: newId,
                        points: wire.points.map((p)=> ({
                            x: p.x +OFFSET,
                            y: p.y +OFFSET,
                        })),
                        selected: true,
                    };
                    state.selectedIds.add(newId);
                });
            });
        },
        duplicate() {
            get().copy();
            get().paste();
        },
        cut() {
            get().copy();
            get().deleteSelected();
        },
        // viewport
        setZoom(zoom) {
            set((state) => {state.zoom = Math.min(Math.max(zoom, 0.1), 5); });
        },
        setPan(pan) {
            set((state) => {state.pan = pan;});
        },
        setHoveredPin(pinKey) {
            set((state) => { state.hoveredPin = pinKey; }); 
        },
        setHoveredComponent(id) {
            set((state)=> {state.hoveredComponentId = id;});
        },
        // simulation
        setSimulating(v) {
            set((state) => {state.isSimulating = v;});
        },
        setSimSpeed(v) {
            set((state) => {state.simSpeed = Math.min(Math.max(v,1), 10);});
        },
        setCurrentSpeed(v) {
            set((state) => {state.currentSpeed = Math.min(Math.max(v,1),10);});
        },
        setSimulationResult(result) {
            set((state) => {
                state.simulationResult = result;
                state.circuit.simulationResult = result;
            });
        },
        // circuit meta
        clearCircuit() {
            get().pushHistory();
            _compCounter = {};
            set((state) => {
                state.circuit = emptyCircuit();
                state.selectedIds.clear();
                state.wireInProgress = null;
                state.simulationResult = null;
            });
        },
        loadCircuit(circuit) {
            get().pushHistory()
            set((state) => {
                state.circuit = circuit;
                state.selectedIds.clear();
                state.wireInProgress = null;
            });
        },
    }))
);