import {
  DEFAULT_SETTINGS,
  PWM_MAX,
  cloneSettings,
  computeFromRawAxes,
  computeSimulation,
  rotate90CW
} from "./math.js";
import { createInitialState, resetSettings, saveSettings } from "./state.js";

const WHEEL_META = [
  { key: "frontLeft", label: "Front Left", color: "#e76f51" },
  { key: "frontRight", label: "Front Right", color: "#2a9d8f" },
  { key: "rearLeft", label: "Rear Left", color: "#577590" },
  { key: "rearRight", label: "Rear Right", color: "#f4a261" }
];
const CHART_GRID_DIVISIONS = 10;

const AXIS_META = {
  x: { label: "Move X", scaleSetting: "maxSpeed" },
  y: { label: "Move Y", scaleSetting: "maxSpeed" },
  rx: { label: "Rotate X", scaleSetting: "maxYaw" },
  ry: { label: "Rotate Y", scaleSetting: "maxYaw" }
};

const state = createInitialState();
let selectedAxis = "x";
let renderQueued = false;
const visibleWheelLines = Object.fromEntries(WHEEL_META.map((wheel) => [wheel.key, true]));

const dom = {
  joystickPads: {
    move: document.querySelector('[data-joystick="move"]'),
    rotate: document.querySelector('[data-joystick="rotate"]')
  },
  rawReadouts: {
    "move-x": document.querySelector('[data-raw-readout="move-x"]'),
    "move-y": document.querySelector('[data-raw-readout="move-y"]'),
    "rotate-x": document.querySelector('[data-raw-readout="rotate-x"]'),
    "rotate-y": document.querySelector('[data-raw-readout="rotate-y"]')
  },
  wheelValues: Object.fromEntries(
    WHEEL_META.map((wheel) => [wheel.key, document.querySelector(`[data-wheel-value="${wheel.key}"]`)])
  ),
  wheelNodes: Object.fromEntries(
    WHEEL_META.map((wheel) => [wheel.key, document.querySelector(`[data-wheel="${wheel.key}"]`)])
  ),
  mixModeLabel: document.querySelector("[data-mix-mode-label]"),
  axisButtons: [...document.querySelectorAll("[data-axis]")],
  wheelToggleButtons: Object.fromEntries(
    WHEEL_META.map((wheel) => [wheel.key, document.querySelector(`[data-wheel-toggle="${wheel.key}"]`)])
  ),
  wheelCanvas: document.querySelector("#wheel-curve"),
  axisMeaningLabels: {
    wheelX: document.querySelector('[data-axis-label="wheel-x"]'),
    wheelY: document.querySelector('[data-axis-label="wheel-y"]')
  },
  settingsForm: document.querySelector("#settings-form"),
  settingsInputs: Object.fromEntries(
    [
      "motorsEnabled",
      "maxSpeed",
      "maxYaw",
      "deadzone",
      "expo",
      "minPwm",
      "mixMode",
      "invertX",
      "invertY",
      "invertR"
    ].map((key) => [key, document.querySelector(`[data-setting="${key}"]`)])
  ),
  motorInputs: Object.fromEntries(
    ["frontLeft", "frontRight", "rearLeft", "rearRight"].map((key) => [key, document.querySelector(`[data-motor-setting="${key}"]`)])
  ),
  outputs: Object.fromEntries(
    ["maxSpeed", "maxYaw", "deadzone", "expo", "minPwm"].map((key) => [key, document.querySelector(`[data-output="${key}"]`)])
  ),
  resetButton: document.querySelector("#reset-settings")
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatSigned(value) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function queueRender() {
  if (renderQueued) {
    return;
  }

  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  state.derived = computeSimulation({
    ...state,
    joysticks: {
      move: rotateJoystickForSimulation(state.joysticks.move),
      rotate: rotateJoystickForSimulation(state.joysticks.rotate)
    }
  });

  renderJoysticks();
  renderRobot();
  renderAxisPicker();
  renderWheelToggles();
  renderSettings();
  drawWheelCurve();
}

function rotateJoystickForSimulation(joystick) {
  const rotated = rotate90CW((joystick?.x ?? 0) / 100, (joystick?.y ?? 0) / 100);
  return {
    x: rotated.x * 100,
    y: rotated.y * 100
  };
}

function setJoystick(name, nextPosition) {
  state.joysticks[name] = {
    x: clamp(Math.round(nextPosition.x), -100, 100),
    y: clamp(Math.round(nextPosition.y), -100, 100)
  };
  queueRender();
}

function updateSettings(mutator) {
  const nextSettings = cloneSettings(state.settings);
  mutator(nextSettings);
  state.settings = cloneSettings(nextSettings);
  saveSettings(state.settings);
  queueRender();
}

function updateJoystickPadPosition(pad, position) {
  const knob = pad.querySelector(".joystick-pad__knob");
  const maxOffset = (pad.clientWidth - knob.offsetWidth) / 2 - 6;
  const x = (position.x / 100) * maxOffset;
  const y = (-position.y / 100) * maxOffset;
  knob.style.left = `calc(50% + ${x}px)`;
  knob.style.top = `calc(50% + ${y}px)`;
}

function renderJoysticks() {
  updateJoystickPadPosition(dom.joystickPads.move, state.joysticks.move);
  updateJoystickPadPosition(dom.joystickPads.rotate, state.joysticks.rotate);

  dom.rawReadouts["move-x"].textContent = formatSigned(state.joysticks.move.x);
  dom.rawReadouts["move-y"].textContent = formatSigned(state.joysticks.move.y);
  dom.rawReadouts["rotate-x"].textContent = formatSigned(state.joysticks.rotate.x);
  dom.rawReadouts["rotate-y"].textContent = formatSigned(state.joysticks.rotate.y);
}

function renderRobot() {
  for (const wheel of WHEEL_META) {
    const value = state.derived.wheels[wheel.key];
    const wheelNode = dom.wheelNodes[wheel.key];
    dom.wheelValues[wheel.key].textContent = formatSigned(value);
    wheelNode.classList.toggle("is-forward", value > 0);
    wheelNode.classList.toggle("is-reverse", value < 0);
  }

  dom.mixModeLabel.textContent = state.settings.mixMode === 0 ? "Standard mix" : "Alt mix";
}

function renderAxisPicker() {
  for (const button of dom.axisButtons) {
    const isActive = button.dataset.axis === selectedAxis;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  dom.axisMeaningLabels.wheelX.textContent = `${AXIS_META[selectedAxis].label} raw input (-100 to 100)`;
  dom.axisMeaningLabels.wheelY.textContent = "Wheel PWM output (-255 to 255)";
}

function renderWheelToggles() {
  for (const wheel of WHEEL_META) {
    const button = dom.wheelToggleButtons[wheel.key];
    const isVisible = visibleWheelLines[wheel.key];
    button.classList.toggle("is-off", !isVisible);
    button.setAttribute("aria-pressed", String(isVisible));
  }
}

function renderSettings() {
  for (const [key, input] of Object.entries(dom.settingsInputs)) {
    if (!input) {
      continue;
    }

    const value = state.settings[key];
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = String(value);
    }
  }

  for (const [key, input] of Object.entries(dom.motorInputs)) {
    input.checked = state.settings.motorInvert[key];
  }

  dom.outputs.maxSpeed.textContent = `${state.settings.maxSpeed}%`;
  dom.outputs.maxYaw.textContent = `${state.settings.maxYaw}%`;
  dom.outputs.deadzone.textContent = `${state.settings.deadzone}%`;
  dom.outputs.expo.textContent = `${state.settings.expo}%`;
  dom.outputs.minPwm.textContent = `${state.settings.minPwm}%`;
}

function getJoystickPositionFromEvent(event, pad) {
  const rect = pad.getBoundingClientRect();
  const knob = pad.querySelector(".joystick-pad__knob");
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - knob.offsetWidth / 2 - 6);
  let dx = event.clientX - (rect.left + rect.width / 2);
  let dy = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance > radius) {
    const scale = radius / distance;
    dx *= scale;
    dy *= scale;
  }

  return {
    x: (dx / radius) * 100,
    y: (-dy / radius) * 100
  };
}

function installJoystick(pad, name) {
  let activePointerId = null;

  function releasePointer() {
    activePointerId = null;
    pad.classList.remove("is-active");
    setJoystick(name, { x: 0, y: 0 });
  }

  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activePointerId = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    pad.classList.add("is-active");
    setJoystick(name, getJoystickPositionFromEvent(event, pad));
  });

  pad.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    setJoystick(name, getJoystickPositionFromEvent(event, pad));
  });

  pad.addEventListener("pointerup", (event) => {
    if (event.pointerId !== activePointerId) {
      return;
    }
    releasePointer();
  });

  pad.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== activePointerId) {
      return;
    }
    releasePointer();
  });

  pad.addEventListener("lostpointercapture", () => {
    if (activePointerId === null) {
      return;
    }
    releasePointer();
  });
}

function initializeAxisPicker() {
  for (const button of dom.axisButtons) {
    button.addEventListener("click", () => {
      selectedAxis = button.dataset.axis;
      queueRender();
    });
  }
}

function initializeWheelToggles() {
  for (const wheel of WHEEL_META) {
    const button = dom.wheelToggleButtons[wheel.key];
    button.addEventListener("click", () => {
      visibleWheelLines[wheel.key] = !visibleWheelLines[wheel.key];
      queueRender();
    });
  }
}

function initializeSettings() {
  dom.settingsForm.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.dataset.setting) {
      const key = target.dataset.setting;
      updateSettings((next) => {
        next[key] = target.type === "checkbox" ? target.checked : Number(target.value);
      });
      return;
    }

    if (target.dataset.motorSetting) {
      const key = target.dataset.motorSetting;
      updateSettings((next) => {
        next.motorInvert[key] = target.checked;
      });
    }
  });

  dom.resetButton.addEventListener("click", () => {
    state.settings = resetSettings();
    queueRender();
  });
}

function resizeCanvas(canvas, cssHeight) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(canvas.clientWidth));
  const height = Math.max(320, Math.floor(canvas.clientHeight || cssHeight));

  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function mapX(value, width) {
  return ((value + 1) / 2) * width;
}

function mapY(value, min, max, height) {
  return height - ((value - min) / (max - min)) * height;
}

function drawChartBase(context, width, height, yMin, yMax) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.8)";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(29,44,36,0.08)";
  context.lineWidth = 1;
  for (let index = 0; index <= CHART_GRID_DIVISIONS; index += 1) {
    const x = (index / CHART_GRID_DIVISIONS) * width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let index = 0; index <= CHART_GRID_DIVISIONS; index += 1) {
    const y = (index / CHART_GRID_DIVISIONS) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const zeroX = mapX(0, width);
  const zeroY = mapY(0, yMin, yMax, height);
  context.strokeStyle = "rgba(29,44,36,0.3)";
  context.beginPath();
  context.moveTo(zeroX, 0);
  context.lineTo(zeroX, height);
  context.moveTo(0, zeroY);
  context.lineTo(width, zeroY);
  context.stroke();
}

function drawLine(context, samples, color, width, yMin, yMax, height) {
  context.beginPath();
  samples.forEach((sample, index) => {
    const x = mapX(sample.x, width);
    const y = mapY(sample.y, yMin, yMax, height);
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineJoin = "miter";
  context.lineCap = "butt";
  context.stroke();
}

function drawCurrentPoint(context, x, y, color, width, yMin, yMax, height) {
  context.beginPath();
  context.arc(mapX(x, width), mapY(y, yMin, yMax, height), 5, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.stroke();
}

function createWheelCurveSamples(axisKey) {
  const samplesByWheel = Object.fromEntries(WHEEL_META.map((wheel) => [wheel.key, []]));
  const baseAxes = state.derived.rawAxes;

  for (let index = 0; index <= 160; index += 1) {
    const input = -1 + (index / 160) * 2;
    const rawAxes = { ...baseAxes, [axisKey]: input };
    const sim = computeFromRawAxes(rawAxes, state.settings);

    for (const wheel of WHEEL_META) {
      samplesByWheel[wheel.key].push({
        x: input,
        y: sim.wheels[wheel.key] / PWM_MAX
      });
    }
  }

  return samplesByWheel;
}

function drawWheelCurve() {
  const squareSize = Math.max(260, Math.floor(dom.wheelCanvas.clientWidth));
  const { context, width, height } = resizeCanvas(dom.wheelCanvas, squareSize);
  drawChartBase(context, width, height, -1, 1);

  const samplesByWheel = createWheelCurveSamples(selectedAxis);
  const visibleWheels = WHEEL_META.filter((wheel) => visibleWheelLines[wheel.key]);

  if (visibleWheels.length === 0) {
    context.fillStyle = "#4d6255";
    context.font = "700 14px Trebuchet MS";
    context.textAlign = "center";
    context.fillText("Turn on at least one wheel below", width / 2, height / 2);
    context.textAlign = "start";
    return;
  }

  for (const wheel of visibleWheels) {
    drawLine(context, samplesByWheel[wheel.key], wheel.color, width, -1, 1, height);
  }

  const currentInput = state.derived.rawAxes[selectedAxis];
  for (const wheel of visibleWheels) {
    drawCurrentPoint(
      context,
      currentInput,
      state.derived.wheels[wheel.key] / PWM_MAX,
      wheel.color,
      width,
      -1,
      1,
      height
    );
  }
}

function initialize() {
  state.settings = cloneSettings(state.settings ?? DEFAULT_SETTINGS);
  initializeAxisPicker();
  initializeWheelToggles();
  initializeSettings();
  installJoystick(dom.joystickPads.move, "move");
  installJoystick(dom.joystickPads.rotate, "rotate");
  window.addEventListener("resize", queueRender);
  render();
}

initialize();
