// src/hooks/useSimulator.ts
import { useCallback } from "react";
import { useCircuitStore } from "../store/circuitStore";
import { generateNetlistJSON } from "../utils/netlist";
import init, { solve } from "../wasm/solver"; 

export function useSimulator() {
    const { circuit, setSimulating, setSimulationResult } = useCircuitStore();

    const simulate = useCallback(async () => {
        setSimulating(true);
        try {
            await init(); 
            
            const jsonNetlist = generateNetlistJSON(circuit);
            const resultStr = solve(jsonNetlist);
            const result = JSON.parse(resultStr);

            if (result.solved) {
                const componentVoltages: Record<string, number> = {};
                if (result.branchCurrents) {
                    Object.keys(result.branchCurrents).forEach(compId => {
                        const comp = circuit.components[compId];
                        if (comp && comp.type === "resistor") {
                            const rStr = comp.value;
                            const base = parseFloat(rStr) || 1;
                            const mult = rStr.toLowerCase().includes('k') ? 1000 :
                                         rStr.toLowerCase().includes('m') ? 0.001 :
                                         rStr.toLowerCase().includes('meg') ? 1000000 : 1;
                            componentVoltages[compId] = result.branchCurrents[compId] * (base * mult);
                        }
                    });
                }

                setSimulationResult({
                    nodeVoltages: result.nodeVoltages || {}, 
                    branchCurrents: result.branchCurrents || {}, 
                    componentVoltages: componentVoltages,
                    power: result.power || {}
                } as any);
            } else {
                console.error("Solver Error:", result.error);
                alert("Simulation failed: " + result.error);
                setSimulationResult(null);
            }
        } catch (e) {
            console.error("Simulation exception:", e);
            setSimulationResult(null);
        } finally {
            setTimeout(() => setSimulating(false), 500);
        }
    }, [circuit, setSimulating, setSimulationResult]);

    return { simulate };
}