export const PWM_MAX = 255;

export const DEFAULT_SETTINGS = Object.freeze({
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
  motorInvert: Object.freeze({
    frontLeft: false,
    frontRight: false,
    rearLeft: false,
    rearRight: false
  })
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clamp1(value) {
  return clamp(value, -1, 1);
}

function cleanZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeSignedPercent(value) {
  return clamp(Number(value) || 0, -100, 100) / 100;
}

function normalizePercent(value, fallback) {
  return clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, 0, 100);
}

export function cloneSettings(settings = DEFAULT_SETTINGS) {
  return {
    motorsEnabled: Boolean(settings.motorsEnabled),
    maxSpeed: normalizePercent(settings.maxSpeed, DEFAULT_SETTINGS.maxSpeed),
    maxYaw: normalizePercent(settings.maxYaw, DEFAULT_SETTINGS.maxYaw),
    deadzone: clamp(normalizePercent(settings.deadzone, DEFAULT_SETTINGS.deadzone), 0, 40),
    expo: normalizePercent(settings.expo, DEFAULT_SETTINGS.expo),
    minPwm: normalizePercent(settings.minPwm, DEFAULT_SETTINGS.minPwm),
    mixMode: Number(settings.mixMode) === 1 ? 1 : 0,
    invertX: Boolean(settings.invertX),
    invertY: Boolean(settings.invertY),
    invertR: Boolean(settings.invertR),
    motorInvert: {
      frontLeft: Boolean(settings.motorInvert?.frontLeft),
      frontRight: Boolean(settings.motorInvert?.frontRight),
      rearLeft: Boolean(settings.motorInvert?.rearLeft),
      rearRight: Boolean(settings.motorInvert?.rearRight)
    }
  };
}

export function rotate90CW(x, y) {
  return {
    x: cleanZero(y),
    y: cleanZero(-x)
  };
}

export function applyDeadzone(value, deadzone) {
  const absolute = Math.abs(value);
  if (absolute <= deadzone) {
    return 0;
  }

  const direction = value < 0 ? -1 : 1;
  const scaled = (absolute - deadzone) / (1 - deadzone);
  return direction * scaled;
}

export function applyExpo(value, expoAmount) {
  return (1 - expoAmount) * value + expoAmount * value * value * value;
}

function normalizeWheelMix(mix) {
  const maxMagnitude = Math.max(
    Math.abs(mix.frontLeft),
    Math.abs(mix.frontRight),
    Math.abs(mix.rearLeft),
    Math.abs(mix.rearRight)
  );

  if (maxMagnitude <= 1) {
    return mix;
  }

  return {
    frontLeft: mix.frontLeft / maxMagnitude,
    frontRight: mix.frontRight / maxMagnitude,
    rearLeft: mix.rearLeft / maxMagnitude,
    rearRight: mix.rearRight / maxMagnitude
  };
}

export function mixStandard(x, y, rot) {
  return normalizeWheelMix({
    frontLeft: y + x + rot,
    frontRight: y - x - rot,
    rearLeft: y - x + rot,
    rearRight: y + x - rot
  });
}

export function mixAlt(lx, ly, rx, ry) {
  return normalizeWheelMix({
    frontRight: ly + lx + ry - rx,
    frontLeft: ly - lx + ry + rx,
    rearRight: ly - lx + ry - rx,
    rearLeft: ly + lx + ry + rx
  });
}

export function applyMinPwm(value, minPwmPercent, motorsEnabled = true, invert = false) {
  if (!motorsEnabled) {
    return 0;
  }

  let output = invert ? -value : value;
  output = clamp1(output);

  const magnitude = Math.abs(output);
  let duty = Math.trunc(magnitude * PWM_MAX);
  if (magnitude > 0.001) {
    const minDuty = Math.trunc((clamp(minPwmPercent, 0, 100) / 100) * PWM_MAX);
    if (duty < minDuty) {
      duty = minDuty;
    }
  }

  return output >= 0 ? duty : -duty;
}

export function logicalAxesFromJoysticks(joysticks, settings) {
  const move = {
    x: normalizeSignedPercent(joysticks?.move?.x),
    y: normalizeSignedPercent(joysticks?.move?.y)
  };
  const rotate = {
    x: normalizeSignedPercent(joysticks?.rotate?.x),
    y: normalizeSignedPercent(joysticks?.rotate?.y)
  };

  const moveRotated = rotate90CW(move.x, move.y);
  const rotateRotated = rotate90CW(rotate.x, rotate.y);

  let x = moveRotated.x;
  let y = moveRotated.y;
  let rx = rotateRotated.x;
  let ry = rotateRotated.y;

  if (settings.invertX) {
    x = -x;
  }
  if (settings.invertY) {
    y = -y;
  }
  if (settings.invertR) {
    rx = -rx;
  }

  return {
    x: cleanZero(x),
    y: cleanZero(y),
    rx: cleanZero(rx),
    ry: cleanZero(ry)
  };
}

export function computeFromRawAxes(rawAxes, settingsInput = DEFAULT_SETTINGS) {
  const settings = cloneSettings(settingsInput);
  const raw = {
    x: cleanZero(clamp1(Number(rawAxes?.x) || 0)),
    y: cleanZero(clamp1(Number(rawAxes?.y) || 0)),
    rx: cleanZero(clamp1(Number(rawAxes?.rx) || 0)),
    ry: cleanZero(clamp1(Number(rawAxes?.ry) || 0))
  };

  const deadzone = settings.deadzone / 100;
  const deadzonedAxes = {
    x: applyDeadzone(raw.x, deadzone),
    y: applyDeadzone(raw.y, deadzone),
    rx: applyDeadzone(raw.rx, deadzone),
    ry: applyDeadzone(raw.ry, deadzone)
  };

  const expo = settings.expo / 100;
  const speed = settings.maxSpeed / 100;
  const yaw = settings.maxYaw / 100;
  const processedAxes = {
    x: applyExpo(deadzonedAxes.x, expo) * speed,
    y: applyExpo(deadzonedAxes.y, expo) * speed,
    rx: applyExpo(deadzonedAxes.rx, expo) * yaw,
    ry: applyExpo(deadzonedAxes.ry, expo) * yaw
  };

  const mixedValues = settings.mixMode === 0
    ? mixStandard(processedAxes.x, processedAxes.y, processedAxes.rx)
    : mixAlt(processedAxes.x, processedAxes.y, processedAxes.rx, processedAxes.ry);

  const wheels = {
    frontLeft: applyMinPwm(mixedValues.frontLeft, settings.minPwm, settings.motorsEnabled, settings.motorInvert.frontLeft),
    frontRight: applyMinPwm(mixedValues.frontRight, settings.minPwm, settings.motorsEnabled, settings.motorInvert.frontRight),
    rearLeft: applyMinPwm(mixedValues.rearLeft, settings.minPwm, settings.motorsEnabled, settings.motorInvert.rearLeft),
    rearRight: applyMinPwm(mixedValues.rearRight, settings.minPwm, settings.motorsEnabled, settings.motorInvert.rearRight)
  };

  return {
    rawAxes: raw,
    deadzonedAxes,
    processedAxes,
    mixedValues,
    wheels
  };
}

export function computeSimulation(state) {
  const settings = cloneSettings(state?.settings ?? DEFAULT_SETTINGS);
  const rawAxes = logicalAxesFromJoysticks(state?.joysticks, settings);
  const derived = computeFromRawAxes(rawAxes, settings);

  return {
    ...derived,
    rawAxes,
    settings
  };
}
