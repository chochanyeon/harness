#!/usr/bin/env node
/**
 * PostToolUse(Write) 훅 — docs/feat/*.md 작성 시 INDEX.md 참조 여부 검증
 * additionalContext 주입 → Claude가 자동으로 INDEX.md 업데이트 수행
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

  // docs/feat/*.md 만 검사 (INDEX.md와 html/ 서브디렉토리 제외)
  if (
    !/docs[/\\]feat[/\\][^/\\]+\.md$/.test(filePath) ||
    /INDEX/i.test(path.basename(filePath)) ||
    filePath.includes('html')
  ) {
    process.exit(0);
  }

  const featName = path.basename(filePath, '.md');
  const indexPath = path.join(path.dirname(filePath), 'INDEX.md');

  const inject = (msg) => {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg }
    }) + '\n');
  };

  if (!fs.existsSync(indexPath)) {
    inject(`[validate-feat-index] INDEX.md가 없습니다: ${indexPath}\n  → docs/feat/INDEX.md를 생성하고 '${featName}' 항목을 추가하세요.`);
    process.exit(0);
  }

  const index = fs.readFileSync(indexPath, 'utf8');
  if (!index.includes(featName)) {
    inject(`[validate-feat-index] INDEX.md에 '${featName}' 항목이 없습니다.\n  → docs/feat/INDEX.md에 '${featName}' 링크를 추가하세요.`);
    process.exit(0);
  }

  console.log(`[validate-feat-index] ✓ INDEX.md에 '${featName}' 확인됨`);
  process.exit(0);
}

main();
