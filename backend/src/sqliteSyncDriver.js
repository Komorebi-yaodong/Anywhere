'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { setImmediate: scheduleImmediate } = require('timers');
const BetterSqlite3 = require('better-sqlite3');
const { cppdb } = require('better-sqlite3/lib/util');

const fsAccess = promisify(fs.access);
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;


function loadNativeManifest() {
  const manifestPath = path.join(__dirname, 'sqlite-native', 'manifest.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`sqlite_native_manifest_invalid:${error?.message || error}`);
  }
}

function assertNativeRuntime(manifest, target) {
  const expectedAbi = String(manifest?.moduleAbi || '');
  const actualAbi = String(process.versions?.modules || '');
  if (!expectedAbi || expectedAbi !== actualAbi) {
    throw new Error(`sqlite_native_abi_mismatch:expected=${expectedAbi || 'unknown'},actual=${actualAbi || 'unknown'}`);
  }
  if (!manifest?.targets?.[target]) {
    throw new Error(`sqlite_native_binding_unsupported:${target}`);
  }
}

function loadNodeSqlite() {
  try {
    const moduleId = 'node:' + 'sqlite';
    const sqlite = require(moduleId);
    if (typeof sqlite?.DatabaseSync === 'function' && typeof sqlite?.backup === 'function') {
      return sqlite;
    }
  } catch {}
  return null;
}

const nodeSqlite = loadNodeSqlite();

class CompatibleDatabaseSync {
  constructor(databasePath, { readOnly = false, timeout = 4000 } = {}) {
    const target = `${process.platform}-${process.arch}`;
    const manifest = loadNativeManifest();
    assertNativeRuntime(manifest, target);
    const nativeBinding = path.join(
      __dirname,
      'sqlite-native',
      target,
      'better_sqlite3.node',
    );
    if (!fs.existsSync(nativeBinding)) {
      throw new Error(`sqlite_native_binding_unsupported:${target}`);
    }
    return new BetterSqlite3(databasePath, {
      readonly: readOnly === true,
      timeout: Math.max(0, Math.floor(Number(timeout) || 0)),
      nativeBinding,
    });
  }
}

function runBackup(backup, progressHandler = null) {
  let rate = 0;
  let useDefault = true;
  return new Promise((resolve, reject) => {
    scheduleImmediate(function step() {
      try {
        const progress = backup.transfer(rate);
        if (!progress.remainingPages) {
          backup.close();
          resolve(progress);
          return;
        }
        if (useDefault) {
          useDefault = false;
          rate = 100;
        }
        if (progressHandler) {
          const nextRate = progressHandler(progress);
          if (nextRate !== undefined) {
            if (typeof nextRate !== 'number' || Number.isNaN(nextRate)) {
              throw new TypeError('Expected progress callback to return a number or undefined');
            }
            rate = Math.max(0, Math.min(0x7fffffff, Math.round(nextRate)));
          }
        }
        scheduleImmediate(step);
      } catch (error) {
        try { backup.close(); } catch {}
        reject(error);
      }
    });
  });
}

async function compatibleBackup(database, destination, options = {}) {
  const filename = path.resolve(String(destination || '').trim());
  if (!filename) throw new TypeError('Backup filename cannot be empty');
  await fsAccess(path.dirname(filename)).catch(() => {
    throw new TypeError('Cannot save backup because the directory does not exist');
  });
  const isNewFile = await fsAccess(filename).then(() => false, () => true);
  const attachedName = typeof options?.attached === 'string' && options.attached
    ? options.attached
    : 'main';
  const nativeBackup = database[cppdb].backup(database, attachedName, filename, isNewFile);
  nativeBackup.retryErrors = [SQLITE_BUSY, SQLITE_LOCKED];
  return runBackup(nativeBackup, typeof options?.progress === 'function' ? options.progress : null);
}

module.exports = nodeSqlite || {
  DatabaseSync: CompatibleDatabaseSync,
  backup: compatibleBackup,
};
