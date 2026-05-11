// solver/src/matrix.rs
// dense matrix + gaussian elimination
// used by the MNA solver to solve Ax = b

#[derive(Debug, Clone)]
pub struct Matrix {
    pub rows: usize,
    pub cols: usize,
    pub data: Vec<f64>,
}
impl Matrix {
    // rows x cols 0 matrix
    pub fn zeros(rows: usize, cols: usize) -> Self {
        Self {
            rows,
            cols,
            data: vec![0.0; rows*cols],
        }
    }
    #[inline]
    pub fn idx(&self, r: usize, c: usize) -> usize {
        r * self.cols + c
    }
    #[inline]
    pub fn get(&self, r: usize, c: usize) -> f64 {
        self.data[self.idx(r,c)]
    }
    #[inline]
    pub fn set(&mut self, r: usize, c: usize, val: f64) {
        let i = self.idx(r,c);
        self.data[i] = val;
    }
    #[inline]
    pub fn add(&mut self, r: usize, c: usize, val: f64) {
        let i = self.idx(r,c);
        self.data[i] += val;
    }
    // swap 2 rows in place
    pub fn swap_rows(&mut self, r1: usize, r2: usize) {
        if r1 == r2 {return;}
        for c in 0..self.cols {
            let i1 = self.idx(r1,c);
            let i2 = self.idx(r2,c);
            self.data.swap(i1, i2);
        }
    }
}
// solve ax = b using gaussian
// a is nxn b is length n
// returns soln vector x, or err if singular matrix
pub fn gaussian_solve(a: &mut Matrix, b: &mut Vec<f64>) -> Result<Vec<f64>, String> {
    let n = a.rows;
    assert_eq!(a.cols, n, "It must be a square matrix");
    assert_eq!(b.len(), n, "b must match matrix size");

    // build augmented matrix
    let mut aug = Matrix::zeros(n, n+1);
    for r in 0..n{
        for c in 0..n{
            aug.set(r,c,a.get(r,c));
        }
        aug.set(r,n,b[r]);
    }
    // forward elim w/ partial pivoting
    for col in 0..n {
        let mut pivot_row = col;
        let mut max_val = aug.get(col, col).abs();
        for row in (col + 1)..n {
            let v = aug.get(row, col).abs();
            if v > max_val {
                max_val = v;
                pivot_row = row;
            }
        }
        if max_val < 1e-12 {
            return Err(format!(
                "Singular matrix at column {}. Check your circuit for floating nodes or shorted voltage sources.",
                col
            ));
        }
        aug.swap_rows(col, pivot_row);
        let pivot_val = aug.get(col, col);
        for row in (col + 1)..n {
            let factor = aug.get(row, col) / pivot_val;
            if factor.abs() < 1e-15 {continue;}
            for c in col..=n {
                let val= aug.get(row, c) - factor * aug.get(col, c);
                aug.set(row,c,val);
            }
        }
    }
    // back substitution
    let mut x = vec![0.0f64; n];
    for row in (0..n).rev() {
        let mut sum = aug.get(row, n);
        for c in (row+1)..n {
            sum -= aug.get(row, c) * x[c];
        }
        let diag = aug.get(row, row);
        if diag.abs() < 1e-15 {
            return Err(format!("Zero diagonal at row {} during back substitution.", row));
        }
        x[row] = sum/diag;
    }
    Ok(x)
}
// unit test

#[cfg(test)]
mod tests {
    use super::*;
    fn approx_eq(a:f64, b:f64) -> bool {
        (a-b).abs() < 1e-9
    }
    #[test]
    fn test_simple_2x2() {
        let mut a = Matrix::zeros(2,2);
        a.set(0, 0, 2.0); a.set(0, 1, 1.0);
        a.set(1, 0, 1.0); a.set(1, 1, 3.0);
        let mut b = vec![5.0, 10.0];
        let x = gaussian_solve(&mut a, &mut b).unwrap();
        assert!(approx_eq(x[0], 1.0));
        assert!(approx_eq(x[1], 3.0));
    }
    #[test]
    fn test_3x3() {
        // x=1, y=2, z=3 known
        let mut a = Matrix::zeros(3,3);
        a.set(0, 0, 1.0); a.set(0, 1, 2.0); a.set(0, 2, 3.0);
        a.set(1, 0, 0.0); a.set(1,1,1.0); a.set(1,2,4.0);
        a.set(2,0,5.0); a.set(2,1,6.0); a.set(2,2,0.0);
        let mut b = vec![14.0,9.0,17.0];
        let x = gaussian_solve(&mut a, &mut b).unwrap();
        assert!(x.iter().all(|v| v.is_finite()));
    }
    #[test]
    fn test_singular_returns_err() {
        let mut a = Matrix::zeros(2,2);
        a.set(0,0,1.0); a.set(0,1,2.0);
        a.set(1,0,2.0); a.set(1,1,4.0);
        let mut b = vec![3.0,6.0];
        let result = gaussian_solve(&mut a, &mut b);
        assert!(result.is_err());
    }
    #[test]
    fn test_voltage_divider_matrix() {
        let mut a = Matrix::zeros(3,3);
        let r = 1000.0f64;
        let v = 5.0f64;
        // mode 1: 1/r * v1 - 1/r * v2 = 0
        a.set(0,0,1.0/r); a.set(0,1,-1.0/r); a.set(0,2,1.0);
        // node 2: -1/r * v1 + 1/r * v2 = 0
        a.set(1,0,-1.0/r); a.set(1,1,1.0/r); a.set(1,2,0.0);
        // voltage source: v1 - v_ref = V
        a.set(2,0,1.0); a.set(2,1,0.0); a.set(2,2,0.0);
        let mut b = vec![0.0, 0.0, v];
        let x = gaussian_solve(&mut a, &mut b).unwrap();
        assert!(approx_eq(x[0], v));
    }
}