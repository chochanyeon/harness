'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Explicit distribution boundary: never recursively copy a working .devin directory.
const bundleFiles = Object.freeze([
  '.devin/config.json',
  '.devin/README.md',
  '.devin/rules/autonomous-execution.md',
  '.devin/skills/task-start/SKILL.md',
  '.devin/skills/task-resume/SKILL.md',
  '.devin/skills/task-finish/SKILL.md',
  '.devin/task.example.json',
  '.devin/tools/validate-task.cjs',
  '.devin/tools/install.cjs',
  '.devin/tests/validate-task.test.cjs',
  '.devin/tests/native-layout.test.cjs',
  '.devin/tests/install.test.cjs',
  'docs/devin/INSTRUCTIONS.md',
  'docs/devin/START.md',
  'docs/devin/DESIGN.template.md',
  'docs/devin/STATE.template.md',
  'docs/devin/COST-COMPARISON.md',
  'docs/devin/VERIFICATION.md',
]);

function maybeStat(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directoryChain(directory) {
  const absolute = path.resolve(directory);
  let current = path.parse(absolute).root;
  const parts = path.relative(current, absolute).split(path.sep).filter(Boolean);
  for (const part of ['', ...parts]) {
    if (part) current = path.join(current, part);
    const stat = maybeStat(current);
    if (!stat) throw new Error(`Expected existing directory: ${current}`);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${current}`);
    if (!stat.isDirectory()) throw new Error(`Expected directory: ${current}`);
  }
  return absolute;
}
function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
function sameIdentity(current, original) {
  return !current.isSymbolicLink() && current.dev === original.dev && current.ino === original.ino;
}

function install({ target, sourceRoot = path.resolve(__dirname, '../..'), dryRun = false } = {}) {
  if (typeof target !== 'string' || !target.trim()) throw new Error('target: expected nonblank existing directory');
  if (typeof sourceRoot !== 'string' || !sourceRoot.trim()) throw new Error('sourceRoot: expected nonblank directory');
  if (typeof dryRun !== 'boolean') throw new Error('dryRun: expected boolean');
  const source = fs.realpathSync(directoryChain(sourceRoot));
  const destination = fs.realpathSync(directoryChain(target));
  if (within(source, destination) || within(destination, source)) throw new Error('Source and target must not overlap');
  const devin = path.join(destination, '.devin');
  const docs = path.join(destination, 'docs');
  const docsDevin = path.join(docs, 'devin');
  for (const root of [devin, docsDevin]) {
    if (maybeStat(root)) throw new Error(`Destination already exists; merge manually: ${root}`);
  }
  const existingDocs = maybeStat(docs);
  if (existingDocs) directoryChain(docs);

  // Read the complete approved bundle before reserving any destination paths.
  const payload = bundleFiles.map(file => {
    const input = path.join(source, file);
    directoryChain(path.dirname(input));
    const expected = fs.lstatSync(input, { bigint: true });
    if (expected.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${input}`);
    if (!expected.isFile()) throw new Error(`Expected regular source file: ${input}`);
    const fd = fs.openSync(input, 'r');
    try {
      const opened = fs.fstatSync(fd, { bigint: true });
      if (!opened.isFile() || !sameIdentity(opened, expected)) throw new Error(`Source changed during preflight: ${input}`);
      return { file, data: fs.readFileSync(fd) };
    } finally { fs.closeSync(fd); }
  });
  const result = { target: destination, files: [...bundleFiles], dryRun };
  if (dryRun) return result;

  const createdDirectories = [];
  const createdFiles = [];
  const ownedDirectories = new Set();
  function createDirectory(directory) {
    directoryChain(path.dirname(directory));
    fs.mkdirSync(directory); // Exclusive reservation: no merging or overwriting.
    createdDirectories.push({ file: directory, stat: fs.lstatSync(directory, { bigint: true }) });
    ownedDirectories.add(directory);
  }
  function createParents(directory) {
    if (ownedDirectories.has(directory)) { directoryChain(directory); return; }
    if (!within(devin, directory) && !within(docsDevin, directory)) throw new Error(`Unexpected destination directory: ${directory}`);
    createParents(path.dirname(directory));
    createDirectory(directory);
  }
  function rollback() {
    const errors = [];
    for (const record of [...createdFiles].reverse()) {
      try {
        directoryChain(path.dirname(record.file));
        if (!maybeStat(record.file)) continue;
        const current = fs.lstatSync(record.file, { bigint: true });
        if (!current.isFile() || !sameIdentity(current, record.stat)) throw new Error('ownership changed');
        fs.unlinkSync(record.file);
      } catch (error) { errors.push(`${record.file}: ${error.message}`); }
    }
    for (const record of [...createdDirectories].reverse()) {
      try {
        directoryChain(path.dirname(record.file));
        if (!maybeStat(record.file)) continue;
        const current = fs.lstatSync(record.file, { bigint: true });
        if (!current.isDirectory() || !sameIdentity(current, record.stat)) throw new Error('ownership changed');
        fs.rmdirSync(record.file); // Never recursively delete unexpected files.
      } catch (error) { errors.push(`${record.file}: ${error.message}`); }
    }
    return errors;
  }
  try {
    createDirectory(devin);
    if (existingDocs) directoryChain(docs);
    else createDirectory(docs);
    createDirectory(docsDevin);
    for (const { file, data } of payload) {
      const output = path.join(destination, file);
      createParents(path.dirname(output));
      const fd = fs.openSync(output, 'wx', 0o644);
      try {
        createdFiles.push({ file: output, stat: fs.fstatSync(fd, { bigint: true }) });
        fs.writeFileSync(fd, data);
      } finally { fs.closeSync(fd); }
    }
    return result;
  } catch (error) {
    const errors = rollback();
    const cleanup = errors.length ? `Rollback incomplete; inspect paths manually: ${errors.join('; ')}` : 'Newly created paths rolled back.';
    throw new Error(`Installation failed: ${error.message}. ${cleanup}`, { cause: error });
  }
}

const usage = 'Usage: node .devin/tools/install.cjs --target <existing-project-directory> [--dry-run]';
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log(usage);
    else {
      let target;
      let dryRun = false;
      for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === '--target' && target === undefined && args[index + 1] && !args[index + 1].startsWith('--')) target = args[++index];
        else if (argument === '--dry-run' && !dryRun) dryRun = true;
        else throw new Error(`Invalid or duplicate argument: ${argument}. ${usage}`);
      }
      if (target === undefined) throw new Error(usage);
      const result = install({ target, dryRun });
      console.log(`${result.dryRun ? 'DRY RUN' : 'INSTALLED'}: ${result.files.length} approved files -> ${result.target}`);
      if (dryRun) console.log(result.files.map(file => `  ${file}`).join('\n'));
    }
  } catch (error) {
    console.error(`INSTALL ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { install, bundleFiles };
