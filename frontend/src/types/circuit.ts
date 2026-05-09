// src/types/circuit.ts
export type ComponentType =
    | "resistor"
    | "capacitor"
    | "inductor"
    | "voltage_source"
    | "current_source"
    | "ground"
    | "wire"
    | "op_amp"
    | "diode"
    | "transistor_npn";

export interface Point {
    x: number;
    y: number;
}
export interface Pin {
    id: string;
    label: string; // for eg "+", "-", "A", "K"
    offset: Point; // should be relative to component origin, in grid units
}
export interface CircuitComponent {
    id: string;
    type: ComponentType;
    position: Point; // top-left in grid units
    rotation: number; // in degrees 0, 90, 180, 270
    label: string; // for eg "R1"
    value: string; // eg "1k", "100n", etc
    unit: string; // eg "F", "V", "A"
    pins: Pin[];
    selected: boolean;
}
export interface Wire {
    id: string;
    points: Point[]; // polyline in grid units
    selected: boolean;
}
export interface NetNode {
    id: string;
    voltage: number; // solved V in volts
    connectedPins: string[]; // this will be "componentId:pinId"
}
export interface SimulationResult {
    solved: boolean;
    nodeVoltages: Record<string, number>; // nodeId and voltage
    branchCurrents: Record<string, number>; // componentId will be current in A
    timestamp: number;
}
export interface Circuit {
    id: string;
    name: string;
    components: Record<string, CircuitComponent>;
    wires: Record<string, Wire>;
    nets: Record<string, NetNode>;
    simulationResult: SimulationResult | null; // fix later if problems occur
}
// default pin layouts per component type
export const COMPONENT_PINS: Record<ComponentType, Pin[]> = {
    resistor: [
        {id: "a", label: "A", offset: {x: -1, y: 0} },
        {id: "b", label: "B", offset: {x: 1, y: 0} },
    ],
    capacitor: [
        {id: "pos", label: "+", offset: {x: -1, y: 0} },
        {id: "neg", label: "-", offset: {x: 1, y: 0} },
    ],
    inductor: [
        {id: "a", label: "A", offset: {x: -1, y: 0} },
        {id: "b", label: "B", offset: {x: 1, y: 0} },
    ],
    voltage_source: [
        {id: "pos", label: "+", offset: {x: 0, y: -1} },
        {id: "neg", label: "-", offset: {x: 0, y: 1} },
    ],
    current_source: [
        {id: "pos", label: "+", offset: {x: 0, y: -1} },
        {id: "neg", label: "-", offset: {x: 0, y: 1} },
    ],
    ground: [{id: "gnd", label: "GND", offset: {x: 0, y:0} }],
    wire: [],
    op_amp: [
        {id: "in_pos", label: "+", offset: {x: -1, y: -0.5} },
        {id: "in_neg", label: "-", offset: {x: -1, y: 0.5} },
        {id: "out", label:"OUT", offset: {x: 1, y: 0} },
        {id: "vcc", label:"V+", offset: {x: 0, y: -1}},
        {id: "vee", label:"V-", offset: {x: 0, y: 1} },
    ],
    diode: [
        {id: "anode", label: "A", offset: {x: -1, y:0} },
        {id: "cathode", label:"K", offset: {x: 1, y:0} },
    ],
    transistor_npn: [
        {id: "base", label: "B", offset: {x: -1, y:0}},
        {id: "collector", label:"C", offset: {x: 0, y: -1}},
        {id: "emitter", label:"E", offset:{x: 0, y: 1}},
    ],
};
export const COMPONENT_DEFAULTS: Record<
    ComponentType,
    { label: string, value: string, unit: string}
> = {
    resistor: {label: "R", value:"1k", unit:"Ω"},
    capacitor: {label: "C", value:"100n", unit:"F"},
    inductor: {label: "L", value:"10m", unit:"H"},
    voltage_source: {label:"V", value:"5", unit:"V"},
    current_source: {label:"I", value:"1m", unit:"A"},
    ground: {label:"GND", value:"0", unit:"V"},
    wire: {label:"", value:"", unit:""},
    op_amp: {label: "U", value:"LM741", unit:""},
    diode: {label: "D", value:"1N4148", unit:""},
    transistor_npn: {label: "Q", value:"2N2222", unit:""},
};
export const GRID_SIZE = 20; // pixels per grid unit, subject to change