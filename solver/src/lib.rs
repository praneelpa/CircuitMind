use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

mod matrix;
mod components;
mod mna;

use mna::{Netlist, solve_dc};

#[derive(Deserialize)]
struct JsNetlistComponent {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    value: String,
    nodes: Vec<String>,
}

#[derive(Deserialize)]
struct JsNetlist {
    components: Vec<JsNetlistComponent>,
    #[serde(rename = "groundNode")]
    ground_node: String,
}

#[derive(Serialize)]
struct JsSimResult {
    solved: bool,
    error: Option<String>,
    #[serde(rename = "nodeVoltages")]
    node_voltages: HashMap<String, f64>,
    #[serde(rename = "branchCurrents")]
    branch_currents: HashMap<String, f64>,
    power: HashMap<String, f64>,
}
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn solve(netlist_json: &str) -> String {
    let js_netlist: JsNetlist = match serde_json::from_str(netlist_json) {
        Ok(n) => n,
        Err(e) => {
            let err = JsSimResult {
                solved: false,
                error: Some(format!("Failed to parse netlist: {}", e)),
                node_voltages: HashMap::new(),
                branch_currents: HashMap::new(),
                power: HashMap::new(),
            };
            return serde_json::to_string(&err).unwrap_or_default();
        }
    };
    let netlist = Netlist {
        components: js_netlist
            .components
            .into_iter()
            .map(|c| mna::NetlistComponent {
                id: c.id,
                kind: c.kind,
                value: c.value,
                nodes: c.nodes,
            })
            .collect(),
        ground_node: js_netlist.ground_node,
    };
    let result = solve_dc(&netlist);
    let js_result = JsSimResult {
        solved: result.solved,
        error: result.error,
        node_voltages: result.node_voltages,
        branch_currents: result.branch_currents,
        power: result.power,
    };
    serde_json::to_string(&js_result).unwrap_or_else(|e| {
        format!("{{\"solved\":false,\"error\":\"Serialization error: {}\"}}", e)
    })
}
#[wasm_bindgen]
pub fn validate_value(value: &str) -> String {
    match components::parse_value(value) {
        Ok(_) => String::new(),
        Err(e) => e,
    }
}
#[wasm_bindgen]
pub fn version() -> String {
    "CircuitMind Solver v0.1.0 (MNA/DC)".to_string()
}