'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..', '..');
const releaseRoot = path.join(root, 'v2.0.0');
const sourceRoot = path.join(root, 'backend', 'src');
const MAX_RELEASE_ZIP_BYTES = 19 * 1024 * 1024;

function walkFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === '.gitkeep') return [];
      const absolutePath = path.join(directory, entry.name);
      const archivePath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return walkFiles(absolutePath, `${archivePath}/`);
      return [{ absolutePath, archivePath }];
    });
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = createCrc32Table();
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function createZipBuffer(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const content = fs.readFileSync(file.absolutePath);
    const name = Buffer.from(`v2.0.0/${file.archivePath.replace(/\\/g, '/')}`);
    const compressed = zlib.deflateRawSync(content, { level: 9 });
    const crc = crc32(content);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, compressed);

    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(0, 12);
    record.writeUInt16LE(0, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(0, 38);
    record.writeUInt32LE(offset, 42);
    name.copy(record, 46);
    central.push(record);
    offset += local.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuffer, end]);
}

assert.strictEqual(fs.existsSync(releaseRoot), true, 'release directory must exist; run move.bat first');
const files = walkFiles(releaseRoot);
const zipBuffer = createZipBuffer(files);
assert.ok(zipBuffer.length < MAX_RELEASE_ZIP_BYTES,
  `release ZIP is ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MiB; must remain below ${(MAX_RELEASE_ZIP_BYTES / 1024 / 1024).toFixed(0)} MiB`);

const preloadSource = fs.readFileSync(path.join(sourceRoot, 'preload.js'), 'utf8');
const lazySource = fs.readFileSync(path.join(sourceRoot, 'lazy_runtime.js'), 'utf8');
assert.doesNotMatch(preloadSource, /require\(['"]\.\/(?:chat|mcp_builtin|mcp|skill|compact|mcp_oauth_store|mcp_oauth_provider)\.js['"]\)/,
  'main preload must not duplicate heavy runtime modules');
assert.match(preloadSource, /function getLazyRuntime\(\)/);
for (const exportName of [
  'batchTestProviderKeys', 'handleBgShellRequest', 'killAllBackgroundShells',
  'connectAndInvokeTool', 'ensureMcpAuthenticated', 'exportSkillToPackage',
  'exportSkillPackageBuffer', 'extractSkillPackage', 'importSkillPackageBuffer',
  'oauthStore', 'oauthProvider'
]) {
  assert.match(lazySource, new RegExp(`\\b${exportName}\\b`), `lazy runtime must export ${exportName}`);
}

console.log(JSON.stringify({
  ok: true,
  files: files.length,
  zipBytes: zipBuffer.length,
  zipMiB: Number((zipBuffer.length / 1024 / 1024).toFixed(2)),
  limitMiB: MAX_RELEASE_ZIP_BYTES / 1024 / 1024,
}));
