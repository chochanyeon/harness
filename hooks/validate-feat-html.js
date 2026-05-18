#!/usr/bin/env node
/**
 * PostToolUse(Write|Edit) 훅 — docs/feat/html/*.html 작성 시 구조 검증
 * 필수 요소 누락 시 additionalContext 주입 → Claude가 수정 수행
 */

const fs = require('fs');
const path = require('path');

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

  const filePath = payload?.tool_input?.file_path || '';

  // docs/feat/html/*.html 만 검사 (index.html 제외)
  if (
    !/docs[/\\]feat[/\\]html[/\\][^/\\]+\.html$/.test(filePath) ||
    /index\.html$/i.test(filePath)
  ) {
    process.exit(0);
  }

  if (!fs.existsSync(filePath)) {
    process.exit(0);
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  // 1. Mermaid 초기화 확인
  if (!html.includes('mermaid.initialize(')) {
    issues.push("mermaid.initialize({ startOnLoad: true, theme: 'dark' }) 누락");
  }

  // 2. 다크 테마 배경색 확인
  if (!html.includes('#0d1117')) {
    issues.push('다크 테마 배경색(#0d1117) 누락');
  }

  // 3. 브레드크럼 링크 확인
  if (!html.includes('./index.html')) {
    issues.push('브레드크럼 "← Feature Docs" 링크(./index.html) 누락');
  }

  // 4. 메타 정보 확인 (작성일 or 브랜치)
  if (!html.includes('작성일') && !html.includes('브랜치')) {
    issues.push('메타 정보(작성일, 브랜치) 누락');
  }

  if (issues.length === 0) {
    console.log(`[validate-feat-html] ✓ ${path.basename(filePath)} 구조 검증 통과`);
    process.exit(0);
  }

  const featName = path.basename(filePath, '.html');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `[validate-feat-html] ${featName}.html 구조 문제 발견:\n` +
        issues.map(i => `  - ${i}`).join('\n') +
        '\n  → 위 항목을 수정하세요.'
    }
  }) + '\n');
  process.exit(0);
}

main();
