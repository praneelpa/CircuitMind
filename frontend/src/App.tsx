// src/App.tsx
import React, {useState, useCallback} from "react";
import Canvas from "./components/editor/Canvas";
import Toolbar from "./components/editor/Toolbar";
import {useCircuitStore} from "./store/circuitStore";
import {ComponentType} from "./types/circuit";

type Tool = "select" | "wire" | ComponentType;

export default function App() {
    const [activeTool, setActiveTool] = useState<Tool>("select");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const {
        circuit,
        clearCircuit,
        updateComponentValue,
        updateComponentLabel,
        rotateComponent,
        undo, redo,
        isSimulating, setSimulating,
        simSpeed, setSimSpeed,
        currentSpeed, setCurrentSpeed,
        hoveredComponentId,
        renameCircuit,
    } = useCircuitStore();

    const selectedComp = selectedId ? circuit.components[selectedId] : null;
    const hoveredComp = hoveredComponentId ? circuit.components[hoveredComponentId] : null;

    const handleSimulate = useCallback(async () => {
        setSimulating(true);
        await new Promise((r) => setTimeout(r, 800));
        setSimulating(false);
    }, [setSimulating]);

    const handleSave = useCallback(() => {
        const json = JSON.stringify(circuit, null, 2);
        const blob = new Blob([json], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${circuit.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [circuit]);

    const handleLoad = useCallback(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const loaded = JSON.parse(ev.target?.result as string);
                    useCircuitStore.getState().loadCircuit(loaded);
                } catch {
                    alert("Invalid circuit file.");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, []);

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                width: "100vw",
                height: "100vh",
                background: "#080f1a",
                overflow: "hidden",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
        >
            <TopBar 
                onUndo={undo} 
                onRedo={redo} 
                onLoad={handleLoad} 
                circuitName={circuit.name} 
                onRename={renameCircuit} 
            />

            <div style={{display: "flex", flex: 1, overflow: "hidden"}}>
                <Toolbar
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onSimulate={handleSimulate}
                    onClear={clearCircuit}
                    onSave={handleSave}
                    isSimulating={isSimulating}
                />

                <div style={{flex: 1, position: "relative", overflow: "hidden"}}>
                    <Canvas
                        activeTool={activeTool}
                        onComponentSelect={(id) => {
                            setSelectedId(id);
                            if (id) setActiveTool("select");
                        }}
                        onToolChange={setActiveTool}
                    />
                    <HUD />
                </div>

                <PropertiesPanel
                    component={selectedComp}
                    onValueChange={(v) => selectedId && updateComponentValue(selectedId, v)}
                    onLabelChange={(l) => selectedId && updateComponentLabel(selectedId, l)}
                    onRotate={() => selectedId && rotateComponent(selectedId)}
                    simSpeed={simSpeed}
                    currentSpeed={currentSpeed}
                    onSimSpeedChange={setSimSpeed}
                    onCurrentSpeedChange={setCurrentSpeed}
                />
            </div>

            <StatusBar hovered={hoveredComp} />
        </div>
    );
}

function TopBar({onUndo, onRedo, onLoad, circuitName, onRename}: {
    onUndo: () => void;
    onRedo: () => void;
    onLoad: () => void;
    circuitName: string;
    onRename: (name: string) => void;
}) {
    return (
        <div
            style={{
                height: 40,
                background: "#080f1a",
                borderBottom: "1px solid #1e2a3a",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                gap: 8,
                flexShrink: 0,
            }}
        >
            <span style={{color: "#38bdf8", fontSize: 13, fontWeight: 700, marginRight: 8}}>⚡ CircuitMind</span>
            
            <input 
                value={circuitName}
                onChange={(e) => onRename(e.target.value)}
                style={{
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px dashed #4a5568",
                    color: "#e2e8f0",
                    fontSize: 12,
                    fontFamily: "monospace",
                    outline: "none",
                    width: 200,
                    padding: "2px 0"
                }}
            />

            <div style={{flex: 1}} />
            <TopBtn label="Undo" shortcut="⌘Z" onClick={onUndo} />
            <TopBtn label="Redo" shortcut="⌘Y" onClick={onRedo} />
            <TopBtn label="Load" shortcut="" onClick={onLoad} />
        </div>
    );
}

function TopBtn({label, shortcut, onClick}: {label: string; shortcut: string; onClick: () => void}) {
    return (
        <button
            onClick={onClick}
            style={{
                background: "transparent",
                border: "1px solid #1e2a3a",
                borderRadius: 6,
                color: "#4a5568",
                fontSize: 11,
                padding: "3px 10px",
                cursor: "pointer",
                fontFamily: "monospace",
                display: "flex",
                gap: 5,
                alignItems: "center",
            }}
        >
            {label}
            {shortcut && <span style={{color: "#2d3748"}}>{shortcut}</span>}
        </button>
    );
}

function HUD() {
    const {zoom} = useCircuitStore();
    return (
        <div
            style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                display: "flex",
                gap: 6,
                alignItems: "center",
                pointerEvents: "none",
            }}
        >
            <Chip>{Math.round(zoom * 100)}%</Chip>
        </div>
    );
}

function Chip({children}: {children: React.ReactNode}) {
    return (
        <div
            style={{
                background: "#0f1f2ecc",
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

function StatusBar({hovered}: {hovered: ReturnType<typeof useCircuitStore.getState>["circuit"]["components"][string] | null | undefined}) {
    const {selectedIds} = useCircuitStore();
    return (
        <div
            style={{
                height: 28,
                background: "#080f1a",
                borderTop: "1px solid #1e2a3a",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                gap: 16,
                flexShrink: 0,
            }}
        >
            {hovered ? (
                <>
                    <StatusChip label="Type" value={hovered.type} />
                    <StatusChip label="Label" value={hovered.label} />
                    <StatusChip label="Value" value={`${hovered.value}${hovered.unit}`} />
                </>
            ) : (
                <span style={{fontSize: 10, color: "#2d3748"}}>
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Hover a component to inspect"}
                </span>
            )}
            <div style={{flex: 1}} />
            <span style={{fontSize: 10, color: "#2d3748"}}>
                S·W·R·C·L·V·G · Del · Ctrl+Z/Y · Ctrl+C/V/D · Ctrl+A
            </span>
        </div>
    );
}

function StatusChip({label, value}: {label: string; value: string}) {
    return (
        <span style={{fontSize: 11, fontFamily: "monospace"}}>
            <span style={{color: "#2d3748"}}>{label}: </span>
            <span style={{color: "#94a3b8"}}>{value}</span>
        </span>
    );
}

interface PropPanelProps {
    component: ReturnType<typeof useCircuitStore.getState>["circuit"]["components"][string] | null | undefined;
    onValueChange: (v: string) => void;
    onLabelChange: (l: string) => void;
    onRotate: () => void;
    simSpeed: number;
    currentSpeed: number;
    onSimSpeedChange: (v: number) => void;
    onCurrentSpeedChange: (v: number) => void;
}

function PropertiesPanel({
    component, onValueChange, onLabelChange, onRotate,
    simSpeed, currentSpeed, onSimSpeedChange, onCurrentSpeedChange,
}: PropPanelProps) {
    return (
        <div
            style={{
                width: 220,
                height: "100%",
                background: "#080f1a",
                borderLeft: "1px solid #1e2a3a",
                display: "flex",
                flexDirection: "column",
                padding: 16,
                gap: 14,
                overflowY: "auto",
            }}
        >
            <div style={{color: "#38bdf8", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em"}}>
                PROPERTIES
            </div>

            {component ? (
                <>
                    <PropRow label="Type" value={component.type} />
                    <PropRow label="ID" value={component.id.slice(0, 7)} />
                    <PropRow label="Rotation" value={`${component.rotation}°`} />

                    <div style={{display: "flex", flexDirection: "column", gap: 4}}>
                        <label style={{fontSize: 10, color: "#4a5568", letterSpacing: "0.05em"}}>LABEL</label>
                        <input value={component.label} onChange={(e) => onLabelChange(e.target.value)} style={inputStyle} />
                    </div>

                    {component.value !== "" && (
                        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
                            <label style={{fontSize: 10, color: "#4a5568", letterSpacing: "0.05em"}}>VALUE ({component.unit})</label>
                            <input value={component.value} onChange={(e) => onValueChange(e.target.value)} style={inputStyle} />
                            <div style={{fontSize: 10, color: "#2d3748"}}>e.g. 1k · 4.7n · 100m · 5</div>
                        </div>
                    )}

                    <button onClick={onRotate} style={{...inputStyle, cursor: "pointer", color: "#38bdf8", textAlign: "center"}}>
                        Rotate 90° (R)
                    </button>

                    <div style={{marginTop: 4}}>
                        <div style={{fontSize: 10, color: "#4a5568", marginBottom: 6, letterSpacing: "0.05em"}}>PINS</div>
                        {component.pins.map((pin) => (
                            <div key={pin.id} style={{display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid #1e2a3a", color: "#94a3b8"}}>
                                <span style={{color: "#f472b6"}}>{pin.id}</span>
                                <span>{pin.label}</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div style={{fontSize: 11, color: "#2d3748", lineHeight: 1.7}}>
                    Click a component to inspect it.
                </div>
            )}

            <div style={{marginTop: "auto", display: "flex", flexDirection: "column", gap: 12}}>
                <Divider />
                <SliderRow
                    label="Sim speed"
                    value={simSpeed}
                    min={1} max={10}
                    onChange={onSimSpeedChange}
                />
                <SliderRow
                    label="Current speed"
                    value={currentSpeed}
                    min={1} max={10}
                    onChange={onCurrentSpeedChange}
                />
            </div>
        </div>
    );
}

function SliderRow({label, value, min, max, onChange}: {
    label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
    return (
        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
            <div style={{display: "flex", justifyContent: "space-between"}}>
                <span style={{fontSize: 10, color: "#4a5568"}}>{label}</span>
                <span style={{fontSize: 10, color: "#94a3b8", fontFamily: "monospace"}}>{value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                style={{width: "100%", accentColor: "#38bdf8"}}
            />
        </div>
    );
}

function PropRow({label, value}: {label: string; value: string}) {
    return (
        <div style={{display: "flex", justifyContent: "space-between", fontSize: 11}}>
            <span style={{color: "#4a5568"}}>{label}</span>
            <span style={{color: "#94a3b8", fontFamily: "monospace"}}>{value}</span>
        </div>
    );
}

function Divider() {
    return <div style={{height: 1, background: "#1e2a3a"}} />;
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