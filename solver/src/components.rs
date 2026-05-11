// solver/src/components.rs
// MNA stamp functions for each component type
// each function adds the component's contribution into the G matrix and I vector.
// MNA eq: G * x = I
// x [v1, v2, ... ,vn, i_v1, i_v2 ,....] (node voltages + branch currents)
// G = conductance / stamp matrix
// I = current source vector
// nodes are 0 indexed, node 0 = gnd
// use n-1 rows/cols for n nodes (gnd not counted)

use crate::matrix::Matrix;
// stamp a resistor between node a and node b with resistance R
// adds conductance G = 1/R into the G matrix
pub fn stamp_resistor(
    g: &mut Matrix,
    node_a: Option<usize>,
    node_b: Option<usize>,
    resistance:f64,
) {
    if resistance <= 0.0 {return;}
    let conductance = 1.0 / resistance;
    // stamp : +G at (a,a), -G at (a.,b), -G at (b,a), +G at (b,b)
    if let Some(a) = node_a {
        g.add(a,a,conductance);
        if let Some(b)=node_b {
            g.add(a,b,-conductance);
        }
    }
    if let Some(b) = node_b {
        g.add(b,b,conductance);
        if let Some(a) = node_a {
            g.add(b,a,-conductance);
        }
    }
}
// stamp a capacitor between node a and node b
// in DC, caps are open circuits (infinite impedance)
// in AC, at freq f, impedance = 1/(j*2*pi*f*C).
pub fn stamp_capacitor(
    g: &mut Matrix,
    node_a: Option<usize>,
    node_b: Option<usize>,
    _capacitance: f64,
    is_ac:bool,
    freq: f64,
) {
    if is_ac && freq > 0.0 {
        stamp_resistor(g,node_a,node_b,1e12);
    } else {
        stamp_resistor(g,node_a,node_b,1e12);
    }
}
// stamp an inductor between node a and node b
// in DC, inductors are short circuits
pub fn stamp_inductor(
    g: &mut Matrix,
    i_vec: &mut Vec<f64>,
    node_a: Option<usize>,
    node_b: Option<usize>,
    _inductance: f64,
    branch_idx: usize,
) {
    stamp_voltage_source(g,i_vec,node_a,node_b,0.0,branch_idx);
}
// stamp an indp voltage source between pos and neg
// require an extra row/cal in mna
pub fn stamp_voltage_source(
    g: &mut Matrix,
    i_vec: &mut Vec<f64>,
    node_pos: Option<usize>,
    node_neg: Option<usize>,
    voltage: f64,
    branch_idx: usize,
) {
    let n = i_vec.len();
    let bi = branch_idx;
    if let Some(p) = node_pos {
        g.add(bi,p,1.0);
        g.add(p,bi,1.0);
    }
    if let Some(neg)=node_neg {
        g.add(bi,neg,-1.0);
        g.add(neg,bi,-1.0);
    }
    if bi < n {
        i_vec[bi] += voltage;
    }
}
// stamp an indp current surce from neg to pos (conventional flow)
// go directly into I vector
pub fn stamp_current_source(
    i_vec: &mut Vec<f64>,
    node_pos: Option<usize>,
    node_neg: Option<usize>,
    current: f64,
) {
    if let Some(p) = node_pos {
        if p < i_vec.len() {
            i_vec[p] += current;
        }
    }
    if let Some(neg) = node_neg {
        if neg < i_vec.len() {
            i_vec[neg] -= current;
        }
    }
}
// stamp a diode using linearized model (small sig approx)
// nonlinear resistor; for DC operating point use piecewise linear model
pub fn stamp_diode(
    g: &mut Matrix,
    node_anode: Option<usize>,
    node_cathode: Option<usize>,
    v_across: f64,
) {
    let is = 1e-14f64;
    let vt = 0.02585f64;
    let vd = v_across.min(0.7); // clamp
    let gd = (is / vt) * (vd/vt).exp();
    let gd = gd.max(1e-12).min(1e6);
    let id = is * ((vd/vt).exp() - 1.0); // shockley
    let ieq = id -gd*vd;

    stamp_resistor(g,node_anode,node_cathode,1.0/gd);
    stamp_current_source(
        &mut vec![0.0;g.rows],
        node_anode,
        node_cathode,
        ieq,
    );
}
pub fn parse_value(s:&str) -> Result<f64,String> {
    let s=s.trim();
    if s.is_empty() {return Err("Empty value".to_string());}
    let split_idx = s.char_indices().find(|(_,c)|c.is_alphabetic()).map(|(i,_)|i).unwrap_or(s.len());
    let num_str = &s[..split_idx];
    let suffix = &s[split_idx..];
    let base: f64 = num_str.parse().map_err(|_| format!("Cannot parse '{}' as a number", num_str))?;
    let multiplier = match suffix.to_lowercase().as_str() {
        "t" => 1e12,
        "g" => 1e9,
        "meg" | "x" => 1e6,
        "k" => 1e3,
        "" | "v" | "a" | "f" | "h" | "ohm" | "ω" => 1.0,
        "m" => 1e-3,
        "u" | "µ" => 1e-6,
        "n" => 1e-9,
        "p" => 1e-12,
        other => return Err(format!("Unknown suffix '{}'", other)),
    };
    Ok(base*multiplier)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_parse_value() {
        assert!((parse_value("1k").unwrap()-1000.0).abs() < 1e-9);
        assert!((parse_value("4.7n").unwrap()-4.7e-9).abs() < 1e-18);
        assert!((parse_value("100m").unwrap()-0.1).abs() < 1e-9);
        assert!((parse_value("5").unwrap()-5.0).abs() < 1e-9);
        assert!((parse_value("2.2u").unwrap()-2.2e-6).abs() < 1e-15);
        assert!(parse_value("abc").is_err());
    }
    #[test]
    fn test_stamp_resistor_diagonal() {
        let mut g = Matrix::zeros(2,2);
        stamp_resistor(&mut g, Some(0), Some(1), 1000.0);
        let c = 1.0 / 1000.0;
        assert!((g.get(0,0) - c).abs() < 1e-15);
        assert!((g.get(1,1) - c).abs() < 1e-15);
        assert!((g.get(0,1) + c).abs() < 1e-15);
        assert!((g.get(1,0) + c).abs() < 1e-15);
    }
    #[test]
    fn test_stamp_resistor_to_ground() {
        let mut g = Matrix::zeros(2,2);
        stamp_resistor(&mut g, Some(0), None, 500.0);
        let c = 1.0 / 500.0;
        assert!((g.get(0,0) - c).abs() < 1e-15);
        assert!((g.get(0,1)).abs() < 1e-15);
    }
}
