#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf-8'));
} catch {
  process.exit(0);
}

const response = input.tool_response;
if (!response || typeof response !== 'object') process.exit(0);

const worktreePath = response.path || response.worktreePath || response.worktree_path;
if (!worktreePath || typeof worktreePath !== 'string') process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR;
if (!projectDir) process.exit(0);

// Find main worktree (source of truth) via git-common-dir
// Works regardless of whether CLAUDE_PROJECT_DIR is main or linked worktree
let mainWorktreePath;
try {
  const gitCommonDirRaw = execFileSync(
    'git', ['-C', projectDir, 'rev-parse', '--git-common-dir'],
    { encoding: 'utf-8' }
  ).trim();
  mainWorktreePath = path.dirname(path.resolve(projectDir, gitCommonDirRaw));
} catch {
  mainWorktreePath = projectDir;
}

const resolvedTarget = path.resolve(worktreePath);
const resolvedSource = path.resolve(mainWorktreePath);
if (resolvedTarget === resolvedSource) process.exit(0);

const sourceSettingsPath = path.join(resolvedSource, '.claude', 'settings.json');
if (!fs.existsSync(sourceSettingsPath)) process.exit(0);

const sourceContent = fs.readFileSync(sourceSettingsPath, 'utf-8');

const targetClaudeDir = path.join(resolvedTarget, '.claude');
fs.mkdirSync(targetClaudeDir, { recursive: true });
fs.writeFileSync(path.join(targetClaudeDir, 'settings.json'), sourceContent, 'utf-8');
