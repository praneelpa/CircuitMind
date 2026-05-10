import React, {useState, useCallback} from "react";
import Canvas from "./components/editor/Canvas";
import Toolbar from "./components/editor/Toolbar";
import {useCircuitStore} from "./store/circuitStore";
import {ComponentType} from "./types/circuit";

type Tool = "select" | "wire" | ComponentType;

export default function App() {
    const [activeTool, setActiveTool] = useState<Tool>("select");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    
    const {circuit, clearCircuit, updateComponentValue, updateComponentLabel} =
        useCircuitStore();
    const selectedComp = selectedId ? circuit.components[selectedId] : null;
    const handleSimulate = useCallback(async () => {
        setIsSimulating(true);
        // sim hook will be wired soon (make wasm solver first)
        await new Promise((r) => setTimeout(r, 800));
        setIsSimulating(false);
    }, []);
    const handleSave = useCallback(() => {
        const json = JSON.stringify(circuit, null, 2);
        const blob = new Blob([json], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${circuit.name}.json`;
        a.click();
    }, [circuit]);
    
    return (
        <div
            style= {{
                display: "flex",
                width: "100vw",
                height: "100vh",
                background: "#080f1a",
                overflow: "hidden",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
        >
            {/* left toolbar */}
            <Toolbar
                activeTool = {activeTool}
                onToolChange={setActiveTool}
                onSimulate={handleSimulate}
                onClear={clearCircuit}
                onSave={handleSave}
                isSimulating={isSimulating}
            />
            {/* main canvas */}
            <div style = {{flex: 1, position: "relative"}}>
                <Canvas
                    activeTool={activeTool}
                    onComponentSelect={(id) => {
                        setSelectedId(id);
                        if (id) setActiveTool("select");
                    }}
                />
                {/* HUD: zoom + coordinates */}
                <HUD />
            </div>
            {/* right panel - properties */}
            <PropertiesPanel
                component={selectedComp}
                onValueChange={(v) => selectedId && updateComponentValue(selectedId, v)}
                onLabelChange={(l) => selectedId && updateComponentLabel(selectedId, l)}
            />
        </div>
    );
}
// HUD
function HUD() {
    const {zoom} = useCircuitStore();
    return (
        <div
            style ={{
                position: "absolute",
                bottom: 12,
                left: 12,
                display: "flex",
                gap: 8,
                alignItems: "center",
            }}
        >
            <Chip>{Math.round(zoom * 100)}%</Chip>
            <Chip>CircuitMind v0.1</Chip>
        </div>
    );
}
function Chip({children} : {children: React.ReactNode}) {
    return (
        <div
            style={{
                background: "#0f1f2e",
                border: "1px solid #1e2a3a",
                borderRadius: 6,
                padding: "3px 10px",
                fontSize: 11,
                color: "#4a5568",
                fontFamily: "monospace",
            }}
        >
            {children}
        </div>
    );
}
// properties panel
interface PropPanelProps {
    component: ReturnType<typeof useCircuitStore.getState>["circuit"]["components"][string] | null | undefined;
    onValueChange: (v: string) => void;
    onLabelChange: (l: string) => void; 
}
function PropertiesPanel({component, onValueChange, onLabelChange}: PropPanelProps) {
    return (
        <div
            style={{
                width:220,
                height:"100%",
                background:"#080f1a",
                borderLeft: "1px solid #1e2a3a",
                display: "flex",
                flexDirection: "column",
                padding: 16,
                gap: 16,
            }}
        >
            <div style={{color: "#38bdf8", fontSize:11, fontWeight:700, letterSpacing: "0.1em"}}>
                PROPERTIES
            </div>
            {component ? (
                <>
                    <PropRow label="Type" value={component.type} />
                    <PropRow label="ID" value={component.id.slice(0, 7)} />
                    <div style ={{ display: "flex", flexDirection: "column", gap: 4}}>
                        <label style = {{ fontSize: 10, color: "#4a5568", letterSpacing: "0.05em"}}>
                            LABEL
                        </label>
                        <input
                            value={component.label}
                            onChange={(e) => onLabelChange(e.target.value)}
                            style={inputStyle}
                        />
                    </div>
                    {component.value !== "" && (
                        <div style = {{display: "flex", flexDirection: "column", gap: 4}}>
                            <label style = {{fontSize: 10, color: "#4a5568", letterSpacing: "0.05em"}}>
                                VALUE ({component.unit})
                            </label>
                            <input
                                value={component.value}
                                onChange={(e) => onValueChange(e.target.value)}
                                style={inputStyle}
                            />
                            <div style={{fontSize: 10, color: "#2d3748"}}>
                                e.g. 1k · 4.7n · 100m · 5
                            </div>
                        </div>
                    )}
                    <div style={{marginTop: 8}}>
                        <div style={{fontSize:10, color: "#4a5568", marginBottom: 6, letterSpacing: "0.05em"}}>
                            PINS
                        </div>
                        {component.pins.map((pin) => (
                            <div
                                key={pin.id}
                                style={{
                                    display:"flex",
                                    justifyContent: "space-between",
                                    fontSize:11,
                                    padding: "3px 0",
                                    borderBottom: "1px solid #1e2a3a",
                                    color: "#94a3b8",
                                }}
                            >
                                <span style={{color: "#f472b6"}}>{pin.id}</span>
                                <span>{pin.label}</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div style={{ fontSize:11, color:"#2d3748", lineHeight:1.6}}>
                    Click a component to inspect it.
                    <br /><br />
                    <span style={{color: "#1e2a3a"}}>
                        S — select<br />
                        W — wire<br />
                        R — resistor<br />
                        C — capacitor<br />
                        L — inductor<br />
                        V — voltage source<br />
                        G — ground<br />
                        Del — delete<br />
                        Scroll — zoom<br />
                        Alt+drag — pan<br />
                    </span>
                </div>
            )}
        </div>
    );
}

function PropRow({label, value}: {label: string; value: string}) {
    return (
        <div style={{display: "flex", justifyContent:"space-between", fontSize:11}}>
            <span style={{color: "#4a5568" }}>{label}</span>
            <span style={{color: "#94a3b8", fontFamily: "monospace"}}>{value}</span>
        </div>
    );
}
const inputStyle: React.CSSProperties = {
    background: "#0f1f2e",
    border: "1px solid #1e2a3a",
    borderRadius: 6,
    color: "#e2e8f0",
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: "monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
};