// src/store/circuitStore.ts
import {create} from "zustand";
import {immer} from "zustand/middleware/immer";
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

// state shape
interface CircuitState {
    circuit: Circuit;
    selectedIds: Set<string>;
    wireInProgress: Point[] | null; // points being drawn for the active wire
    hoveredPin: string | null; // like circuit.ts, this will be "componentId:pinId"
    zoom: number;
    pan: Point;
    isDragging: boolean;
    simulationResult: SimulationResult | null;
}

interface CircuitActions {
    // component operations
    addComponent: (type: ComponentType, position: Point) => string;
    moveComponent: (id: string, delta: Point) => void;
    rotateComponent: (id: string) => void;
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
    clearSelection: () => void;
    deleteSelected: () => void;

    // viewport
    setZoom: (zoom: number) => void;
    setPan: (pan: Point) => void;
    setHoveredPin: (pinKey: string | null) => void;

    // sim
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

        addComponent(type, position) {
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
        rotateComponent(id) {
            set((state) => {
                const c = state.circuit.components[id];
                if (!c) return;
                c.rotation = (c.rotation + 90) % 360;
            });
        },
        deleteComponent(id) {
            set((state) => {
                delete state.circuit.components[id];
                // also delete the wires connected to this
                const toDelete = Object.values(state.circuit.wires)
                    .filter((w) =>
                        w.points.some(() => false) // placeholder
                )
                    .map((w) => w.id);
                toDelete.forEach((wid) => delete state.circuit.wires[wid]);
                state.selectedIds.delete(id);
            });
        },
        updateComponentValue(id, value) {
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
                // keep start, but update live endpoint
                const pts = state.wireInProgress
                pts[pts.length-1] = snapped;
            });
        },
        finishWire() {
            const {wireInProgress} = get();
            if (!wireInProgress || wireInProgress.length < 2) {
                set((state) => { state.wireInProgress = null; });
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
            set((state) => {
                state.selectedIds.forEach((id) => {
                    delete state.circuit.components[id];
                    delete state.circuit.wires[id];
                });
                state.selectedIds.clear();
            });
        },
        // viewport
        setZoom(zoom) {
            set((state) => {state.zoom = Math.min(Math.max(zoom, 0.2), 4); });
        },
        setPan(pan) {
            set((state) => {state.pan = pan;});
        },
        setHoveredPin(pinKey) {
            set((state) => { state.hoveredPin = pinKey; }); 
        },
        // simulation
        setSimulationResult(result) {
            set((state) => {
                state.simulationResult = result;
                state.circuit.simulationResult = result;
            });
        },
        // circuit meta
        clearCircuit() {
            _compCounter = {};
            set((state) => {
                state.circuit = emptyCircuit();
                state.selectedIds.clear();
                state.wireInProgress = null;
                state.simulationResult = null;
            });
        },
        loadCircuit(circuit) {
            set((state) => {
                state.circuit = circuit;
                state.selectedIds.clear();
                state.wireInProgress = null;
            });
        },
    }))
);