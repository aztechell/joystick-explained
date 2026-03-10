import { DEFAULT_SETTINGS, cloneSettings } from "./math.js";

export const STORAGE_KEY = "joystick-explained-settings-v1";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function createDefaultJoysticks() {
  return {
    move: { x: 0, y: 0 },
    rotate: { x: 0, y: 0 }
  };
}

export function loadSettings() {
  if (!hasStorage()) {
    return cloneSettings(DEFAULT_SETTINGS);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneSettings(DEFAULT_SETTINGS);
    }

    return cloneSettings(JSON.parse(raw));
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  if (!hasStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneSettings(settings)));
}

export function resetSettings() {
  if (hasStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return cloneSettings(DEFAULT_SETTINGS);
}

export function createInitialState() {
  return {
    joysticks: createDefaultJoysticks(),
    settings: loadSettings(),
    derived: null
  };
}
