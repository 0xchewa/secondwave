import assert from 'node:assert/strict';
import { SCENARIO_VERSION, SCENARIO_FEATURES } from './scenario-features.js';
import { FEATURES, TASK, FEATURE_VERSION, HORIZON } from './engine.js';
import { sigmoid } from '../early/sigmoid.js';
export type Row = {
  token: string;
  ts: number;
  x: number[];
  label: 0 | 1;
  outcome: string;
  deadline: number;
};
export type Model = {
  task: string;
  featureVersion: string;
  horizonSeconds: number;
  features: string[];
  mean: number[];
  scale: number[];
  weights: number[];
  calibration: { a: number; b: number };
};

export function compatible(m: Model) {
  const schema = m.featureVersion === SCENARIO_VERSION ? SCENARIO_FEATURES : FEATURES;
  return (
    m.task === TASK &&
    [FEATURE_VERSION, SCENARIO_VERSION].includes(m.featureVersion) &&
    m.horizonSeconds === HORIZON &&
    JSON.stringify(m.features) === JSON.stringify(schema) &&
    m.weights.length === schema.length + 1 &&
    m.mean.length === schema.length &&
    m.scale.length === schema.length &&
    [...m.weights, ...m.mean, ...m.scale, m.calibration.a, m.calibration.b].every(
      Number.isFinite,
    ) &&
    m.scale.every((s) => s > 0)
  );
}
export function raw(m: Model, x: number[]) {
  assert.ok(compatible(m), 'Incompatible Wave24 artifact');
  assert.ok(
    x.length === m.features.length && x.every(Number.isFinite),
    'Incompatible feature vector',
  );
  return (
    m.weights[0] + x.reduce((s, v, i) => s + ((v - m.mean[i]) / m.scale[i]) * m.weights[i + 1], 0)
  );
}
export function predict(m: Model, x: number[]) {
  return sigmoid(m.calibration.a * raw(m, x) + m.calibration.b);
}
