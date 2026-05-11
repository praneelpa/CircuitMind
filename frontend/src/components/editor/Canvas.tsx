// src/components/editor/Canvas.tsx
import React, {useRef, useCallback, useEffect, useState} from "react";
import {useCircuitStore, snapToGrid} from "../../store/circuitStore";
import {
    CircuitComponent,
    Wire,
    Point,
    ComponentType,
    GRID_SIZE,
} from "../../types/circuit";

const GRID_DOT_COLOR  = "#2a3f55";
const WIRE_COLOR      = "#4ade80";
const WIRE_SELECTED   = "#facc15";
const WIRE_PREVIEW    = "#4ade8088";
const COMP_FILL       = "#0f1f2e";
const COMP_STROKE     = "#38bdf8";
const COMP_SELECTED   = "#facc15";
const COMP_LABEL_COLOR = "#94a3b8";
const COMP_VALUE_COLOR = "#38bdf8";
const COMP_HOVER_STROKE = "#7dd3fc";
const PIN_COLOR       = "#f472b6";
const PIN_HOVER_COLOR = "#ffffff";
const BG_COLOR        = "#080f1a";
const ELECTRON_COLORS = ["#4ade80", "#22d3ee", "#a78bfa"];
const SEL_BOX_FILL    = "#38bdf812";
const SEL_BOX_STROKE  = "#38bdf8";

type Tool = "select" | "wire" | ComponentType;

interface CanvasProps {
    activeTool: Tool;
    onComponentSelect: (id: string | null) => void;
    onToolChange: (tool: Tool) => void;
}

interface Electron {
    wireId: string;
    t: number;
    speed: number;
    colorIdx: number;
}

interface ContextMenu {
    x: number;
    y: number;
    targetId: string | null;
    targetType: "component" | "wire" | "canvas";
}

function ptAlongPolyline(points: Point[], t: number): Point {
    if (points.length < 2) return points[0] ?? {x: 0, y: 0};
    const segs: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        segs.push(Math.sqrt(dx * dx + dy * dy));
        total += segs[segs.length - 1];
    }
    if (total === 0) return points[0];
    let target = t * total;
    for (let i = 0; i < segs.length; i++) {
        if (target <= segs[i]) {
            const frac = target / segs[i];
            return {
                x: points[i].x + frac * (points[i + 1].x - points[i].x),
                y: points[i].y + frac * (points[i + 1].y - points[i].y),
            };
        }
        target -= segs[i];
    }
    return points[points.length - 1];
}

function drawResistor(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean, voltage: number = 0) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;

    if (Math.abs(voltage) > 0.1) {
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = Math.min(Math.abs(voltage) / 5, 1) * 15;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const w = GRID_SIZE * 1.6;
    const h = GRID_SIZE * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - w / 2, y);
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + GRID_SIZE, y);
    ctx.stroke();
    ctx.fillStyle = COMP_FILL;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    ctx.beginPath();
    const steps = 6;
    const sw = w / steps;
    for (let i = 0; i <= steps; i++) {
        const px = x - w / 2 + i * sw;
        const py = i % 2 === 0 ? y - h * 0.3 : y + h * 0.3;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.shadowBlur = 0;
}

function drawCapacitor(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean, voltage: number = 0) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const gap = 5;
    const plateH = GRID_SIZE * 0.7;
    
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + GRID_SIZE, y);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - gap, y - plateH / 2);
    ctx.lineTo(x - gap, y + plateH / 2);
    ctx.moveTo(x + gap, y - plateH / 2);
    ctx.lineTo(x + gap, y + plateH / 2);
    ctx.stroke();
    if (Math.abs(voltage) > 0.1) {
        const charge = Math.min(Math.abs(voltage) / 5, 1);
        ctx.globalAlpha = charge; 
        ctx.fillStyle = voltage > 0 ? "#4ade80" : "#f87171"; 
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = charge * 15;
        ctx.fillRect(x - gap + 2, y - plateH / 2, gap * 2 - 4, plateH); 
        ctx.globalAlpha = 1.0; 
        ctx.shadowBlur = 0;
    }
}

function drawInductor(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean, voltage: number = 0, time: number = 0) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;
    
    const r = 6;
    const loops = 4;
    const totalW = loops * r * 2;

    if (Math.abs(voltage) > 0.1) {
        const field = Math.min(Math.abs(voltage) / 5, 1);
        const pulse = Math.abs(Math.sin(time * 0.005));
        ctx.strokeStyle = `rgba(56, 189, 248, ${field * pulse * 0.8})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, totalW / 2 + 8, r + 8, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - totalW / 2, y);
    for (let i = 0; i < loops; i++) {
        const cx = x - totalW / 2 + r + i * r * 2;
        ctx.arc(cx, y, r, Math.PI, 0, false);
    }
    ctx.lineTo(x + GRID_SIZE, y);
    ctx.stroke();
}

function drawVoltageSource(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const r = GRID_SIZE * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y - GRID_SIZE);
    ctx.lineTo(x, y - r);
    ctx.moveTo(x, y + r);
    ctx.lineTo(x, y + GRID_SIZE);
    ctx.stroke();
    ctx.fillStyle = COMP_FILL;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${GRID_SIZE * 0.5}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("+", x, y - r * 0.3);
    ctx.fillText("−", x, y + r * 0.55);
}

function drawGround(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - GRID_SIZE * 0.5);
    ctx.lineTo(x, y);
    ctx.stroke();
    const lines = [
        {w: GRID_SIZE * 0.9, y: y},
        {w: GRID_SIZE * 0.6, y: y + 6},
        {w: GRID_SIZE * 0.3, y: y + 12},
    ];
    lines.forEach(({w, y: ly}) => {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, ly);
        ctx.lineTo(x + w / 2, ly);
        ctx.stroke();
    });
}

function drawDiode(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean, voltage: number = 0) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;

    if (voltage > 0.1) {
        ctx.shadowColor = "#4ade80"; 
        ctx.shadowBlur = Math.min(voltage / 2, 1) * 15;
        ctx.fillStyle = "#4ade80"; 
    } else if (voltage < -0.1) {
        ctx.shadowColor = "#f87171";
        ctx.shadowBlur = 5;
        ctx.fillStyle = color;
    } else {
        ctx.fillStyle = color;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const s = GRID_SIZE * 0.55;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - s, y);
    ctx.moveTo(x + s, y);
    ctx.lineTo(x + GRID_SIZE, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x + s, y);
    ctx.closePath();
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawOpAmp(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.fillStyle = COMP_FILL;
    ctx.lineWidth = 1.5;
    const s = GRID_SIZE * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x + s, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `${GRID_SIZE * 0.4}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("+", x - s + 4, y - s * 0.35);
    ctx.fillText("−", x - s + 4, y + s * 0.55);
}

function drawTransistorNPN(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, hovered: boolean) {
    const color = selected ? COMP_SELECTED : hovered ? COMP_HOVER_STROKE : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.fillStyle = COMP_FILL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - GRID_SIZE * 0.3, y);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE * 0.3, y - GRID_SIZE * 0.7);
    ctx.lineTo(x - GRID_SIZE * 0.3, y + GRID_SIZE * 0.7);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE * 0.3, y - GRID_SIZE * 0.4);
    ctx.lineTo(x, y - GRID_SIZE * 0.7);
    ctx.lineTo(x, y - GRID_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE * 0.3, y + GRID_SIZE * 0.4);
    ctx.lineTo(x, y + GRID_SIZE * 0.7);
    ctx.lineTo(x, y + GRID_SIZE);
    ctx.stroke();
    const ax = x - 2, ay = y + GRID_SIZE * 0.6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + 6, ay - 4);
    ctx.lineTo(ax + 6, ay + 4);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

const Canvas: React.FC<CanvasProps> = ({activeTool, onComponentSelect, onToolChange}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const timeRef = useRef<number>(0); 
    const electronsRef = useRef<Electron[]>([]);
    const dragStartWorldRef = useRef<Point>({x: 0, y: 0});

    const pan = useCircuitStore(state => state.pan);
    const zoom = useCircuitStore(state => state.zoom);
    const wireInProgress = useCircuitStore(state => state.wireInProgress);

    const startWire = useCircuitStore(state => state.startWire);
    const extendWire = useCircuitStore(state => state.extendWire);
    const addWireCorner = useCircuitStore(state => state.addWireCorner); 
    const finishWire = useCircuitStore(state => state.finishWire);
    const addComponent = useCircuitStore(state => state.addComponent);
    const selectComponent = useCircuitStore(state => state.selectComponent);
    const selectWire = useCircuitStore(state => state.selectWire);
    const clearSelection = useCircuitStore(state => state.clearSelection);
    const moveComponent = useCircuitStore(state => state.moveComponent);
    const moveSelected = useCircuitStore(state => state.moveSelected);
    const pushHistory = useCircuitStore(state => state.pushHistory);
    const startSelectionBox = useCircuitStore(state => state.startSelectionBox);
    const updateSelectionBox = useCircuitStore(state => state.updateSelectionBox);
    const finishSelectionBox = useCircuitStore(state => state.finishSelectionBox);
    const setPan = useCircuitStore(state => state.setPan);
    const setZoom = useCircuitStore(state => state.setZoom);
    const setHoveredPin = useCircuitStore(state => state.setHoveredPin);
    const setHoveredComponent = useCircuitStore(state => state.setHoveredComponent);

    const rotateSelected = useCircuitStore(state => state.rotateSelected);
    const duplicate = useCircuitStore(state => state.duplicate);
    const copy = useCircuitStore(state => state.copy);
    const paste = useCircuitStore(state => state.paste);
    const cut = useCircuitStore(state => state.cut);
    const deleteSelected = useCircuitStore(state => state.deleteSelected);
    const deleteWire = useCircuitStore(state => state.deleteWire);
    const selectAll = useCircuitStore(state => state.selectAll);
    const undo = useCircuitStore(state => state.undo);
    const redo = useCircuitStore(state => state.redo);

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const [dragStart, setDragStart] = useState<Point>({x: 0, y: 0});
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<Point>({x: 0, y: 0});
    const [isBoxSelecting, setIsBoxSelecting] = useState(false);
    const [cursor, setCursor] = useState("crosshair");
    const mousePosRef = useRef<Point>({ x: 0, y: 0 });
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

    const screenToWorld = useCallback(
        (sx: number, sy: number): Point => ({
            x: (sx - pan.x) / zoom,
            y: (sy - pan.y) / zoom,
        }),
        [pan, zoom]
    );

    const wires = useCircuitStore(state => state.circuit.wires);

    useEffect(() => {
        const wireList = Object.values(wires);
        const existing = new Set(electronsRef.current.map((e) => e.wireId));
        wireList.forEach((w) => {
            if (!existing.has(w.id)) {
                electronsRef.current.push({
                    wireId: w.id,
                    t: Math.random(),
                    speed: 0.0008 + Math.random() * 0.0006,
                    colorIdx: Math.floor(Math.random() * ELECTRON_COLORS.length),
                });
            }
        });
        const wireIds = new Set(wireList.map((w) => w.id));
        electronsRef.current = electronsRef.current.filter((e) => wireIds.has(e.wireId));
    }, [wires]);

    const draw = useCallback(() => {
        const state = useCircuitStore.getState();
        const { 
            circuit, wireInProgress, zoom, pan, hoveredPin, 
            hoveredComponentId, selectionBox 
        } = state;
        const mousePos = mousePosRef.current; 
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;

        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, W, H);

        const step = GRID_SIZE * zoom;
        const offsetX = pan.x % step;
        const offsetY = pan.y % step;
        ctx.fillStyle = GRID_DOT_COLOR;
        for (let gx = offsetX; gx < W; gx += step) {
            for (let gy = offsetY; gy < H; gy += step) {
                ctx.beginPath();
                ctx.arc(gx, gy, zoom < 0.5 ? 0.5 : 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        Object.values(circuit.wires).forEach((wire) => {
            if (wire.points.length < 2) return;

            let renderColor = wire.selected ? WIRE_SELECTED : WIRE_COLOR;
            if (state.simulationResult && (state.simulationResult as any).nodeVoltages) {
                const voltage = (state.simulationResult as any).nodeVoltages[wire.id] || 0; 
                if (voltage > 0.1) renderColor = "#4ade80"; 
                else if (voltage < -0.1) renderColor = "#f87171"; 
                else renderColor = "#64748b"; 
            }

            ctx.strokeStyle = renderColor;
            ctx.lineWidth = wire.selected ? 2 / zoom : 1.5 / zoom;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            wire.points.forEach((p, i) =>
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            );
            ctx.stroke();
            [wire.points[0], wire.points[wire.points.length - 1]].forEach((p) => {
                ctx.fillStyle = WIRE_COLOR;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 / zoom, 0, Math.PI * 2);
                ctx.fill();
            });
        });

        if (wireInProgress && wireInProgress.length >= 2) {
            ctx.strokeStyle = WIRE_PREVIEW;
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([4 / zoom, 4 / zoom]);
            ctx.beginPath();
            wireInProgress.forEach((p, i) =>
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            );
            ctx.stroke();
            ctx.setLineDash([]);
        }

        electronsRef.current.forEach((electron) => {
            const wire = circuit.wires[electron.wireId];
            if (!wire || wire.points.length < 2) return;
            const pos = ptAlongPolyline(wire.points, electron.t);
            const color = ELECTRON_COLORS[electron.colorIdx];
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 6 / zoom, 0, Math.PI * 2);
            ctx.strokeStyle = color + "44";
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
        });

        Object.values(circuit.components).forEach((comp) => {
            const {x, y} = comp.position;
            const hovered = hoveredComponentId === comp.id;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((comp.rotation * Math.PI) / 180);

            if (hovered && !comp.selected) {
                ctx.shadowColor = COMP_HOVER_STROKE;
                ctx.shadowBlur = 8 / zoom;
            }

            const compVolt = (state.simulationResult as any)?.componentVoltages?.[comp.id] || 0;

            switch (comp.type) {
                case "resistor":        
                    drawResistor(ctx, 0, 0, comp.selected, hovered, compVolt); 
                    break;
                case "capacitor":       
                    drawCapacitor(ctx, 0, 0, comp.selected, hovered, compVolt); 
                    break;
                case "inductor":        
                    drawInductor(ctx, 0, 0, comp.selected, hovered, compVolt, timeRef.current); 
                    break;
                case "voltage_source":  drawVoltageSource(ctx, 0, 0, comp.selected, hovered); break;
                case "ground":          drawGround(ctx, 0, 0, comp.selected, hovered); break;
                case "diode":           drawDiode(ctx, 0, 0, comp.selected, hovered, compVolt); break;
                case "op_amp":          drawOpAmp(ctx, 0, 0, comp.selected, hovered); break;
                case "transistor_npn":  drawTransistorNPN(ctx, 0, 0, comp.selected, hovered); break;
                default:
                    ctx.strokeStyle = comp.selected ? COMP_SELECTED : COMP_STROKE;
                    ctx.fillStyle = COMP_FILL;
                    ctx.lineWidth = 1.5;
                    ctx.fillRect(-GRID_SIZE, -GRID_SIZE * 0.5, GRID_SIZE * 2, GRID_SIZE);
                    ctx.strokeRect(-GRID_SIZE, -GRID_SIZE * 0.5, GRID_SIZE * 2, GRID_SIZE);
            }

            ctx.shadowBlur = 0;
            ctx.rotate((-comp.rotation * Math.PI) / 180); 
            ctx.font = `${GRID_SIZE * 0.65}px 'JetBrains Mono', monospace`;
            
            const isVertical = comp.rotation % 180 !== 0;

            if (isVertical) {
                ctx.textBaseline = "middle";
                ctx.fillStyle = COMP_LABEL_COLOR;
                ctx.textAlign = "right";
                ctx.fillText(comp.label, -GRID_SIZE * 0.8, 0);
                ctx.fillStyle = COMP_VALUE_COLOR;
                ctx.textAlign = "left";
                ctx.fillText(`${comp.value}${comp.unit}`, GRID_SIZE * 0.8, 0);
            } else {
                ctx.textAlign = "center";
                ctx.fillStyle = COMP_LABEL_COLOR;
                ctx.textBaseline = "bottom";
                ctx.fillText(comp.label, 0, -GRID_SIZE * 0.7);
                ctx.fillStyle = COMP_VALUE_COLOR;
                ctx.textBaseline = "top";
                ctx.fillText(`${comp.value}${comp.unit}`, 0, GRID_SIZE * 0.7);
            }
            
            ctx.textBaseline = "alphabetic";
            ctx.restore();

            comp.pins.forEach((pin) => {
                const rad = (comp.rotation * Math.PI) / 180;
                const px =
                    x + pin.offset.x * GRID_SIZE * Math.cos(rad) -
                    pin.offset.y * GRID_SIZE * Math.sin(rad);
                const py =
                    y + pin.offset.x * GRID_SIZE * Math.sin(rad) +
                    pin.offset.y * GRID_SIZE * Math.cos(rad);
                const pinKey = `${comp.id}:${pin.id}`;
                const isHovered = hoveredPin === pinKey;
                ctx.beginPath();
                ctx.arc(px, py, isHovered ? 5 / zoom : 3 / zoom, 0, Math.PI * 2);
                ctx.fillStyle = isHovered ? PIN_HOVER_COLOR : PIN_COLOR;
                ctx.fill();
                if (isHovered) {
                    ctx.beginPath();
                    ctx.arc(px, py, 8 / zoom, 0, Math.PI * 2);
                    ctx.strokeStyle = PIN_HOVER_COLOR + "66";
                    ctx.lineWidth = 1 / zoom;
                    ctx.stroke();
                }
            });
        });

        if (selectionBox) {
            const {startX, startY, endX, endY} = selectionBox;
            const bx = Math.min(startX, endX);
            const by = Math.min(startY, endY);
            const bw = Math.abs(endX - startX);
            const bh = Math.abs(endY - startY);
            ctx.fillStyle = SEL_BOX_FILL;
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = SEL_BOX_STROKE;
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([4 / zoom, 4 / zoom]);
            ctx.strokeRect(bx, by, bw, bh);
            ctx.setLineDash([]);
        }

        ctx.restore();

        if (activeTool === "wire") {
            const snap = {
                x: snapToGrid(mousePos.x - pan.x) * zoom + pan.x,
                y: snapToGrid(mousePos.y - pan.y) * zoom + pan.y,
            };
            ctx.strokeStyle = WIRE_COLOR + "88";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(snap.x - 8, snap.y);
            ctx.lineTo(snap.x + 8, snap.y);
            ctx.moveTo(snap.x, snap.y - 8);
            ctx.lineTo(snap.x, snap.y + 8);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }, [activeTool]);

    useEffect(() => {
        const animate = () => {
            const { currentSpeed } = useCircuitStore.getState();
            const multiplier = currentSpeed / 5; 

            timeRef.current += 16 * multiplier; 

            electronsRef.current.forEach((e) => {
                e.t = (e.t + (e.speed * multiplier)) % 1;
            });
            
            draw();
            animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ro = new ResizeObserver(() => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        });
        ro.observe(canvas);
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        return () => ro.disconnect();
    }, []);

    const getHitComponent = useCallback((world: Point): CircuitComponent | null => {
        const { circuit } = useCircuitStore.getState(); 
        for (const comp of Object.values(circuit.components)) {
            const dx = world.x - comp.position.x;
            const dy = world.y - comp.position.y;
            if (Math.abs(dx) < GRID_SIZE * 1.2 && Math.abs(dy) < GRID_SIZE * 1.2) return comp;
        }
        return null;
    }, []); 

    const getHitWire = useCallback((world: Point): Wire | null => {
        const { circuit } = useCircuitStore.getState(); 
        const THRESHOLD = 6;
        for (const wire of Object.values(circuit.wires)) {
            for (let i = 1; i < wire.points.length; i++) {
                const a = wire.points[i - 1];
                const b = wire.points[i];
                const ab = {x: b.x - a.x, y: b.y - a.y};
                const ap = {x: world.x - a.x, y: world.y - a.y};
                const t = Math.max(0, Math.min(1,
                    (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y + 1e-9)
                ));
                const closest = {x: a.x + t * ab.x, y: a.y + t * ab.y};
                const dist = Math.sqrt((world.x - closest.x) ** 2 + (world.y - closest.y) ** 2);
                if (dist < THRESHOLD) return wire;
            }
        }
        return null;
    }, []); 

    const getNearPin = useCallback((world: Point): string | null => {
        const { circuit } = useCircuitStore.getState(); 
        const SNAP_DIST = GRID_SIZE * 0.6;
        for (const comp of Object.values(circuit.components)) {
            for (const pin of comp.pins) {
                const rad = (comp.rotation * Math.PI) / 180;
                const px =
                    comp.position.x + pin.offset.x * GRID_SIZE * Math.cos(rad) -
                    pin.offset.y * GRID_SIZE * Math.sin(rad);
                const py =
                    comp.position.y + pin.offset.x * GRID_SIZE * Math.sin(rad) +
                    pin.offset.y * GRID_SIZE * Math.cos(rad);
                if (Math.sqrt((world.x - px) ** 2 + (world.y - py) ** 2) < SNAP_DIST)
                    return `${comp.id}:${pin.id}`;
            }
        }
        return null;
    }, []); 

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            setContextMenu(null);
            const rect = canvasRef.current!.getBoundingClientRect();
            const screen = {x: e.clientX - rect.left, y: e.clientY - rect.top};
            const world = screenToWorld(screen.x, screen.y);
            const snapped: Point = {x: snapToGrid(world.x), y: snapToGrid(world.y)};

            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                setIsPanning(true);
                setPanStart({x: e.clientX - pan.x, y: e.clientY - pan.y});
                return;
            }

            if (activeTool === "wire") {
                const pinKey = getNearPin(world);

                if (!wireInProgress) {
                    if (!pinKey) return; 
                    startWire(snapped);
                } else {
                    if (pinKey) {
                        extendWire(snapped);
                        finishWire();
                        onToolChange("select"); 
                    } else {
                        addWireCorner(); 
                    }
                }
                return;
            }

            if (activeTool === "select") {
                const comp = getHitComponent(world);
                if (comp) {
                    if (!comp.selected) selectComponent(comp.id, e.shiftKey);
                    onComponentSelect(comp.id);
                    setDraggingId(comp.id);
                    setDragStart(world);
                    dragStartWorldRef.current = world;
                    setIsDraggingSelection(true);
                    pushHistory();
                    return;
                }
                const wire = getHitWire(world);
                if (wire) {
                    selectWire(wire.id, e.shiftKey);
                    onComponentSelect(null);
                    return;
                }
                clearSelection();
                onComponentSelect(null);
                setIsBoxSelecting(true);
                startSelectionBox(world);
                return;
            }

            addComponent(activeTool as ComponentType, snapped);
            onToolChange("select"); 
        },
        [
            activeTool, pan, wireInProgress, screenToWorld,
            startWire, extendWire, addWireCorner, finishWire, addComponent,
            getHitComponent, getHitWire, getNearPin,
            selectComponent, selectWire, clearSelection, onComponentSelect,
            startSelectionBox, pushHistory, onToolChange
        ]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = canvasRef.current!.getBoundingClientRect();
            const screen = {x: e.clientX - rect.left, y: e.clientY - rect.top};
            mousePosRef.current = screen;
            const world = screenToWorld(screen.x, screen.y);
            const snapped: Point = {x: snapToGrid(world.x), y: snapToGrid(world.y)};

            if (isPanning) {
                setPan({x: e.clientX - panStart.x, y: e.clientY - panStart.y});
                return;
            }

            if (isBoxSelecting) {
                updateSelectionBox(world);
                return;
            }

            if (isDraggingSelection && activeTool === "select") {
                const delta = {
                    x: world.x - dragStart.x,
                    y: world.y - dragStart.y,
                };
                const {selectedIds} = useCircuitStore.getState();
                if (selectedIds.size > 1) {
                    moveSelected(delta);
                } else if (draggingId) {
                    moveComponent(draggingId, delta);
                }
                setDragStart(world);
                return;
            }

            if (wireInProgress) {
                extendWire(snapped);
            }

            const comp = getHitComponent(world);
            setHoveredComponent(comp ? comp.id : null);
            const pin = getNearPin(world);
            setHoveredPin(pin);
            setCursor(
                isPanning ? "grabbing" :
                pin ? "crosshair" :
                comp && activeTool === "select" ? "move" :
                activeTool === "select" ? "default" : "crosshair"
            );
        },
        [
            isPanning, panStart, isDraggingSelection, isBoxSelecting,
            draggingId, dragStart, activeTool, wireInProgress, screenToWorld,
            setPan, moveComponent, moveSelected, extendWire,
            setHoveredPin, setHoveredComponent, getNearPin, getHitComponent,
            updateSelectionBox,
        ]
    );

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        setIsDraggingSelection(false);
        setDraggingId(null);
        if (isBoxSelecting) {
            finishSelectionBox();
            setIsBoxSelecting(false);
        }
    }, [isBoxSelecting, finishSelectionBox]);

    const handleDoubleClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = canvasRef.current!.getBoundingClientRect();
            const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            if (activeTool === "wire" && wireInProgress) {
                finishWire();
                onToolChange("select");
                return;
            }
            const comp = getHitComponent(world);
            if (comp) {
                onComponentSelect(comp.id);
                selectComponent(comp.id);
            }
        },
        [activeTool, wireInProgress, finishWire, getHitComponent, onComponentSelect, selectComponent, screenToWorld, onToolChange]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            const rect = canvasRef.current!.getBoundingClientRect();
            const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            const comp = getHitComponent(world);
            const wire = getHitWire(world);
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                targetId: comp?.id ?? wire?.id ?? null,
                targetType: comp ? "component" : wire ? "wire" : "canvas",
            });
            if (comp) selectComponent(comp.id);
            if (wire) selectWire(wire.id);
        },
        [screenToWorld, getHitComponent, getHitWire, selectComponent, selectWire]
    );

    const handleWheel = useCallback(
        (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvasRef.current!.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.min(Math.max(zoom * factor, 0.1), 5);
            setPan({
                x: mx - (mx - pan.x) * (newZoom / zoom),
                y: my - (my - pan.y) * (newZoom / zoom),
            });
            setZoom(newZoom);
        },
        [zoom, pan, setZoom, setPan]
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.addEventListener("wheel", handleWheel, {passive: false});
        return () => canvas.removeEventListener("wheel", handleWheel);
    }, [handleWheel]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    
            const store = useCircuitStore.getState();
            const ctrl = e.ctrlKey || e.metaKey;
    
            if (e.key === "Escape") { 
                store.cancelWire(); 
                store.cancelSelectionBox(); 
                store.clearSelection(); 
                onToolChange("select");
            }
            if (e.key === "Delete" || e.key === "Backspace") { 
                e.preventDefault(); 
                store.deleteSelected(); 
            }
            if (ctrl && e.key === "z") { e.preventDefault(); store.undo(); }
            if (ctrl && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); store.redo(); }
            if (ctrl && e.key === "c") { e.preventDefault(); store.copy(); }
            if (ctrl && e.key === "v") { e.preventDefault(); store.paste(); }
            if (ctrl && e.key === "x") { e.preventDefault(); store.cut(); }
            if (ctrl && e.key === "d") { e.preventDefault(); store.duplicate(); }
            if (ctrl && e.key === "a") { e.preventDefault(); store.selectAll(); }
            if (e.key === "r" || e.key === "R") store.rotateSelected();
        };
    
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onToolChange]);

    useEffect(() => {
        const handler = () => setContextMenu(null);
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, []);

    return (
        <div style={{width: "100%", height: "100%", position: "relative"}}>
            <canvas
                ref={canvasRef}
                style={{width: "100%", height: "100%", display: "block", cursor, background: BG_COLOR}}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
            />

            {contextMenu && (
                <div
                    style={{
                        position: "fixed",
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: "#0f1f2e",
                        border: "1px solid #1e2a3a",
                        borderRadius: 8,
                        padding: "4px 0",
                        zIndex: 1000,
                        minWidth: 160,
                        boxShadow: "0 8px 32px #00000088",
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.targetType === "component" && (
                        <>
                            <CtxItem label="Rotate (R)" onClick={() => { rotateSelected(); setContextMenu(null); }} />
                            <CtxItem label="Duplicate (Ctrl+D)" onClick={() => { duplicate(); setContextMenu(null); }} />
                            <CtxItem label="Copy (Ctrl+C)" onClick={() => { copy(); setContextMenu(null); }} />
                            <CtxItem label="Cut (Ctrl+X)" onClick={() => { cut(); setContextMenu(null); }} />
                            <CtxDivider />
                            <CtxItem label="Delete" onClick={() => { deleteSelected(); setContextMenu(null); }} danger />
                        </>
                    )}
                    {contextMenu.targetType === "wire" && (
                        <>
                            <CtxItem label="Delete wire" onClick={() => { if (contextMenu.targetId) deleteWire(contextMenu.targetId); setContextMenu(null); }} danger />
                        </>
                    )}
                    {contextMenu.targetType === "canvas" && (
                        <>
                            <CtxItem label="Paste (Ctrl+V)" onClick={() => { paste(); setContextMenu(null); }} />
                            <CtxItem label="Select all (Ctrl+A)" onClick={() => { selectAll(); setContextMenu(null); }} />
                            <CtxDivider />
                            <CtxItem label="Undo (Ctrl+Z)" onClick={() => { undo(); setContextMenu(null); }} />
                            <CtxItem label="Redo (Ctrl+Y)" onClick={() => { redo(); setContextMenu(null); }} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

function CtxItem({label, onClick, danger}: {label: string; onClick: () => void; danger?: boolean}) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: "7px 16px",
                fontSize: 12,
                fontFamily: "monospace",
                color: danger ? "#f87171" : hovered ? "#e2e8f0" : "#94a3b8",
                background: hovered ? "#1e2a3a" : "transparent",
                cursor: "pointer",
                transition: "all 0.1s",
            }}
        >
            {label}
        </div>
    );
}

function CtxDivider() {
    return <div style={{height: 1, background: "#1e2a3a", margin: "4px 0"}} />;
}

export default Canvas;