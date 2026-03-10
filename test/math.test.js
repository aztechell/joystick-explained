import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SETTINGS,
  applyDeadzone,
  applyExpo,
  applyMinPwm,
  cloneSettings,
  computeFromRawAxes,
  computeSimulation,
  mixAlt,
  mixStandard,
  rotate90CW
} from "../js/math.js";

function assertApproxObject(actual, expected, epsilon = 1e-9) {
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < epsilon, `${key}: expected ${expected[key]}, got ${actual[key]}`);
  }
}

test("defaults match the firmware values", () => {
  assert.deepEqual(cloneSettings(DEFAULT_SETTINGS), {
    motorsEnabled: true,
    maxSpeed: 100,
    maxYaw: 100,
    deadzone: 5,
    expo: 20,
    minPwm: 10,
    mixMode: 0,
    invertX: true,
    invertY: true,
    invertR: true,
    motorInvert: {
      frontLeft: false,
      frontRight: false,
      rearLeft: false,
      rearRight: false
    }
  });
});

test("rotate90CW mirrors the sketch helper", () => {
  assert.deepEqual(rotate90CW(0.25, -0.5), { x: -0.5, y: -0.25 });
});

test("deadzone trims the center and rescales the outside", () => {
  assert.equal(applyDeadzone(0.04, 0.05), 0);
  assert.equal(applyDeadzone(-0.04, 0.05), 0);
  assert.equal(applyDeadzone(0.05, 0.05), 0);
  assert.ok(Math.abs(applyDeadzone(0.525, 0.05) - 0.5) < 1e-9);
});

test("expo blends linear and cubic response", () => {
  const result = applyExpo(0.5, 0.2);
  assert.ok(Math.abs(result - 0.425) < 1e-9);
});

test("standard mix uses x y and rx like the sketch", () => {
  const result = mixStandard(0.2, 0.3, -0.1);
  assertApproxObject(result, {
    frontLeft: 0.4,
    frontRight: 0.2,
    rearLeft: 0,
    rearRight: 0.6
  });
});

test("alt mix uses all four axes and normalizes when needed", () => {
  const result = mixAlt(0.7, 0.8, 0.5, 0.6);
  assertApproxObject(result, {
    frontLeft: 0.46153846153846156,
    frontRight: 0.6153846153846154,
    rearLeft: 1,
    rearRight: 0.07692307692307694
  });
});

test("applyMinPwm floors non-zero duty and keeps the sign", () => {
  assert.equal(applyMinPwm(0.02, 10, true, false), 25);
  assert.equal(applyMinPwm(-0.02, 10, true, false), -25);
  assert.equal(applyMinPwm(0, 10, true, false), 0);
});

test("motors disabled forces all wheel outputs to zero", () => {
  const result = computeFromRawAxes(
    { x: 0.3, y: -0.4, rx: 0.2, ry: 0.1 },
    { ...DEFAULT_SETTINGS, motorsEnabled: false }
  );

  assert.deepEqual(result.wheels, {
    frontLeft: 0,
    frontRight: 0,
    rearLeft: 0,
    rearRight: 0
  });
});

test("wheel outputs normalize before pwm conversion", () => {
  const result = computeFromRawAxes(
    { x: 1, y: 1, rx: 1, ry: 0 },
    { ...DEFAULT_SETTINGS, deadzone: 0, expo: 0, minPwm: 0 }
  );

  assert.deepEqual(result.mixedValues, {
    frontLeft: 1,
    frontRight: -0.3333333333333333,
    rearLeft: 0.3333333333333333,
    rearRight: 0.3333333333333333
  });
  assert.deepEqual(result.wheels, {
    frontLeft: 255,
    frontRight: -85,
    rearLeft: 85,
    rearRight: 85
  });
});

test("computeSimulation preserves the invertR asymmetry from the sketch", () => {
  const result = computeSimulation({
    joysticks: {
      move: { x: 0, y: 0 },
      rotate: { x: 10, y: 20 }
    },
    settings: { ...DEFAULT_SETTINGS, deadzone: 0, expo: 0, minPwm: 0 }
  });

  assert.deepEqual(result.rawAxes, {
    x: 0,
    y: 0,
    rx: -0.2,
    ry: -0.1
  });
});
