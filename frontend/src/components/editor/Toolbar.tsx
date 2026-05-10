import React from "react";
import { ComponentType } from "../../types/circuit";
import { StringController } from "three/examples/jsm/libs/lil-gui.module.min.js";

type Tool = "select" | "wire" | ComponentType;

interface ToolbarProps {
    activeTool: Tool;
    onToolChange: (tool: Tool) => void;
    onSimulate: () => void;
    onClear: () => void;
    onSave: () => void;
    isSimulating: boolean;
}
interface ToolDef {
    id: Tool;
    label: string;
    symbol: string;
    group: "action" | "passive" | "active" | "source";
    shortcut?: string;
}
const TOOLS: ToolDef[] = [
    { id: "select", label: "Select", symbol: "↖", group: "action", shortcut: "S"},
    { id: "wire", label: "Wire", symbol:"--", group:"action", shortcut:"W"},
    { id: "resistor", label: "Resistor", symbol:"R", group:"passive", shortcut:"R"},
    { id: "capacitor", label: "Capacitor", symbol:"C", group: "passive", shortcut: "C"},
    { id: "inductor", label:"Inductor", symbol:"L", group:"passive", shortcut:"L"},
    { id: "diode", label: "Diode", symbol:"D", group:"active"},
    { id: "transistor_npn", label:"NPN BJT", symbol:"Q", group:"active"},
    { id: "op_amp", label:"Op-Amp", symbol:"A", group:"active"},
    { id: "voltage_source", label:"Voltage source", symbol:"V", group:"source", shortcut:"V"},
    { id: "current_source", label:"Current source", symbol:"I", group:"source"},
    { id: "ground", label: "Ground", symbol:"+", group:"source", shortcut:"G"},
];
const GROUP_COLORS: Record<string, string> ={
    action: "#38bdf8",
    passive: "#4ade80",
    active: "#a78bfa",
    source: "#fb923c",
};
const Toolbar: React.FC<ToolbarProps> = ({
    activeTool,
    onToolChange,
    onSimulate,
    onClear,
    onSave,
    isSimulating,
}) => {
    // keyboard
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;
            const tool = TOOLS.find(
                (t) => t.shortcut?.toLowerCase() === e.key.toLowerCase()
            );
            if (tool) onToolChange(tool.id);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onToolChange]);
    const groups = ["action", "passive", "active", "source"] as const;
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                width: 64,
                height: "100%",
                background: "#080f1a",
                borderRight: "1px solid #1e2a3a",
                padding: "12px 0",
                gap: 2,
                alignItems: "center",
                userSelect: "none",
            }}
        >
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #38bdf8, 0%, #4ade80 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                    flexShrink: 0,
                }}
        >
            <span style={{ color: "#080f1a", fontWeight: 700, fontSize: 14}}>⚡</span>
        </div>

        {groups.map((group) => (
            <React.Fragment key={group}>
                <div
                    style={{
                        width: 32,
                        height: 1,
                        background: "#1e2a3a",
                        margin: "6px 0",
                        flexShrink: 0,
                    }}
                />
                {TOOLS.filter((t) => t.group === group).map((tool) => {
                    const active = activeTool = tool.id;
                    const color = GROUP_COLORS[tool.group];
                    return (
                        <button
                            key={tool.id}
                            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
                            onClick={() => onToolChange(tool.id)}
                            style = {{
                                width: 44,
                                height: 44,
                                borderRadius: 8,
                                border: active ? `1.5px solid ${color}` : "1.5px solid transparent",
                                background: active ? `${color}18` : "transparent",
                                color: active ? color : "#4a5568",
                                fontSize: 16,
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0,
                                transition: "all 0.15s",
                                flexShrink: 0,
                                fontFamily: "monospace",
                            }}
                            onMouseEnter={(e) => {
                                if (!active) {
                                    (e.currentTarget as HTMLButtonElement).style.color = color;
                                    (e.currentTarget as HTMLButtonElement).style.background = `${color}0d`;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!active) {
                                    (e.currentTarget as HTMLButtonElement).style.color = "#4a5568";
                                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                                }
                            }}
                        >
                            <span style={{ lineHeight : 1}}>{tool.symbol}</span>
                            {tool.shortcut && (
                                <span
                                    style={{
                                        fontSize: 8,
                                        color: active ? `${color}aa` : "#2d3748",
                                        marginTop: 1,
                                        fontFamily: "monospace",
                                    }}
                                >
                                    {tool.shortcut}
                                </span>
                            )}
                        </button>
                    );
                })}
            </React.Fragment>
        ))}
        {/* Spacer */}
        <div style={{flex:1}} />
        {/* Action buttons */}
        <ActionBtn
            label="Run"
            symbol="▶"
            color= "#4ade80"
            onClick={onSimulate}
            loading={isSimulating}
            title="Simulate circuit"
        />
        <ActionBtn
            label="Save"
            symbol="↓"
        color="#38bdf8"
        onClick={onSave}
        title="Save circuit"
        />
        <ActionBtn
            label="Clear"
            symbol="✕"
            color="#f87171"
            onClick={onClear}
            title="Clear canvas"
        />
    </div> 
    );
};

const ActionBtn: React.FC<{
    label: string;
    symbol: string;
    color: string;
    onClick: () => void;
    title?: string;
    loading?: boolean;
}> = ({label, symbol, color, onClick, title, loading}) => (
    <button
        onClick={onClick}
        title={title}
        style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            border: `1.5px solid ${color}44`,
            background: `${color}10`,
            color,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            transition: "all 0.15s",
            flexShrink: 0,
            marginBottom: 4,
            opacity: loading ? 0.6 : 1,
        }}
    >
        <span>{loading ? "..." : symbol}</span>
        <span style = {{fontSize: 8, fontFamily: "monospace", color:`${color}aa`}}>
            {label}
        </span>
    </button>
);
export default Toolbar;