import React, { useRef, useCallback, useEffect, useState } from "react";
import { useCircuitStore, snapToGrid } from "../../store/circuitStore";
import {
    CircuitComponent,
    Wire,
    Point,
    ComponentType,
    GRID_SIZE,
} from "../../types/circuit";
// consts
const GRID_COLOR = "#1e2a3a";
const GRID_DOT_COLOR = "#2a3f55";
const WIRE_COLOR = "#4ade80";
const WIRE_SELECTED = "#facc15";
const WIRE_PREVIEW = "#4ade8088";
const COMP_FILL = "#0f1f2e";
const COMP_STROKE = "#38bdf8";
const COMP_SELECTED = "#facc15";
const COMP_LABEL_COLOR = "#94a3b8";
const COMP_VALUE_COLOR = "#38bdf8";
const PIN_COLOR = "#f472b6";
const PIN_HOVER_COLOR = "#ffffff";
const BG_COLOR = "#080f1a";
const ELECTRON_COLORS = ["#4ade80", "#22d3ee", "#a78bfa"];
// types
type Tool = "select" | "wire" | ComponentType;
interface CanvasProps {
    activeTool: Tool;
    onComponentSelect: (id: string | null) => void;
}

interface Electron {
    wireId: string;
    t: number; // 0..1 pos along wire
    speed: number;
    colorIdx: number;
}
// utility
function ptAlongPolyline(points: Point[], t: number): Point {
    if (points.length < 2) return points[0] ?? {x:0, y:0};
    const segs: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        segs.push(len);
        total += len;
    }
    if (total === 0) return points[0];
    let target = t * total;
    for (let i = 0; i < segs.length; i++) {
        if (target <= segs[i]) {
            const frac = target / segs[i];
            return {
                x: points[i].x + frac * (points[i+1].x - points[i].x),
                y: points[i].y + frac * (points[i+1].y - points[i].y),
            };
        }
        target -= segs[i];
    }
    return points[points.length - 1];
}
// svg shapes
function drawResistor(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean) 
{
    const color = selected ? COMP_SELECTED : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const w = GRID_SIZE * 1.6;
    const h = GRID_SIZE * 0.6;
    // lead lines
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - w / 2, y);
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + GRID_SIZE, y);
    ctx.stroke();
    // body rect
    ctx.fillStyle = COMP_FILL;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    // zigzag
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
}
function drawCapacitor(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean)
{
    const color = selected ? COMP_SELECTED : COMP_STROKE;
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
    // plates
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - gap, y - plateH / 2);
    ctx.lineTo(x - gap, y + plateH / 2);
    ctx.moveTo(x + gap, y - plateH / 2);
    ctx.lineTo(x + gap, y + plateH / 2);
    ctx.stroke();
}
function drawInductor(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean)
{
    const color = selected ? COMP_SELECTED : COMP_STROKE ;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const r = 6;
    const loops = 4;
    const totalW = loops * r * 2;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - totalW / 2, y);
    for (let i = 0; i < loops; i++) {
        const cx = x - totalW / 2 + r + i * r * 2;
        ctx.arc(cx,y,r,Math.PI, 0, false);
    }
    ctx.lineTo(x+GRID_SIZE, y);
    ctx.stroke();
}
function drawVoltageSource(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean, value: string) 
{
    const color = selected ? COMP_SELECTED : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const r = GRID_SIZE * 0.7;
    ctx.beginPath();
    ctx.moveTo(x,y-GRID_SIZE);
    ctx.lineTo(x,y-r);
    ctx.moveTo(x, y + r);
    ctx.lineTo(x,y+GRID_SIZE);
    ctx.stroke();
    ctx.fillStyle = COMP_FILL;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // signs
    ctx.fillStyle = color;
    ctx.font = `bold ${GRID_SIZE * 0.5}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("+", x, y - r * 0.3);
    ctx.fillText("-", x, y + r * 0.55);
}
function drawGround(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean)
{
    const color = selected ? COMP_SELECTED : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - GRID_SIZE * 0.5);
    ctx.lineTo(x, y);
    ctx.stroke();
    const lines = [
        { w: GRID_SIZE * 0.9, y:y},
        { w: GRID_SIZE * 0.6, y:y+6},
        { w: GRID_SIZE * 0.3, y:y+12},
    ];
    lines.forEach(({w, y: ly}) => {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, ly);
        ctx.lineTo(x + w / 2, ly);
        ctx.stroke();
    });
}
function drawDiode(ctx: CanvasRenderingContext2D, x: number, y:number, selected: boolean) {
    const color = selected ? COMP_SELECTED : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    const s = GRID_SIZE * 0.55;
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x-s, y);
    ctx.moveTo(x+s, y);
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
}
function drawOpAmp(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean)
{
    const color = selected ? COMP_SELECTED : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.fillStyle = COMP_FILL;
    ctx.lineWidth = 1.5;
    const s = GRID_SIZE * 1.2;
    ctx.beginPath();
    ctx.moveTo(x-s, y-s);
    ctx.lineTo(x-s, y+s);
    ctx.lineTo(x+s, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `${GRID_SIZE * 0.4}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("+", x-s+4, y-s*0.35);
    ctx.fillText("-", x-s+4, y+s*0.55);
}
function drawTransistorNPN(ctx:CanvasRenderingContext2D, x: number, y:number, selected: boolean)
{
    const color = selected ? COMP_SELECTED : COMP_STROKE;
    ctx.strokeStyle = color;
    ctx.fillStyle = COMP_FILL;
    ctx.lineWidth = 1.5;
    // base
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE, y);
    ctx.lineTo(x - GRID_SIZE * 0.3, y);
    ctx.stroke();
    // vertical base bar
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x-GRID_SIZE*0.3, y-GRID_SIZE * 0.7);
    ctx.lineTo(x-GRID_SIZE*0.3, y+GRID_SIZE*0.7);
    ctx.stroke();
    ctx.lineWidth=1.5;
    // collector
    ctx.beginPath();
    ctx.moveTo(x-GRID_SIZE*0.3, y-GRID_SIZE*0.4);
    ctx.lineTo(x,y-GRID_SIZE*0.7);
    ctx.lineTo(x,y-GRID_SIZE);
    ctx.stroke();
    // emitter w/ arrow
    ctx.beginPath();
    ctx.moveTo(x - GRID_SIZE * 0.3, y + GRID_SIZE * 0.4);
    ctx.lineTo(x, y+GRID_SIZE*0.7);
    ctx.lineTo(x,y+GRID_SIZE);
    ctx.stroke();
    // arrow
    const ax = x-2, ay = y + GRID_SIZE * 0.6;
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.lineTo(ax+6, ay-4);
    ctx.lineTo(ax+6, ay+4);
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
}

// main canvas comp

const Canvas: React.FC<CanvasProps> = ({activeTool, onComponentSelect}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const electronsRef = useRef<Electron[]>([]);
    const {
        circuit,
        wireInProgress,
        zoom,
        pan,
        startWire,
        extendWire,
        finishWire,
        cancelWire,
        addComponent,
        selectComponent,
        selectWire,
        clearSelection,
        deleteSelected,
        moveComponent,
        setZoom,
        setPan,
        setHoveredPin,
        hoveredPin,
    } = useCircuitStore();
    const [draggingId, setDraggingId] = useState<string|null>(null);
    const [dragStart, setDragStart] = useState<Point>({x:0, y:0});
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<Point>({x:0, y:0});
    const [cursor, setCursor] = useState("crosshair");
    const [mousePos, setMousePos] = useState<Point>({x:0, y:0});

    // coordinate transforms
    const screenToWorld = useCallback(
        (sx:number, sy:number): Point => ({
            x: (sx-pan.x) / zoom,
            y: (sy-pan.y) / zoom,
        }),
        [pan,zoom]
    );
    const worldToScreen = useCallback(
        (wx:number, wy: number): Point => ({
            x: wx * zoom + pan.x,
            y: wy * zoom + pan.y,
        }),
        [pan,zoom]
    );
    // electron anim
    useEffect(() => {
        const wires = Object.values(circuit.wires);
        // spawn e- on wires
        const existing = new Set(electronsRef.current.map((e)=> e.wireId));
        wires.forEach((w) => {
            if (!existing.has(w.id)) {
                electronsRef.current.push({
                    wireId: w.id,
                    t: Math.random(),
                    speed: 0.0008 + Math.random() * 0.0006,
                    colorIdx: Math.floor(Math.random() * ELECTRON_COLORS.length),
                });
            }
        });
        // Remove electrons for deleted wires
        const wireIds = new Set(wires.map((w) => w.id));
        electronsRef.current = electronsRef.current.filter((e) => 
            wireIds.has(e.wireId)
        );
    }, [circuit.wires]);
    // draw
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0,0,W,H);
        const step = GRID_SIZE * zoom;
        const offsetX = pan.x % step;
        const offsetY = pan.y % step;
        ctx.fillStyle = GRID_DOT_COLOR;
        for (let gx = offsetX; gx < W; gx += step) {
            for (let gy = offsetY; gy < H; gy += step) {
                ctx.beginPath();
                ctx.arc(gx,gy, zoom < 0.5 ? 0.5 : 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.save()
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);
        // wires
        Object.values(circuit.wires).forEach((wire) => {
            if (wire.points.length < 2) return;
            ctx.strokeStyle = wire.selected ? WIRE_SELECTED : WIRE_COLOR;
            ctx.lineWidth = wire.selected ? 2 / zoom : 1.5 / zoom;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            wire.points.forEach((p, i) => 
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            );
            ctx.stroke();
            // junction dots at endp
            [wire.points[0], wire.points[wire.points.length - 1]].forEach((p) => {
                ctx.fillStyle = WIRE_COLOR;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 / zoom, 0, Math.PI * 2);
                ctx.fill();
            });
        });
        // Wire in prog
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
        // electrons
        electronsRef.current.forEach((electron) => {
            const wire = circuit.wires[electron.wireId];
            if (!wire || wire.points.length < 2) return;
            const pos = ptAlongPolyline(wire.points, electron.t);
            const color = ELECTRON_COLORS[electron.colorIdx];
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3/zoom, 0, Math.PI *2);
            ctx.fillStyle = color;
            ctx.fill();
            // glow ring
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 6/zoom, 0, Math.PI * 2);
            ctx.strokeStyle = color + "44";
            ctx.lineWidth = 1/zoom;
            ctx.stroke();
        });
        // comps
        Object.values(circuit.components).forEach((comp) => {
            const {x,y} = comp.position;
            ctx.save();
            ctx.translate(x,y);
            ctx.rotate((comp.rotation * Math.PI)/180);
            switch (comp.type) {
                case "resistor":
                    drawResistor(ctx,0,0,comp.selected);
                    break;
                case "capacitor":
                    drawCapacitor(ctx,0,0,comp.selected);
                    break;
                case "inductor":
                    drawInductor(ctx,0,0,comp.selected);
                    break;
                case "voltage_source":
                    drawVoltageSource(ctx,0,0,comp.selected,comp.value);
                    break;
                case "ground":
                    drawGround(ctx,0,0,comp.selected);
                    break;
                case "diode":
                    drawDiode(ctx,0,0,comp.selected);
                    break;
                case "op_amp":
                    drawOpAmp(ctx,0,0, comp.selected);
                    break;
                case "transistor_npn":
                    drawTransistorNPN(ctx,0,0,comp.selected);
                    break;
                default:
                    // Generic box
                    ctx.strokeStyle = comp.selected ? COMP_SELECTED : COMP_STROKE;
                    ctx.fillStyle = COMP_FILL;
                    ctx.lineWidth = 1.5;
                    ctx.fillRect(-GRID_SIZE, -GRID_SIZE * 0.5, GRID_SIZE * 2, GRID_SIZE);
                    ctx.strokeRect(-GRID_SIZE, -GRID_SIZE * 0.5, GRID_SIZE * 2, GRID_SIZE);
            }
            // label and val
            ctx.rotate((-comp.rotation * Math.PI) / 180);
            ctx.font = `${11/zoom}px 'JetBrains Mono', monospace`;
            ctx.textAlign = "center";
            ctx.fillStyle = COMP_LABEL_COLOR;
            ctx.fillText(comp.label, 0, -GRID_SIZE * 0.9);
            ctx.fillStyle = COMP_VALUE_COLOR;
            ctx.fillText(`${comp.value}${comp.unit}`, 0, GRID_SIZE * 1.1);
            ctx.restore();

            // pins
            comp.pins.forEach((pin) => {
                // rotate pin offset
                const rad = (comp.rotation * Math.PI) / 180;
                const px = 
                    x +
                    pin.offset.x * GRID_SIZE * Math.cos(rad) -
                    pin.offset.y * GRID_SIZE * Math.sin(rad);
                const py =
                    y +
                    pin.offset.x * GRID_SIZE * Math.sin(rad) +
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
        ctx.restore();
        // crosshair cursor
        if (activeTool === "wire") {
            const snap = {
                x: snapToGrid(mousePos.x - pan.x) * zoom + pan.x,
                y: snapToGrid(mousePos.y - pan.y) * zoom + pan.y, 
            };
            ctx.strokeStyle = WIRE_COLOR + "88";
            ctx.lineWidth = 1;
            ctx.setLineDash([4,4]);
            ctx.beginPath();
            ctx.moveTo(snap.x - 8, snap.y);
            ctx.lineTo(snap.x + 8, snap.y);
            ctx.moveTo(snap.x, snap.y - 8);
            ctx.lineTo(snap.x,snap.y+8);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }, [circuit, wireInProgress, zoom, pan, hoveredPin, activeTool, mousePos]);
    // animation loop
    useEffect(() => {
        const animate = () => {
            electronsRef.current.forEach((e) => {
                e.t = (e.t + e.speed) % 1;
            });
            draw();
            animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw]);
    // resize observer
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
    // mouse helpers
    const getHitComponent = useCallback(
        (world:Point): CircuitComponent | null => {
            for (const comp of Object.values(circuit.components)) {
                const dx = world.x - comp.position.x;
                const dy = world.y - comp.position.y;
                if (Math.abs(dx) < GRID_SIZE * 1.2 && Math.abs(dy) < GRID_SIZE * 1.2) {
                    return comp;
                }
            }
            return null;
        },
        [circuit.components]
    );
    const getHitWire = useCallback(
        (world: Point): Wire | null => {
            const THRESHOLD = 6;
            for (const wire of Object.values(circuit.wires)) {
                for (let i = 1; i < wire.points.length; i++) {
                    const a = wire.points[i - 1];
                    const b = wire.points[i];
                    // point to seg distance
                    const ab = {x: b.x - a.x, y: b.y - a.y};
                    const ap = {x: world.x - a.x, y: world.y - a.y};
                    const t = Math.max(
                        0,
                        Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y + 1e-9))
                    );
                    const closest = {x: a.x + t * ab.x, y: a.y + t * ab.y};
                    const dist = Math.sqrt(
                        (world.x - closest.x) ** 2 + (world.y - closest.y) ** 2
                    );
                    if (dist < THRESHOLD) return wire;
                }
            }
            return null;
        },
        [circuit.wires]
    );
    const getNearPin = useCallback(
        (world: Point): string | null => {
            const SNAP_DIST = GRID_SIZE * 0.6;
            for (const comp of Object.values(circuit.components)) {
                for (const pin of comp.pins) {
                    const rad = (comp.rotation * Math.PI) / 180;
                    const px = 
                        comp.position.x +
                        pin.offset.x * GRID_SIZE * Math.cos(rad) -
                        pin.offset.y * GRID_SIZE * Math.sin(rad);
                    const py =
                        comp.position.y + 
                        pin.offset.x * GRID_SIZE * Math.sin(rad) +
                        pin.offset.y * GRID_SIZE * Math.cos(rad);
                    const dist = Math.sqrt((world.x - px) ** 2 + (world.y - py) ** 2);
                    if (dist < SNAP_DIST) return `${comp.id}:${pin.id}`;
                }
            }
            return null;
        },
        [circuit.components]
    );
    // event handlers
    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = canvasRef.current!.getBoundingClientRect();
            const screen = {x: e.clientX - rect.left, y: e.clientY - rect.top};
            const world = screenToWorld(screen.x, screen.y);
            const snapped: Point = {
                x: snapToGrid(world.x),
                y: snapToGrid(world.y),
            };
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                // middle click or alt+click = pan
                setIsPanning(true);
                setPanStart({x:e.clientX - pan.x, y:e.clientY - pan.y});
                return;
            }
            if (activeTool === "wire") {
                if(wireInProgress) {
                    finishWire();
                    startWire(snapped);
                } else {
                    startWire(snapped);
                }
                return;
            }
            if (activeTool === "select") {
                const comp = getHitComponent(world);
                if (comp) {
                    selectComponent(comp.id, e.shiftKey);
                    onComponentSelect(comp.id);
                    setDraggingId(comp.id);
                    setDragStart(world);
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
                return;
            }
            // component placement tools
            const type = activeTool as ComponentType;
            addComponent(type, snapped);
        },
        [
            activeTool, pan, wireInProgress, screenToWorld,
            startWire, finishWire, addComponent,
            getHitComponent, getHitWire,
            selectComponent, selectWire, clearSelection, onComponentSelect,
        ]
    );
    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = canvasRef.current!.getBoundingClientRect();
            const screen = {x: e.clientX - rect.left, y: e.clientY - rect.top};
            setMousePos(screen);
            const world = screenToWorld(screen.x, screen.y);
            const snapped: Point = {
                x: snapToGrid(world.x),
                y: snapToGrid(world.y),
            };
            if (isPanning) {
                setPan({x:e.clientX - panStart.x, y:e.clientY - panStart.y});
                return;
            }
            if (draggingId && activeTool === "select") {
                const delta = {
                    x: world.x - dragStart.x,
                    y: world.y - dragStart.y,
                };
                moveComponent(draggingId, delta);
                setDragStart(world);
                return;
            }
            if (wireInProgress) {
                extendWire({ x: snapToGrid(world.x), y: snapToGrid(world.y) });
            }
            // Pin hover detection
            setHoveredPin(getNearPin(world));
            setCursor(getNearPin(world) ? "crosshair" : activeTool === "select" ? "default" : "crosshair");
        },
        [
            isPanning, panStart, draggingId, dragStart, activeTool,
            wireInProgress, screenToWorld,
            setPan, moveComponent, extendWire, setHoveredPin, getNearPin,
        ]
    );
    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        setDraggingId(null);
    }, []);
    const handleDoubleClick = useCallback(
        (_e: React.MouseEvent<HTMLCanvasElement>) => {
            if (activeTool === "wire" && wireInProgress) {
                finishWire();
            }
        },
        [activeTool, wireInProgress, finishWire]
    );
    const handleWheel = useCallback(
        (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvasRef.current!.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.min(Math.max(zoom * factor, 0.2), 4);
            // zoom toward mouse pointer
            setPan({
                x: mx - (mx - pan.x) * (newZoom/zoom),
                y: my - (my - pan.y) * (newZoom/zoom),
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
    // keyboard shortcuts
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancelWire();
            if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
        };
        window.addEventListener("keydown", onKey);
        return() => window.removeEventListener("keydown", onKey);
    }, [cancelWire, deleteSelected]);
    return (
        <canvas
            ref={canvasRef}
            style = {{
                width: "100%",
                height: "100%",
                display: "block",
                cursor,
                background: BG_COLOR,
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
        />
    );
};
export default Canvas;