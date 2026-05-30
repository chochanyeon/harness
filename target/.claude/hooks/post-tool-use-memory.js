#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let PROJECT_ROOT;
try {
  PROJECT_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: 'pipe' }).trim();
} catch {
  process.exit(0);
}

let raw = '';
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const toolName = event.tool_name || '';

    if (!['Write', 'Edit'].includes(toolName)) process.exit(0);

    const filePath = event.tool_input?.file_path || '';
    if (!filePath) process.exit(0);

    const memoryRoot = path.join(PROJECT_ROOT, '.project-memory');
    const indexPath = path.join(memoryRoot, 'INDEX.md');
    if (!fs.existsSync(indexPath)) process.exit(0);

    const teamIndex = fs.readFileSync(indexPath, 'utf-8').replace(/\r\n/g, '\n');
    const personalIndexPath = path.join(memoryRoot, 'personal', 'INDEX.md');
    const personalIndex = fs.existsSync(personalIndexPath)
      ? fs.readFileSync(personalIndexPath, 'utf-8').replace(/\r\n/g, '\n')
      : '';

    const memFiles = [
      ...extractMemoryFiles(teamIndex).map(f => ({ file: f, base: memoryRoot })),
      ...extractMemoryFiles(personalIndex).map(f => ({ file: f, base: path.join(memoryRoot, 'personal') })),
    ];

    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
    const reminders = [];

    for (const { file: memFile, base } of memFiles) {
      const fullPath = path.join(base, memFile);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n');
      const tags = extractTags(content);
      const rule = extractCoreRule(content);

      if (!rule) continue;
      if (tags.some(tag => normalizedPath.includes(tag.toLowerCase()))) {
        reminders.push(`[메모리 리마인더] ${memFile}\n→ ${rule}`);
      }
    }

    if (reminders.length > 0) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: reminders.join('\n\n'),
        },
      }) + '\n');
    }
  } catch (_) {
    // silent fail
  }
  process.exit(0);
});

function extractMemoryFiles(indexContent) {
  return indexContent
    .split('\n')
    .map(line => { const m = line.match(/\|\s*\[?([^\s|\]]+\.md)\]?(?:\([^)]*\))?\s*\|/); return m ? m[1] : null; })
    .filter(Boolean);
}

function extractTags(content) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return [];
  const tagsLine = frontmatter[1].match(/tags:\s*\[([^\]]+)\]/);
  if (!tagsLine) return [];
  return tagsLine[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
}

function extractCoreRule(content) {
  const match = content.match(/##\s*Core\s*[Rr]ule\n+([\s\S]*?)(?=\n##|\s*$)/);
  if (!match) return null;
  return match[1].trim().split('\n')[0].trim();
}
