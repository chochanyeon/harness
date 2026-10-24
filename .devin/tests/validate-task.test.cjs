'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tool = path.resolve(__dirname, '../tools/validate-task.cjs');
const example = () => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../task.example.json'), 'utf8'));
function run(task, raw = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-task-'));
  try {
    const file = path.join(dir, 'task.json');
    fs.writeFileSync(file, raw ? task : JSON.stringify(task));
    return spawnSync(process.execPath, [tool, file], { encoding: 'utf8' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('valid example and retry boundaries', () => {
  for (const n of [1, 3, 10]) assert.equal(run({ ...example(), maxRetries: n }).status, 0);
});
test('every required field is required', () => {
  for (const key of Object.keys(example())) {
    const task = example(); delete task[key];
    assert.equal(run(task).status, 1, key);
  }
});
test('strings and list items must be nonblank and correctly typed', () => {
  for (const key of ['goal', 'recovery', 'stateFile']) {
    for (const value of ['', '  ', 3, null, []]) assert.equal(run({ ...example(), [key]: value }).status, 1, key);
  }
  for (const key of ['scope', 'outOfScope', 'decisions', 'steps', 'acceptanceCriteria', 'verificationCommands', 'stopConditions']) {
    for (const value of [null, 'text', [' '], [2]]) assert.equal(run({ ...example(), [key]: value }).status, 1, key);
    assert.equal(run({ ...example(), [key]: [] }).status, key === 'outOfScope' ? 0 : 1, key);
  }
});
test('reject invalid retry limits and paid execution', () => {
  for (const n of [-1, 0, 11, 1.5, '3', null]) assert.equal(run({ ...example(), maxRetries: n }).status, 1);
  for (const value of [true, 'false', 0, null]) assert.equal(run({ ...example(), allowPaidExecution: value }).status, 1);
});
test('reject malformed documents and absent files', () => {
  for (const raw of ['{', 'null', '[]', '42']) assert.equal(run(raw, true).status, 1);
  assert.equal(spawnSync(process.execPath, [tool, path.join(os.tmpdir(), 'missing-devin-task-file.json')]).status, 1);
  assert.equal(spawnSync(process.execPath, [tool]).status, 1);
});
test('reject cross-platform path escapes', () => {
  for (const value of ['../state.md', '..\\state.md', '/state.md', 'C:\\state.md', 'C:state.md', '\\\\server\\state.md', '.', 'state/../../escape.md']) {
    assert.equal(run({ ...example(), stateFile: value }).status, 1, value);
  }
  assert.equal(run({ ...example(), stateFile: 'local/state.md' }).status, 0);
});
test('reject directory spellings and NUL in state file paths', () => {
  for (const value of ['state/', 'state\\', 'state/.', './state.md', 'state/./file.md', 'state/\u0000.md']) {
    assert.equal(run({ ...example(), stateFile: value }).status, 1, JSON.stringify(value));
  }
});
test('validation executes no commands and writes no state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-noexec-'));
  try {
    const task = { ...example(), stateFile: 'state.md', verificationCommands: [`node -e "require('fs').writeFileSync('marker','bad')"`] };
    const file = path.join(dir, 'task.json'); fs.writeFileSync(file, JSON.stringify(task));
    const result = spawnSync(process.execPath, [tool, file], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.deepEqual(fs.readdirSync(dir), ['task.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
