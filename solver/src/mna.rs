// solver/src/mna.rs
// modified nodal analysis = mna
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use crate::matrix::{Matrix, gaussian_solve};
use crate::components::{
    stamp_resistor, stamp_capacitor, stamp_inductor,
    stamp_voltage_source, stamp_current_source, parse_value,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetlistComponent {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub value: String,
    pub nodes: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Netlist {
    pub components: Vec<NetlistComponent>,
    pub ground_node: String,
}

// sim result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimResult {
    pub solved: bool,
    pub error: Option<String>,
    pub node_voltages: HashMap<String, f64>,
    pub branch_currents: HashMap<String, f64>,
    pub power: HashMap<String, f64>,
}
impl SimResult {
    fn error(msg: String) -> Self {
        Self {
            solved: false,
            error: Some(msg),
            node_voltages: HashMap::new(),
            branch_currents: HashMap::new(),
            power: HashMap::new(),
        }
    }
}
// mna solver
pub fn solve_dc(netlist: &Netlist) -> SimResult {
    let mut node_map: HashMap<String, usize> = HashMap::new();
    let mut node_count = 0usize;
    for comp in &netlist.components {
        for node in &comp.nodes {
            if node == &netlist.ground_node {continue;}
            if !node_map.contains_key(node) {
                node_map.insert(node.clone(), node_count);
                node_count += 1;
            }
        }
    }
    if node_count == 0 {
        return SimResult::error("No nodes. found. Add components and connect them.".to_string());
    }
    let voltage_sources: Vec<&NetlistComponent> = netlist.components.iter().filter(|c| matches!(c.kind.as_str(), "voltage_source" | "inductor")).collect();
    let n_vsrc = voltage_sources.len();
    let mat_size = node_count + n_vsrc;
    
    let mut g = Matrix::zeros(mat_size, mat_size);
    let mut i_vec = vec![0.0f64; mat_size];
    // helper to get matrix index for a node (none = gnd)
    let node_idx = |node: &str| -> Option<usize> {
        if node == netlist.ground_node {None}
        else {node_map.get(node).copied()}
    };
    let mut vsrc_index: HashMap<String, usize> = HashMap::new();
    let mut vsrc_count = 0usize;
    for comp in &netlist.components {
        let nodes = &comp.nodes;
        let value = match parse_value(&comp.value) {
            Ok(v) => v,
            Err(e) => return SimResult::error(format!("Component {}: {}", comp.id, e)),
        };
        match comp.kind.as_str() {
            "resistor" => {
                if nodes.len() < 2 {
                    return SimResult::error(format!("Resistor {} needs 2 nodes", comp.id));
                }
                stamp_resistor(
                    &mut g,
                    node_idx(&nodes[0]), node_idx(&nodes[1]),
                    value,
                );
            }
            "capacitor" => {
                if nodes.len() < 2 {
                    return SimResult::error(format!("Capacitor {} needs 2 nodes", comp.id));
                }
                stamp_capacitor(
                    &mut g,
                    node_idx(&nodes[0]), node_idx(&nodes[1]),
                    value,
                    false,
                    0.0,
                );
            }
            "inductor" => {
                if nodes.len() < 2 {
                    return SimResult::error(format!("Inductor {} needs 2 nodes", comp.id));
                }
                let bi = node_count + vsrc_count;
                vsrc_index.insert(comp.id.clone(), vsrc_count);
                vsrc_count += 1;
                stamp_inductor(
                    &mut g,
                    &mut i_vec,
                    node_idx(&nodes[0]), node_idx(&nodes[1]),
                    value, bi,
                );
            }
            "voltage_source" => {
                if nodes.len() < 2 {
                    return SimResult::error(format!("Voltage source {} needs 2 nodes", comp.id));
                }
                let bi = node_count + vsrc_count;
                vsrc_index.insert(comp.id.clone(), vsrc_count);
                vsrc_count += 1;
                stamp_voltage_source(
                    &mut g,
                    &mut i_vec,
                    node_idx(&nodes[0]), node_idx(&nodes[1]),
                    value, bi,
                );
            }
            "current_source" => {
                if nodes.len() < 2 {
                    return SimResult::error(format!("Current source {} needs 2 nodes", comp.id));
                }
                stamp_current_source(
                    &mut i_vec,
                    node_idx(&nodes[0]), node_idx(&nodes[1]),
                    value,
                );
            }
            "ground" => {}
            "diode" => {
                if nodes.len() < 2{
                    return SimResult::error(format!("Diode {} needs 2 nodes", comp.id));
                }
                stamp_resistor(&mut g, node_idx(&nodes[0]), node_idx(&nodes[1]), 10.0)
            }
            "transistor_npn" => {
                if nodes.len() < 3{
                    return SimResult::error(format!("NPN transistor {} needs 3 nodes", comp.id));
                }
                stamp_resistor(&mut g, node_idx(&nodes[0]), node_idx(&nodes[2]), 25.0);
                stamp_resistor(&mut g, node_idx(&nodes[1]), node_idx(&nodes[2]), 250.0);
            }
            "op_amp" => {
                if nodes.len() >= 3 {
                    stamp_resistor(&mut g, node_idx(&nodes[2]), node_idx(&nodes[0]), 1.0);
                }
            }
            other => {
                eprintln!("Warning: unknown component type '{}'", other);
            }
        }
    }
    let solution = match gaussian_solve(&mut g, &mut i_vec) {
        Ok(x) => x,
        Err(e) => return SimResult::error(e),
    };
    let mut node_voltages: HashMap<String, f64> = HashMap::new();
    node_voltages.insert(netlist.ground_node.clone(), 0.0);
    for (node_id, &idx) in &node_map {
        let v = if idx < solution.len() {solution[idx]} else {0.0};
        node_voltages.insert(node_id.clone(), v);
    }
    let mut branch_currents: HashMap<String, f64> = HashMap::new();
    let mut power: HashMap<String, f64> = HashMap::new();
    for comp in &netlist.components {
        match comp.kind.as_str() {
            "voltage_source" | "inductor" => {
                if let Some(&vi) = vsrc_index.get(&comp.id) {
                    let bi = node_count + vi;
                    let current = if bi < solution.len() {solution[bi]} else {0.0};
                    branch_currents.insert(comp.id.clone(),current);
                    let v = parse_value(&comp.value).unwrap_or(0.0);
                    power.insert(comp.id.clone(), v*current);
                }
            }
            "resistor" => {
                if comp.nodes.len() >= 2 {
                    let va = node_voltages.get(&comp.nodes[0]).copied().unwrap_or(0.0);
                    let vb = node_voltages.get(&comp.nodes[1]).copied().unwrap_or(0.0);
                    let r = parse_value(&comp.value).unwrap_or(1.0);
                    let current = (va-vb) / r;
                    branch_currents.insert(comp.id.clone(), current);
                    power.insert(comp.id.clone(), current * current *r);
                }
            }
            _ => {}
        }
    }
    SimResult {
        solved: true,
        error: None,
        node_voltages,
        branch_currents,
        power,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn approx(a:f64, b:f64) -> bool {
        (a-b).abs() < 1e-6
    }
    fn make_netlist(components: Vec<(&str, &str, &str, Vec<&str>)>, gnd: &str) -> Netlist{
        Netlist {
            components: components.into_iter()
                .map(|(id, kind, value, nodes)| NetlistComponent {
                    id: id.to_string(),
                    kind: kind.to_string(),
                    value: value.to_string(),
                    nodes: nodes.into_iter().map(|n| n.to_string()).collect(),
                })
                .collect(),
            ground_node: gnd.to_string(),
        }
    }
    #[test]
    fn test_simple_resistor_divider() {
        // v1 = 10v between n1 and gnd
        // r1 = 1k between n1 and n2
        // r2 = 1k between n2 and gnd
        let netlist = make_netlist(vec![
            ("V1", "voltage_source", "10", vec!["n1", "gnd"]),
            ("R1", "resistor", "1k", vec!["n1", "n2"]),
            ("R2", "resistor", "1k", vec!["n2", "gnd"]),
        ], "gnd");
        let result = solve_dc(&netlist);
        assert!(result.solved, "Solver failed: {:?}", result.error);
        let v_n1 = result.node_voltages["n1"];
        let v_n2 = result.node_voltages["n2"];
        assert!(approx(v_n1, 10.0), "V(n1) = {}, expected 10V", v_n1);
        assert!(approx(v_n2, 5.0),  "V(n2) = {}, expected 5V",  v_n2);
    }
    #[test]
    fn test_single_resistor() {
        let netlist = make_netlist(vec![
            ("V1", "voltage_source", "5", vec!["n1", "gnd"]),
            ("R1", "resistor", "500", vec!["n1", "gnd"]),
        ], "gnd");
 
        let result = solve_dc(&netlist);
        assert!(result.solved);
        assert!(approx(result.node_voltages["n1"], 5.0));
        let i = result.branch_currents.get("R1").copied().unwrap_or(0.0);
        assert!(approx(i.abs(), 0.01), "I(R1) = {}, expected 10mA", i);
    }
    #[test]
    fn test_current_source() {
        let netlist = make_netlist(vec![
            ("I1", "current_source", "2m", vec!["n1", "gnd"]),
            ("R1", "resistor", "1k", vec!["n1", "gnd"]),
        ], "gnd");
 
        let result = solve_dc(&netlist);
        assert!(result.solved, "{:?}", result.error);
        let v = result.node_voltages["n1"];
        assert!(approx(v, 2.0), "V(n1) = {}, expected 2V", v);
    }
 
    #[test]
    fn test_parallel_resistors() {
        let netlist = make_netlist(vec![
            ("V1", "voltage_source", "6", vec!["n1", "gnd"]),
            ("R1", "resistor", "2k", vec!["n1", "gnd"]),
            ("R2", "resistor", "3k", vec!["n1", "gnd"]),
        ], "gnd");
 
        let result = solve_dc(&netlist);
        assert!(result.solved);
        assert!(approx(result.node_voltages["n1"], 6.0));
    }
 
    #[test]
    fn test_no_components_returns_error() {
        let netlist = make_netlist(vec![], "gnd");
        let result = solve_dc(&netlist);
        assert!(!result.solved);
        assert!(result.error.is_some());
    }
}