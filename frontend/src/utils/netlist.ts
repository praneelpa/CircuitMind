import { Circuit, Point, GRID_SIZE} from "../types/circuit";
export function generateNetlistJSON(circuit: Circuit): string {
    let nextNodeId = 1;
    const ptToNode = new Map<string, string>();
    const aliases = new Map<string, string>();
    const getPtStr = (p: Point) => `${Math.round(p.x)}, ${Math.round(p.y)}`;
    
    const getRoot = (id: string): string => {
        let root = id;
        while (aliases.has(root)) root = aliases.get(root)!;
        return root;
    };
    const mergeNodes = (id1: string, id2: string) => {
        const r1 = getRoot(id1);
        const r2 = getRoot(id2);
        if (r1 !== r2) aliases.set(r2, r1); 
    };
    Object.values(circuit.wires).forEach(wire => {
        if (wire.points.length < 2) return;
        const firstPt = getPtStr(wire.points[0]);
        if (!ptToNode.has(firstPt)) ptToNode.set(firstPt, `n${nextNodeId++}`);
        const wireNode = ptToNode.get(firstPt)!;
        wire.points.forEach(p => {
            const ptStr = getPtStr(p);
            if (!ptToNode.has(ptStr)) ptToNode.set(ptStr, wireNode);
            else mergeNodes(wireNode, ptToNode.get(ptStr)!);
        });
    });
    let groundNodeStr = "0";
    let foundGround = false;
    const componentsData = Object.values(circuit.components).map(comp => {
        const rad = (comp.rotation * Math.PI) / 180;
        const nodes = comp.pins.map(pin => {
            const px = comp.position.x + pin.offset.x * GRID_SIZE * Math.cos(rad) -
                pin.offset.y * GRID_SIZE * Math.sin(rad);
            const py = comp.position.y + pin.offset.x * GRID_SIZE * Math.sin(rad) +
                pin.offset.y * GRID_SIZE * Math.cos(rad);
            const ptStr = getPtStr({x:px, y:py});
            if(!ptToNode.has(ptStr)) ptToNode.set(ptStr, `n${nextNodeId++}`);
            return getRoot(ptToNode.get(ptStr)!);
        });
        if (comp.type === "ground") {
            groundNodeStr = nodes[0];
            foundGround = true;
        }
        return {
            id: comp.id,
            type: comp.type,
            value: comp.value,
            nodes: nodes 
        };
    });
    const finalGround = foundGround ? getRoot(groundNodeStr) : "gnd";
    componentsData.forEach(c => {
        c.nodes = c.nodes.map(n => getRoot(n) === finalGround ? "gnd" : getRoot(n));
    });
    const netlist = {
        components: componentsData.filter(c => c.type !== "ground"),
        groundNode: "gnd"
    };
    return JSON.stringify(netlist);
}