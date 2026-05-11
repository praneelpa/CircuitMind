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

interface SelectionBox {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

interface CircuitState {
    circuit: Circuit;
    selectedIds: Set<string>;
    wireInProgress: Point[] | null; 
    hoveredPin: string | null; 
    zoom: number;
    pan: Point;
    isDragging: boolean;
    simulationResult: SimulationResult | null;
    past: Circuit[];
    future: Circuit[];
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
    addComponent: (type: ComponentType, position: Point) => string;
    moveComponent: (id: string, delta: Point) => void;
    moveSelected: (delta: Point) => void;
    rotateComponent: (id: string) => void;
    rotateSelected: () => void;
    flipComponent: (id:string) => void;
    deleteComponent: (id: string) => void;
    updateComponentValue: (id: string, value: string) => void;
    updateComponentLabel: (id: string, label: string) => void;
    
    // Wire routing
    startWire: (point: Point) => void;
    extendWire: (point: Point) => void;
    addWireCorner: () => void;
    finishWire: () => void;
    cancelWire: () => void;
    deleteWire: (id: string) => void;
    
    selectComponent: (id: string, multi?: boolean) => void;
    selectWire: (id: string, multi?: boolean) => void;
    selectAll: () => void;
    clearSelection: () => void;
    deleteSelected: () => void;
    startSelectionBox: (point: Point) => void;
    updateSelectionBox: (point: Point) => void;
    finishSelectionBox: () => void;
    cancelSelectionBox: () => void;
    copy: () => void;
    paste: () => void;
    duplicate: () => void;
    cut: () => void;
    undo: () => void;
    redo: () => void;
    pushHistory: () => void;
    setZoom: (zoom: number) => void;
    setPan: (pan: Point) => void;
    setHoveredPin: (pinKey: string | null) => void;
    setHoveredComponent: (id: string | null) => void;
    setSimulating: (v:boolean) => void;
    setSimSpeed: (v:number) => void;
    setCurrentSpeed: (v: number) => void;
    setSimulationResult: (result: SimulationResult | null) => void;
    clearCircuit: () => void;
    loadCircuit: (circuit: Circuit) => void;
    renameCircuit: (name: string) => void;
}

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
        past: [],
        future: [],
        clipboard: null,
        selectionBox: null,
        isSimulating: false,
        simSpeed: 5,
        currentSpeed: 5,
        hoveredComponentId: null,

        pushHistory() {
            set((state) => {
                state.past.push(cloneCircuit(state.circuit));
                if (state.past.length > MAX_HISTORY) state.past.shift();
                state.future = []; 
            });
        },
        undo() {
            set((state) => {
                if (state.past.length === 0) return;
                const previous = state.past.pop()!;
                state.future.push(cloneCircuit(state.circuit));
                state.circuit = previous;
                state.selectedIds.clear();
            });
        },
        redo() {
            set((state) => {
                if (state.future.length === 0) return;
                const next = state.future.pop()!;
                state.past.push(cloneCircuit(state.circuit));
                state.circuit = next;
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
        startWire(point) {
            const snapped: Point = {x: snapToGrid(point.x), y: snapToGrid(point.y) };
            set((state) => {
                state.wireInProgress = [snapped, { ...snapped }, { ...snapped }];
            });
        },
        extendWire(point) {
            const snapped: Point = {x: snapToGrid(point.x), y: snapToGrid(point.y)};
            set((state) => {
                if (!state.wireInProgress || state.wireInProgress.length < 3) return;
                const pts = state.wireInProgress;
                const start = pts[pts.length - 3]; // the last locked point
                
                const dx = Math.abs(snapped.x - start.x);
                const dy = Math.abs(snapped.y - start.y);
                if (dx >= dy) {
                    pts[pts.length - 2] = {x: snapped.x, y: start.y}; // Break horizontal first
                } else {
                    pts[pts.length - 2] = {x: start.x, y: snapped.y}; // Break vertical first
                }
                pts[pts.length - 1] = {x: snapped.x, y: snapped.y};
            });
        },
        addWireCorner() {
            set((state) => {
                if (!state.wireInProgress) return;
                const pts = state.wireInProgress;
                const last = pts[pts.length - 1];
                pts.push({...last}, {...last});
            });
        },
        finishWire() {
            get().pushHistory();
            const {wireInProgress} = get();
            if (!wireInProgress || wireInProgress.length < 2) {
                set((state) => {state.wireInProgress = null;});
                return;
            }
            const cleaned = [wireInProgress[0]];
            for (let i = 1; i < wireInProgress.length; i++) {
                const prev = cleaned[cleaned.length - 1];
                const curr = wireInProgress[i];
                if (curr.x === prev.x && curr.y === prev.y) continue;
                cleaned.push(curr);
            }

            if (cleaned.length < 2) {
                set((state) => {state.wireInProgress = null;});
                return;
            }

            const id = uid();
            const wire: Wire = {
                id, 
                points: cleaned,
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
            get().pushHistory();
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
            get().pushHistory();
            set((state) => {
                state.circuit = circuit;
                state.selectedIds.clear();
                state.wireInProgress = null;
            });
        },
        renameCircuit(name) {
            set((state) => {
                state.circuit.name = name;
            });
        },
    }))
);