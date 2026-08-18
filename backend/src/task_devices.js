const os = require('node:os');
const { machineIdSync } = require('node-machine-id');

let cachedCurrentDevice = null;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMatchText(value) {
  return normalizeText(value).toLocaleLowerCase();
}

function getCurrentTaskDevice() {
  if (cachedCurrentDevice) return { ...cachedCurrentDevice };

  let machineCode = '';
  try {
    machineCode = normalizeText(machineIdSync({ original: true }));
  } catch (error) {
    console.warn('[task-devices] failed to resolve machine code:', error);
  }

  const deviceName = normalizeText(os.hostname()) || 'Unknown device';
  cachedCurrentDevice = { machineCode, deviceName };
  return { ...cachedCurrentDevice };
}

function normalizeAppliedDevice(input = {}) {
  const machineCode = normalizeText(input?.machineCode);
  const deviceName = normalizeText(input?.deviceName);
  return machineCode || deviceName ? { machineCode, deviceName } : null;
}

function findAppliedDeviceMatch(devices, currentDevice) {
  const currentMachineCode = normalizeMatchText(currentDevice?.machineCode);
  const currentDeviceName = normalizeMatchText(currentDevice?.deviceName);
  const normalizedDevices = devices.map((device) => normalizeAppliedDevice(device));

  const fullIndex = normalizedDevices.findIndex((device) =>
    device &&
    currentMachineCode &&
    currentDeviceName &&
    normalizeMatchText(device.machineCode) === currentMachineCode &&
    normalizeMatchText(device.deviceName) === currentDeviceName
  );
  if (fullIndex >= 0) return fullIndex;

  const machineIndexes = normalizedDevices
    .map((device, index) => ({ device, index }))
    .filter(({ device }) => device && currentMachineCode && normalizeMatchText(device.machineCode) === currentMachineCode);
  if (machineIndexes.length === 1) return machineIndexes[0].index;

  const nameIndexes = normalizedDevices
    .map((device, index) => ({ device, index }))
    .filter(({ device }) => device && currentDeviceName && normalizeMatchText(device.deviceName) === currentDeviceName);
  return nameIndexes.length === 1 ? nameIndexes[0].index : -1;
}

function normalizeAppliedDevices(value) {
  if (!Array.isArray(value)) return [];
  const devices = [];
  const seen = new Set();

  for (const rawDevice of value) {
    const device = normalizeAppliedDevice(rawDevice);
    if (!device) continue;
    const key = `${normalizeMatchText(device.machineCode)}\u0000${normalizeMatchText(device.deviceName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    devices.push(device);
  }

  return devices;
}

function reconcileTaskDeviceState(task, currentDevice = getCurrentTaskDevice()) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return { enabled: false, changed: false, matched: false };
  }

  const previousDevices = Array.isArray(task.appliedDevices) ? task.appliedDevices : [];
  const devices = normalizeAppliedDevices(previousDevices);
  let changed = !Array.isArray(task.appliedDevices) || JSON.stringify(previousDevices) !== JSON.stringify(devices);
  const matchIndex = findAppliedDeviceMatch(devices, currentDevice);
  const matched = matchIndex >= 0;

  if (matched) {
    const resolvedDevice = normalizeAppliedDevice(currentDevice);
    if (resolvedDevice && JSON.stringify(devices[matchIndex]) !== JSON.stringify(resolvedDevice)) {
      devices[matchIndex] = resolvedDevice;
      changed = true;
    }
  }

  if (changed || !Array.isArray(task.appliedDevices)) {
    task.appliedDevices = devices;
  }

  task.enabled = matched;
  return { enabled: matched, changed, matched };
}

function setCurrentTaskDeviceEnabled(task, enabled, currentDevice = getCurrentTaskDevice()) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return { enabled: false, changed: false, matched: false };
  }

  const devices = normalizeAppliedDevices(task.appliedDevices);
  const matchIndex = findAppliedDeviceMatch(devices, currentDevice);
  const targetDevice = normalizeAppliedDevice(currentDevice);
  let changed = false;

  if (enabled && targetDevice) {
    if (matchIndex >= 0) {
      if (JSON.stringify(devices[matchIndex]) !== JSON.stringify(targetDevice)) {
        devices[matchIndex] = targetDevice;
        changed = true;
      }
    } else {
      devices.push(targetDevice);
      changed = true;
    }
  }

  if (!enabled && matchIndex >= 0) {
    devices.splice(matchIndex, 1);
    changed = true;
  }

  task.appliedDevices = devices;
  return reconcileTaskDeviceState(task, currentDevice);
}

function removeTaskAppliedDevice(task, device) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return { enabled: false, changed: false, matched: false };
  }

  const target = normalizeAppliedDevice(device);
  const devices = normalizeAppliedDevices(task.appliedDevices);
  const index = devices.findIndex((item) =>
    (target?.machineCode && normalizeMatchText(item.machineCode) === normalizeMatchText(target.machineCode)) ||
    (!target?.machineCode && target?.deviceName && normalizeMatchText(item.deviceName) === normalizeMatchText(target.deviceName))
  );

  if (index >= 0) devices.splice(index, 1);
  task.appliedDevices = devices;
  const state = reconcileTaskDeviceState(task);
  return { ...state, changed: state.changed || index >= 0 };
}

function reconcileTaskDeviceStates(tasks, currentDevice = getCurrentTaskDevice()) {
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return { changed: false };

  let changed = false;
  for (const task of Object.values(tasks)) {
    const result = reconcileTaskDeviceState(task, currentDevice);
    changed = changed || result.changed;
  }
  return { changed };
}

function serializeTasksForSharedStorage(tasks) {
  const storedTasks = {};
  const source = tasks && typeof tasks === 'object' && !Array.isArray(tasks) ? tasks : {};

  for (const [taskId, task] of Object.entries(source)) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) continue;
    const storedTask = { ...task, appliedDevices: normalizeAppliedDevices(task.appliedDevices), enabled: false };
    storedTasks[taskId] = storedTask;
  }

  return storedTasks;
}

module.exports = {
  getCurrentTaskDevice,
  reconcileTaskDeviceState,
  reconcileTaskDeviceStates,
  setCurrentTaskDeviceEnabled,
  removeTaskAppliedDevice,
  serializeTasksForSharedStorage,
};
