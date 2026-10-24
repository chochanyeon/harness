'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nativeRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(nativeRoot, '..');

test('native config explicitly controls legacy imports', () => {
  const config = JSON.parse(fs.readFileSync(path.join(nativeRoot, 'config.json'), 'utf8'));
  assert.deepEqual(config.read_config_from, {
    agents_standard: false, cursor: false, windsurf: false, claude: false,
  });
});

test('one short always-on rule references available detailed instructions', () => {
  const rules = fs.readdirSync(path.join(nativeRoot, 'rules')).filter(name => name.endsWith('.md'));
  assert.deepEqual(rules, ['autonomous-execution.md']);
  const rule = fs.readFileSync(path.join(nativeRoot, 'rules', rules[0]), 'utf8');
  assert.match(rule, /^---\r?\ntrigger: always_on\r?\n---/);
  assert.ok(rule.length < 1500, 'keep always-on content bounded');
  assert.match(rule, /docs\/devin\/INSTRUCTIONS\.md/);
  for (const file of ['INSTRUCTIONS.md', 'DESIGN.template.md', 'STATE.template.md', 'COST-COMPARISON.md']) {
    assert.ok(fs.statSync(path.join(projectRoot, 'docs', 'devin', file)).isFile(), file);
  }
});

test('example and install instructions use the migrated paths', () => {
  const task = JSON.parse(fs.readFileSync(path.join(nativeRoot, 'task.example.json'), 'utf8'));
  assert.equal(task.stateFile, 'state/STATE.md');
  assert.equal(task.verificationCommands[0], 'node --test .devin/tests/validate-task.test.cjs');
  const readme = fs.readFileSync(path.join(nativeRoot, 'README.md'), 'utf8');
  assert.match(readme, /node \.devin\/tools\/validate-task\.cjs \.devin\/task\.example\.json/);
  assert.match(readme, /Desktop/);
  assert.match(readme, /미검증/);
  assert.match(readme, /덮어쓰지/);
});
