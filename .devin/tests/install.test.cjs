'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tool = path.resolve(__dirname, '../tools/install.cjs');
const sourceRoot = path.resolve(__dirname, '../..');
const api = () => require(tool);
function fixture(t) {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'devin-install-'));
  const target = path.join(base, 'target project 한글');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'README.md'), 'existing project\n');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { base, target };
}
function cloneSource(base) {
  const source = path.join(base, 'source');
  for (const file of api().bundleFiles) {
    const destination = path.join(source, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, file), destination);
  }
  return source;
}
function directoryLink(t, destination, link) {
  try { fs.symlinkSync(destination, link, process.platform === 'win32' ? 'junction' : 'dir'); return true; }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`directory links unavailable: ${error.code}`); return false; }
    throw error;
  }
}
function assertUntouched(target) {
  assert.deepEqual(fs.readdirSync(target), ['README.md']);
  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'existing project\n');
}

test('clean install copies only the explicit bundle and preserves existing project files', t => {
  const { target } = fixture(t);
  fs.mkdirSync(path.join(target, 'docs'));
  fs.writeFileSync(path.join(target, 'docs', 'existing.md'), 'keep');
  const result = api().install({ target });
  assert.equal(result.dryRun, false);
  assert.equal(result.files.length, 18);
  assert.deepEqual(result.files, [...api().bundleFiles]);
  for (const file of result.files) assert.deepEqual(fs.readFileSync(path.join(target, file)), fs.readFileSync(path.join(sourceRoot, file)), file);
  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'existing project\n');
  assert.equal(fs.readFileSync(path.join(target, 'docs', 'existing.md'), 'utf8'), 'keep');
  for (const file of ['.pi', '.claude', '.harness', 'package.json', '.devin/task.json', '.devin/state', 'docs/devin/DESIGN.md']) assert.equal(fs.existsSync(path.join(target, file)), false, file);
});

test('dry-run validates the complete plan without creating directories', t => {
  const { target } = fixture(t);
  const result = api().install({ target, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.files, [...api().bundleFiles]);
  assertUntouched(target);
});

test('existing package roots are refused whether files or directories', t => {
  for (const relative of ['.devin', 'docs/devin']) {
    for (const kind of ['file', 'directory']) {
      const { target } = fixture(t);
      const existing = path.join(target, relative);
      fs.mkdirSync(path.dirname(existing), { recursive: true });
      if (kind === 'directory') { fs.mkdirSync(existing); fs.writeFileSync(path.join(existing, 'marker'), 'keep'); }
      else fs.writeFileSync(existing, 'keep');
      for (const dryRun of [false, true]) assert.throws(() => api().install({ target, dryRun }), /already exists/i);
      assert.equal(fs.readFileSync(kind === 'directory' ? path.join(existing, 'marker') : existing, 'utf8'), 'keep');
      if (relative !== '.devin') assert.equal(fs.existsSync(path.join(target, '.devin')), false);
    }
  }
});

test('missing targets and non-directory docs parents are rejected before writes', t => {
  const { base, target } = fixture(t);
  assert.throws(() => api().install({ target: path.join(base, 'missing') }), /directory|exist/i);
  assert.equal(fs.existsSync(path.join(base, 'missing')), false);
  fs.writeFileSync(path.join(target, 'docs'), 'keep');
  assert.throws(() => api().install({ target }), /directory/i);
  assert.equal(fs.readFileSync(path.join(target, 'docs'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(target, '.devin')), false);
});

test('source-target overlap is rejected in both directions', t => {
  const { base, target } = fixture(t);
  const source = cloneSource(base);
  const child = path.join(source, 'child'); fs.mkdirSync(child);
  for (const destination of [source, child, base]) assert.throws(() => api().install({ target: destination, sourceRoot: source }), /overlap/i);
  assertUntouched(target);
});

test('incomplete sources fail preflight without partial installation', t => {
  const { base, target } = fixture(t);
  const source = cloneSource(base);
  fs.unlinkSync(path.join(source, api().bundleFiles.at(-1)));
  assert.throws(() => api().install({ target, sourceRoot: source }), /exist|ENOENT/i);
  assertUntouched(target);
});

test('source runtime state private config and unknown Skills are not shipped', t => {
  const { base, target } = fixture(t);
  const source = cloneSource(base);
  const extras = ['.devin/task.json', '.devin/config.local.json', '.devin/state/STATE.md', '.devin/tasks/private/task.json', '.devin/skills/private/SKILL.md', 'docs/devin/DESIGN.md'];
  for (const file of extras) { fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true }); fs.writeFileSync(path.join(source, file), 'PRIVATE'); }
  api().install({ target, sourceRoot: source });
  for (const file of extras) assert.equal(fs.existsSync(path.join(target, file)), false, file);
});

test('target directory links are rejected', t => {
  const { base, target } = fixture(t);
  const link = path.join(base, 'linked target');
  if (!directoryLink(t, target, link)) return;
  assert.throws(() => api().install({ target: link }), /symbolic link/i);
  assertUntouched(target);
});

test('target ancestor links are rejected', t => {
  const { base } = fixture(t);
  const actual = path.join(base, 'actual'); fs.mkdirSync(actual);
  const nested = path.join(actual, 'nested'); fs.mkdirSync(nested);
  const link = path.join(base, 'link');
  if (!directoryLink(t, actual, link)) return;
  assert.throws(() => api().install({ target: path.join(link, 'nested') }), /symbolic link/i);
  assert.deepEqual(fs.readdirSync(nested), []);
});

test('linked docs parents are rejected without touching their destination', t => {
  const { base, target } = fixture(t);
  const outside = path.join(base, 'outside'); fs.mkdirSync(outside);
  if (!directoryLink(t, outside, path.join(target, 'docs'))) return;
  assert.throws(() => api().install({ target }), /symbolic link/i);
  assert.equal(fs.existsSync(path.join(target, '.devin')), false);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('linked source directories are rejected before writes', t => {
  const { base, target } = fixture(t);
  const source = cloneSource(base);
  const original = path.join(source, '.devin', 'skills');
  const outside = path.join(base, 'outside skills'); fs.renameSync(original, outside);
  if (!directoryLink(t, outside, original)) return;
  assert.throws(() => api().install({ target, sourceRoot: source }), /symbolic link/i);
  assertUntouched(target);
});

test('linked source files are refused', t => {
  const { base, target } = fixture(t);
  const source = cloneSource(base);
  const original = path.join(source, '.devin', 'config.json');
  const actual = path.join(base, 'config.json'); fs.renameSync(original, actual);
  try { fs.symlinkSync(actual, original, 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`file links unavailable: ${error.code}`); return; }
    throw error;
  }
  assert.throws(() => api().install({ target, sourceRoot: source }), /symbolic link/i);
  assertUntouched(target);
});

test('dangling package-root links are refused', t => {
  const { base, target } = fixture(t);
  if (!directoryLink(t, path.join(base, 'missing'), path.join(target, '.devin'))) return;
  assert.throws(() => api().install({ target }), /already exists|symbolic link/i);
  assert.equal(fs.existsSync(path.join(target, 'docs')), false);
});

test('write failures roll back only paths created by this installation', t => {
  const { target } = fixture(t);
  fs.mkdirSync(path.join(target, 'docs'));
  fs.writeFileSync(path.join(target, 'docs', 'existing.md'), 'keep');
  const original = fs.writeFileSync;
  let writes = 0;
  fs.writeFileSync = function(file, ...args) {
    if (typeof file === 'number' && ++writes === 5) throw Object.assign(new Error('injected write failure'), { code: 'EIO' });
    return original.call(this, file, ...args);
  };
  try { assert.throws(() => api().install({ target }), /injected write failure/); }
  finally { fs.writeFileSync = original; }
  assert.equal(fs.existsSync(path.join(target, '.devin')), false);
  assert.equal(fs.existsSync(path.join(target, 'docs', 'devin')), false);
  assert.equal(fs.readFileSync(path.join(target, 'docs', 'existing.md'), 'utf8'), 'keep');
  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'existing project\n');
});

test('rollback preserves unexpected files and reports incomplete cleanup', t => {
  const { target } = fixture(t);
  const unexpected = path.join(target, '.devin', 'user-note.txt');
  const original = fs.writeFileSync;
  let writes = 0;
  fs.writeFileSync = function(file, ...args) {
    if (typeof file === 'number' && ++writes === 3) {
      original.call(this, unexpected, 'keep user note');
      throw new Error('injected failure with concurrent file');
    }
    return original.call(this, file, ...args);
  };
  try { assert.throws(() => api().install({ target }), /Rollback incomplete/); }
  finally { fs.writeFileSync = original; }
  assert.equal(fs.readFileSync(unexpected, 'utf8'), 'keep user note');
  assert.equal(fs.existsSync(path.join(target, '.devin', 'config.json')), false);
  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'existing project\n');
});

test('a collision after preflight preserves the competing directory', t => {
  const { target } = fixture(t);
  fs.mkdirSync(path.join(target, 'docs'));
  const collision = path.join(target, 'docs', 'devin');
  const original = fs.mkdirSync;
  let injected = false;
  fs.mkdirSync = function(directory, ...args) {
    if (!injected && directory === collision) { injected = true; original.call(this, directory); fs.writeFileSync(path.join(directory, 'marker'), 'other writer'); }
    return original.call(this, directory, ...args);
  };
  try { assert.throws(() => api().install({ target }), /EEXIST|exist/i); }
  finally { fs.mkdirSync = original; }
  assert.equal(injected, true);
  assert.equal(fs.readFileSync(path.join(collision, 'marker'), 'utf8'), 'other writer');
  assert.equal(fs.existsSync(path.join(target, '.devin')), false);
});

test('an installed bundle remains a usable source without copying runtime files', t => {
  const { base, target } = fixture(t);
  api().install({ target });
  fs.writeFileSync(path.join(target, '.devin', 'config.local.json'), 'PRIVATE');
  const second = path.join(base, 'second'); fs.mkdirSync(second);
  api().install({ target: second, sourceRoot: target });
  assert.deepEqual(fs.readFileSync(path.join(second, '.devin', 'tools', 'install.cjs')), fs.readFileSync(tool));
  assert.equal(fs.existsSync(path.join(second, '.devin', 'config.local.json')), false);
});

test('CLI handles quoted paths dry-run help and invalid arguments without execution', t => {
  const { target } = fixture(t);
  const invoke = args => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  const dry = invoke(['--target', target, '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /DRY RUN/);
  assertUntouched(target);
  const help = invoke(['--help']); assert.equal(help.status, 0); assert.match(help.stdout, /Usage:/);
  for (const args of [[], ['--target'], ['--target', '  '], ['--force'], ['--target', target, '--target', target], ['--target', target, '--dry-run', '--dry-run']]) {
    const result = invoke(args); assert.equal(result.status, 1, JSON.stringify(args)); assert.match(result.stderr, /Usage:|target|argument|duplicate/i);
  }
  assertUntouched(target);
  const installed = invoke(['--target', target]);
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /INSTALLED/);
  assert.ok(fs.statSync(path.join(target, '.devin', 'skills', 'task-start', 'SKILL.md')).isFile());
});
