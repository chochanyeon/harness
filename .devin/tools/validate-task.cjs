'use strict';
const fs = require('node:fs');
const path = require('node:path');
function validate(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Task must be a JSON object');
  const text = value => typeof value === 'string' && value.trim().length > 0;
  for (const key of ['goal', 'recovery', 'stateFile']) {
    if (!text(task[key])) throw new Error(`${key}: expected nonblank string`);
  }
  for (const key of ['scope', 'outOfScope', 'decisions', 'steps', 'acceptanceCriteria', 'verificationCommands', 'stopConditions']) {
    const values = task[key];
    if (!Array.isArray(values) || (key !== 'outOfScope' && values.length === 0) || !values.every(text)) {
      throw new Error(`${key}: expected nonblank string array`);
    }
  }
  if (!Number.isInteger(task.maxRetries) || task.maxRetries < 1 || task.maxRetries > 10) throw new Error('maxRetries: expected integer 1..10');
  if (task.allowPaidExecution !== false) throw new Error('allowPaidExecution: must be false for this offline package');
  const state = task.stateFile.trim().replace(/\\/g, '/');
  if (path.posix.isAbsolute(state) || path.win32.isAbsolute(state) || /^[a-z]:/i.test(state)
      || state.includes(String.fromCharCode(0)) || state.endsWith('/')
      || state.split('/').some(part => part === '..' || part === '.')) {
    throw new Error('stateFile: expected relative file path without NUL, dot segments or trailing separators');
  }
  return task;
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node validate-task.cjs <task.json>');
    validate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
    console.log('VALID: configuration only; commands were not executed and billing is not controlled.');
  } catch (error) {
    console.error(`INVALID: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { validate };
