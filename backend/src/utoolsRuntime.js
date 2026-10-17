'use strict';

/**
 * uTools host compatibility boundary.
 *
 * The plugin ships native SQLite bindings for two verified uTools runtimes.
 * Runtime selection deliberately uses Node's module ABI instead of the human
 * readable uTools version: loading a mismatched .node file can terminate the
 * helper process before application-level recovery is possible.
 */
const UTOOLS_RUNTIME_PROFILES = Object.freeze({
  '110': Object.freeze({
    id: 'u7',
    major: 7,
    moduleAbi: '110',
    featureDescriptionKey: 'explain',
    nativeDirectory: 'u7',
    sqlitePackage: 'better-sqlite3-u7',
    supportsBrowserWindowOAuthFallback: true,
  }),
  '132': Object.freeze({
    id: 'u8',
    major: 8,
    moduleAbi: '132',
    featureDescriptionKey: 'description',
    nativeDirectory: 'u8',
    sqlitePackage: 'better-sqlite3-u8',
    supportsBrowserWindowOAuthFallback: false,
  }),
});

function normalizeModuleAbi(value) {
  return String(value ?? '').trim();
}

function getCurrentModuleAbi() {
  return normalizeModuleAbi(process.versions?.modules);
}

function getUtoolsRuntime(moduleAbi = getCurrentModuleAbi()) {
  return UTOOLS_RUNTIME_PROFILES[normalizeModuleAbi(moduleAbi)] || null;
}

function requireSupportedUtoolsRuntime(moduleAbi = getCurrentModuleAbi()) {
  const normalizedAbi = normalizeModuleAbi(moduleAbi);
  const runtime = getUtoolsRuntime(normalizedAbi);
  if (!runtime) {
    const error = new Error(`utools_runtime_unsupported:module_abi=${normalizedAbi || 'unknown'}`);
    error.code = 'utools_runtime_unsupported';
    error.moduleAbi = normalizedAbi;
    throw error;
  }
  return runtime;
}

function isUtools8OrLater(moduleAbi = getCurrentModuleAbi()) {
  const runtime = getUtoolsRuntime(moduleAbi);
  if (runtime) return runtime.major >= 8;
  const numericAbi = Number(normalizeModuleAbi(moduleAbi));
  // Unknown newer hosts should use the conservative v8 API surface. Native
  // SQLite still fails closed through requireSupportedUtoolsRuntime().
  return Number.isFinite(numericAbi) && numericAbi >= 132;
}

function setCompatibleFeatureDescription(feature = {}, value, moduleAbi = getCurrentModuleAbi()) {
  const runtime = getUtoolsRuntime(moduleAbi);
  const descriptionKey = runtime?.featureDescriptionKey || (isUtools8OrLater(moduleAbi) ? 'description' : 'explain');
  const next = { ...feature };
  delete next.explain;
  delete next.description;
  next[descriptionKey] = String(value ?? '');
  return next;
}

function getCompatibleFeatureDescription(feature = {}, moduleAbi = getCurrentModuleAbi()) {
  if (!feature || typeof feature !== 'object') return '';
  const runtime = getUtoolsRuntime(moduleAbi);
  const preferredKey = runtime?.featureDescriptionKey || (isUtools8OrLater(moduleAbi) ? 'description' : 'explain');
  const fallbackKey = preferredKey === 'description' ? 'explain' : 'description';
  const value = feature[preferredKey] ?? feature[fallbackKey] ?? '';
  return typeof value === 'string' ? value : String(value);
}

function createCompatibleWindowOptions(options = {}, { devTools = false, moduleAbi = getCurrentModuleAbi() } = {}) {
  const next = { ...options };
  const webPreferences = { ...(options.webPreferences || {}) };

  if (isUtools8OrLater(moduleAbi)) {
    // uTools 8 documents only preload for custom-window webPreferences and
    // no longer documents useContentSize.
    delete next.useContentSize;
    delete webPreferences.devTools;
  } else if (devTools) {
    webPreferences.devTools = true;
  } else {
    delete webPreferences.devTools;
  }

  next.webPreferences = webPreferences;
  return next;
}

function supportsBrowserWindowOAuthFallback(moduleAbi = getCurrentModuleAbi()) {
  return getUtoolsRuntime(moduleAbi)?.supportsBrowserWindowOAuthFallback === true;
}

module.exports = {
  UTOOLS_RUNTIME_PROFILES,
  getCurrentModuleAbi,
  getUtoolsRuntime,
  requireSupportedUtoolsRuntime,
  isUtools8OrLater,
  setCompatibleFeatureDescription,
  getCompatibleFeatureDescription,
  createCompatibleWindowOptions,
  supportsBrowserWindowOAuthFallback,
};
