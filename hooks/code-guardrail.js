#!/usr/bin/env node
/**
 * Code Guardrail Hook — PreToolUse + PostToolUse (Edit, Write)
 *
 * Reads Claude Code hook payload from stdin (JSON).
 * exit(0) = allow, exit(2) = block (message written to stdout).
 *
 * Execution mode:
 *   PreToolUse:  Validates PREVIEW (what WILL be written) - fast feedback
 *   PostToolUse: Validates ACTUAL (what WAS written) - security confirmation
 *
 * Layer execution order:
 *   1. Deletion Detection  — reads tool_input directly, no Gradle
 *   2. Checkstyle + PMD   — single Gradle invocation, ~4-15s warm
 *
 * CPD intentionally excluded — project-wide, belongs in CI.
 * Prerequisite: <gradlew> compileJava compileTestJava must have run at least once.
 * Bypass: GUARDRAIL_SKIP=1 env var, or create .claude/.guardrail-skip
 *
 * Security: Double verification prevents TOCTOU attacks
 *   - PreToolUse validates preview → attacker could bypass
 *   - PostToolUse validates actual → final security gate
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

let PROJECT_ROOT;
try {
  PROJECT_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: 'pipe' }).trim();
} catch {
  PROJECT_ROOT = path.join(__dirname, '../..');
}

const GRADLE_TIMEOUT_MS = 20000;

// ─── Telemetry ────────────────────────────────────────────────────────────────

const VIOLATION_LOG = path.join(require('os').homedir(), '.claude', 'hooks', 'violations.jsonl');

let _currentBranch;
function getCurrentBranch() {
  if (_currentBranch === undefined) {
    try { _currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', stdio: 'pipe' }).trim(); }
    catch { _currentBranch = 'unknown'; }
  }
  return _currentBranch;
}

function logViolation(type, filePath, details) {
  try {
    const MAX_BYTES = 1024 * 1024; // 1 MB
    if (fs.existsSync(VIOLATION_LOG) && fs.statSync(VIOLATION_LOG).size > MAX_BYTES) {
      const lines = fs.readFileSync(VIOLATION_LOG, 'utf-8').split('\n').filter(Boolean);
      fs.writeFileSync(VIOLATION_LOG, lines.slice(-500).join('\n') + '\n');
    }
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      type,
      file: path.basename(filePath),
      branch: getCurrentBranch(),
      details,
    });
    fs.appendFileSync(VIOLATION_LOG, entry + '\n');
  } catch { /* telemetry failure must not block */ }
}

// ─── Deny Helper ─────────────────────────────────────────────────────────────

function denyWith(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }) + '\n');
  process.exit(0);
}

// ─── Layer 2+3: Static Analysis ───────────────────────────────────────────────

function getModuleInfo(filePath) {
  const p = filePath.replace(/\\/g, '/');

  let module = null;
  if (p.includes('/api-service/'))           module = 'api-service';
  else if (p.includes('/consumer-service/')) module = 'consumer-service';
  else if (p.includes('/common/'))           module = 'common';

  if (!module) return null;

  const isTest = p.includes('/src/test/');
  return {
    module,
    task: isTest ? 'Test' : 'Main',
    reportSuffix: isTest ? 'test' : 'main',
  };
}

function runGradle(args) {
  const opts = { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: GRADLE_TIMEOUT_MS };
  if (process.platform === 'win32') {
    // cmd.exe re-parses args as a single string; quote values that contain spaces
    const quotedArgs = args.map(a => /[ ()&^%]/.test(a) ? `"${a}"` : a);
    execFileSync('cmd.exe', ['/c', 'gradlew.bat', ...quotedArgs], opts);
  } else {
    execFileSync(path.join(PROJECT_ROOT, 'gradlew'), args, opts);
  }
}

function createPreviewFile(filePath, payload) {
  const toolName = payload?.tool_name;
  const tmpPath = `${filePath}.guardrail-preview`;

  if (toolName === 'Edit') {
    const oldStr = payload?.tool_input?.old_string || '';
    const newStr = payload?.tool_input?.new_string || '';

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const original = fs.readFileSync(filePath, 'utf-8');
    const preview = original.replace(oldStr, newStr);

    if (preview === original) {
      // IMPROVEMENT: Detect replacement failure (old_string not found in file)
      // This can happen due to whitespace mismatch, encoding issues, or incorrect old_string
      if (oldStr.length > 0) {
        console.error('[Guardrail] WARN: Edit replacement failed — old_string not found in file');
        console.error(`[Guardrail]   File: ${path.basename(filePath)}`);
        console.error(`[Guardrail]   old_string length: ${oldStr.length} chars`);
        console.error(`[Guardrail]   old_string preview: ${oldStr.substring(0, 80).replace(/\n/g, '\\n')}...`);
        logViolation('edit-mismatch', filePath, {
          reason: 'old_string not found in file',
          oldStrLength: oldStr.length,
          oldStrPreview: oldStr.substring(0, 100),
        });
      }
      // Fallback: validate original file (L426-428 will run static analysis on actual file)
      return null;
    }

    fs.writeFileSync(tmpPath, preview, 'utf-8');
    return tmpPath;
  }

  if (toolName === 'Write') {
    const content = payload?.tool_input?.content || '';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    return tmpPath;
  }

  return null;
}

function runStaticAnalysis(filePath, actualPath = null) {
  const targetPath = actualPath || filePath;
  const info = getModuleInfo(filePath);
  if (!info) return { styleViolations: [], pmdViolations: [] };

  const { module, task, reportSuffix } = info;

  try {
    runGradle([
      `:${module}:checkstyle${task}`,
      `:${module}:pmd${task}`,
      `-PguardFilePath=${targetPath}`,
    ]);
    return { styleViolations: [], pmdViolations: [] };
  } catch (err) {
    if (err.killed) {
      console.error('[Guardrail] Static analysis timed out (20s) — skipping');
      return { styleViolations: [], pmdViolations: [] };
    }

    const csReport = path.join(PROJECT_ROOT, module, `build/reports/checkstyle/${reportSuffix}.xml`);
    const pmdReport = path.join(PROJECT_ROOT, module, `build/reports/pmd/${reportSuffix}.xml`);

    if (!fs.existsSync(csReport) && !fs.existsSync(pmdReport)) {
      console.error('[Guardrail] Static analysis failed (no report produced — compiled classes missing?). Skipping.');
      return { styleViolations: [], pmdViolations: [] };
    }

    return {
      styleViolations: fs.existsSync(csReport)
        ? parseCheckstyleXml(fs.readFileSync(csReport, 'utf-8'), filePath, targetPath)
        : [],
      pmdViolations: fs.existsSync(pmdReport)
        ? parsePmdXml(fs.readFileSync(pmdReport, 'utf-8'), filePath, targetPath)
        : [],
    };
  }
}

function parseCheckstyleXml(xml, filePath, actualPath = null) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (tagName) => tagName === 'file' || tagName === 'error',
    });

    const result = parser.parse(xml);
    const target = path.basename(actualPath || filePath);

    if (!result.checkstyle || !result.checkstyle.file) return [];

    const files = Array.isArray(result.checkstyle.file)
      ? result.checkstyle.file
      : [result.checkstyle.file];

    const fileNode = files.find(f => f['@_name'] && f['@_name'].endsWith(target));
    if (!fileNode || !fileNode.error) return [];

    const errors = Array.isArray(fileNode.error) ? fileNode.error : [fileNode.error];

    return errors.map(e => ({
      line: parseInt(e['@_line']),
      message: e['@_message'] || '(no message)',
    }));
  } catch (err) {
    console.error('[Guardrail] Checkstyle XML parse failed:', err.message);
    return [];
  }
}

function parsePmdXml(xml, filePath, actualPath = null) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (tagName) => tagName === 'file' || tagName === 'violation',
    });

    const result = parser.parse(xml);
    const target = path.basename(actualPath || filePath);

    if (!result.pmd || !result.pmd.file) return [];

    const files = Array.isArray(result.pmd.file)
      ? result.pmd.file
      : [result.pmd.file];

    const fileNode = files.find(f => f['@_name'] && f['@_name'].endsWith(target));
    if (!fileNode || !fileNode.violation) return [];

    const violations = Array.isArray(fileNode.violation)
      ? fileNode.violation
      : [fileNode.violation];

    return violations.map(v => ({
      line: parseInt(v['@_beginline']),
      rule: v['@_rule'] || '(unknown)',
      message: (v['#text'] || '(no message)').trim(),
    }));
  } catch (err) {
    console.error('[Guardrail] PMD XML parse failed:', err.message);
    return [];
  }
}

function formatStyleErrors(violations) {
  const lines = ['  [ Checkstyle ]'];
  violations.forEach(v => lines.push(`    Line ${v.line}: ${v.message}`));
  return lines.join('\n');
}

function formatPmdErrors(violations) {
  const lines = ['  [ PMD ]'];
  violations.forEach(v => lines.push(`    Line ${v.line} [${v.rule}]: ${v.message}`));
  return lines.join('\n');
}

// ─── Layer 1: Deletion Detection ──────────────────────────────────────────────

function getDeletedLines(payload, filePath) {
  const toolName = payload?.tool_name;

  if (toolName === 'Edit') {
    const oldLines = (payload?.tool_input?.old_string || '').split('\n');
    const newStr = (payload?.tool_input?.new_string || '').split('\n');

    const bag = {};
    newStr.forEach(l => { bag[l] = (bag[l] || 0) + 1; });

    const deleted = [];
    oldLines.forEach(l => {
      if (bag[l] > 0) { bag[l]--; }
      else { deleted.push(`-${l}`); }
    });
    // Edit operates on a fragment (old_string), not the whole file.
    // currentLineCount: 0 intentionally disables the 50%-of-file Tier2 rule.
    // Only the absolute 30-line threshold applies for Edit.
    return { deleted, currentLineCount: 0 };
  }

  if (toolName === 'Write') {
    if (!fs.existsSync(filePath)) return { deleted: [], currentLineCount: 0 };
    const current = fs.readFileSync(filePath, 'utf-8').split('\n');
    const incoming = (payload?.tool_input?.content || '').split('\n');

    const bag = {};
    incoming.forEach(l => { bag[l] = (bag[l] || 0) + 1; });

    const deleted = [];
    current.forEach(l => {
      if (bag[l] > 0) { bag[l]--; }
      else { deleted.push(`-${l}`); }
    });
    return { deleted, currentLineCount: current.length };
  }

  return { deleted: [], currentLineCount: 0 };
}

const TIER1_PATTERNS = [
  /^-\s*public\s+(class|interface|enum)\s+\w+/,
  /^-\s*@(Entity|Repository|Service|Controller|Component|RestController)/,
  /^-\s*@(Id|Column|Table|ManyToOne|OneToMany|ManyToMany)/,
  /^-\s*public\s+.+\s+\w+\s*\(/,
  /^-\s*@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)/,
];

function isTrulyDeleted(deletedLine, newLines) {
  const stripped = deletedLine.replace(/^-\s*/, '').trim();
  if (newLines.some(nl => nl.trim() === stripped)) return false;
  // Common override/utility methods: removal during refactoring should not trigger Tier1
  if (/public\s+\S+\s+(toString|hashCode|equals|setUp|tearDown|init|destroy|close)\s*\(/.test(stripped)) return false;
  // For method signatures: changing params keeps the method — check name still present
  const methodMatch = stripped.match(/public\s+\S+\s+(\w+)\s*\(/);
  if (methodMatch && newLines.some(nl => nl.includes(`${methodMatch[1]}(`))) return false;
  return true;
}

function detectTier1(deletedLines, newLines) {
  const hits = new Set();
  deletedLines.forEach(line => {
    TIER1_PATTERNS.forEach(p => {
      if (p.test(line)) {
        if (newLines.length === 0 || isTrulyDeleted(line, newLines)) {
          hits.add(line.substring(1).trim());
        }
      }
    });
  });
  return [...hits];
}

function detectTier2(deletedLines, isReplacement, totalCurrentLines) {
  const hits = [];

  if (!isReplacement && deletedLines.length >= 30) {
    hits.push(`${deletedLines.length} lines deleted (threshold: 30)`);
  }

  if (!isReplacement && totalCurrentLines > 0 &&
      deletedLines.length >= totalCurrentLines * 0.5) {
    hits.push(`${deletedLines.length}/${totalCurrentLines} lines deleted (≥50% of file)`);
  }

  const importDels = deletedLines.filter(l => /^-\s*import\s+/.test(l));
  if (importDels.length >= 15) {
    hits.push(`${importDels.length} imports deleted (threshold: 15)`);
  }

  const testDels = deletedLines.filter(l => /^-\s*@Test/.test(l));
  if (testDels.length > 0) {
    hits.push(`${testDels.length} @Test method(s) deleted`);
  }

  return hits;
}

function formatDeletionWarning(tier1, tier2) {
  const lines = ['── 🛡 CODE GUARDRAIL ──────────────────', ''];
  if (tier1.length > 0) {
    lines.push('  ⛔ 핵심 코드 삭제 (Critical)');
    lines.push('');
    tier1.forEach(l => lines.push(`    • ${l}`));
    lines.push('');
    lines.push('  API 계약·DB 매핑·와이어링 위험');
  }
  if (tier2.length > 0) {
    if (tier1.length > 0) lines.push('');
    lines.push('  ⚠️ 대량 삭제 (Large)');
    lines.push('');
    tier2.forEach(v => lines.push(`    • ${v}`));
    lines.push('');
    lines.push('  의도한 변경인지 검토하세요.');
  }
  lines.push('');
  lines.push('  우회: GUARDRAIL_SKIP=1');
  lines.push('        touch .claude/.guardrail-skip');
  lines.push('');
  lines.push('──────────────────────────────────────');
  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let payload;
  try {
    const chunks = [];
    process.stdin.on('data', d => chunks.push(d));
    await new Promise(resolve => process.stdin.on('end', resolve));
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.exit(0);
  }

  const hookEvent = payload?.hookEventName || 'PreToolUse';
  const filePath = payload?.tool_input?.file_path || payload?.tool_response?.filePath;

  if (!filePath || !filePath.endsWith('.java')) {
    process.exit(0);
  }

  if (process.env.GUARDRAIL_SKIP === '1' ||
      fs.existsSync(path.join(PROJECT_ROOT, '.claude/.guardrail-skip'))) {
    console.error(`[Guardrail] SKIP active — bypassing: ${path.basename(filePath)}`);
    process.exit(0);
  }

  console.error(`[Guardrail] ${hookEvent} validating ${path.basename(filePath)}...`);

  let styleViolations = [];
  let pmdViolations = [];

  if (hookEvent === 'PreToolUse') {
    // Layer 1: Deletion Detection (PreToolUse only)
    const { deleted: deletedLines, currentLineCount } = getDeletedLines(payload, filePath);
    if (deletedLines.length > 0) {
      const newLines = payload?.tool_name === 'Edit'
        ? (payload?.tool_input?.new_string || '').split('\n')
        : [];

      const oldLineCount = (payload?.tool_input?.old_string || '').split('\n').length;
      const newLineCount = newLines.length;
      // Write is always a full-file replacement — skip volume-based Tier2 (30-line / 50% rules).
      // Edit replacement: new content ≥ 30% of old → not a pure deletion.
      const isReplacement = payload?.tool_name === 'Write' ||
                            (payload?.tool_name === 'Edit' && newLineCount >= Math.ceil(oldLineCount * 0.3));

      const tier1 = detectTier1(deletedLines, newLines);
      const tier2 = detectTier2(deletedLines, isReplacement, currentLineCount);

      if (tier1.length > 0 || tier2.length > 0) {
        logViolation('deletion', filePath, { tier1, tier2 });
        denyWith(formatDeletionWarning(tier1, tier2));
      }
    }

    // Layer 2+3: Checkstyle + PMD (PREVIEW validation)
    const previewPath = createPreviewFile(filePath, payload);
    if (previewPath) {
      try {
        const result = runStaticAnalysis(filePath, previewPath);
        styleViolations = result.styleViolations;
        pmdViolations = result.pmdViolations;
      } finally {
        if (fs.existsSync(previewPath)) {
          fs.unlinkSync(previewPath);
        }
      }
    } else {
      const result = runStaticAnalysis(filePath);
      styleViolations = result.styleViolations;
      pmdViolations = result.pmdViolations;
    }
  } else if (hookEvent === 'PostToolUse') {
    // Layer 2+3: Checkstyle + PMD (ACTUAL validation)
    // Verify that what was ACTUALLY written matches what was validated
    if (!fs.existsSync(filePath)) {
      console.error(`[Guardrail] PostToolUse: file does not exist — skipping: ${filePath}`);
      process.exit(0);
    }

    const result = runStaticAnalysis(filePath);
    styleViolations = result.styleViolations;
    pmdViolations = result.pmdViolations;
  }

  // Report both together so PMD violations aren't hidden by an early exit
  if (styleViolations.length > 0 || pmdViolations.length > 0) {
    if (styleViolations.length > 0) {
      logViolation('checkstyle', filePath, styleViolations.map(v => `L${v.line}: ${v.message}`));
    }
    if (pmdViolations.length > 0) {
      logViolation('pmd', filePath, pmdViolations.map(v => `L${v.line} [${v.rule}]: ${v.message}`));
    }

    const header = hookEvent === 'PostToolUse'
      ? '── ⚠️ CODE GUARDRAIL — SECURITY ALERT ────'
      : '── 🔍 CODE GUARDRAIL — Static Analysis ───';

    const footer = hookEvent === 'PostToolUse'
      ? `  🚨 CRITICAL: 파일이 이미 작성되었습니다!
  즉시 수정하거나 되돌리세요.

  되돌리기: git checkout -- ${filePath.replace(/\\/g, '/')}`
      : '  코드를 수정한 후 재시도하세요.';

    const parts = [
      header,
      '',
      ...(styleViolations.length > 0 ? [formatStyleErrors(styleViolations), ''] : []),
      ...(pmdViolations.length > 0 ? [formatPmdErrors(pmdViolations), ''] : []),
      footer,
      '',
      '──────────────────────────────────────────',
    ];
    denyWith(parts.join('\n'));
  }

  process.exit(0);
}

main();
