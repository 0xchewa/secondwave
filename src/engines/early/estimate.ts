// Serving correction from the MIT Early runtime. This remains an experimental estimate.
// Its release approval is separate from the calculation. See THIRD_PARTY_NOTICES.md.
export function modelEstimate(calibration: { a: number; b: number }, p: number) {
  const clipped = Math.max(1e-9, Math.min(1 - 1e-9, p));
  const z = calibration.a * Math.log(clipped / (1 - clipped)) + calibration.b;
  return 1 / (1 + Math.exp(-z));
}
