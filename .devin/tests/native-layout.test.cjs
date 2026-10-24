'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nativeRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(nativeRoot, '..');
const skillNames = ['task-start', 'task-resume', 'task-finish'];
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const rule = () => read(path.join(nativeRoot, 'rules', 'autonomous-execution.md'));
const doc = name => read(path.join(projectRoot, 'docs', 'devin', name));
const skill = name => read(path.join(nativeRoot, 'skills', name, 'SKILL.md'));
function matches(text, patterns) {
  for (const pattern of patterns) assert.match(text, pattern);
}

// Static contracts only: these do not prove Local discovers or follows a Skill.
test('native config records the intended legacy import policy', () => {
  const config = JSON.parse(read(path.join(nativeRoot, 'config.json')));
  assert.deepEqual(config.read_config_from, {
    agents_standard: false, cursor: false, windsurf: false, claude: false,
  });
});

test('one short always-on index replaces unconditional manual loading', () => {
  const rules = fs.readdirSync(path.join(nativeRoot, 'rules')).filter(name => name.endsWith('.md'));
  assert.deepEqual(rules, ['autonomous-execution.md']);
  const entry = rule();
  assert.match(entry, /^---\ntrigger: always_on\n---/);
  assert.ok(entry.length < 1000, 'keep safety and routing compact');
  assert.doesNotMatch(entry, /INSTRUCTIONS\.md|START\.md|README\.md|COST-COMPARISON\.md|VERIFICATION\.md/);
  assert.match(entry, /조건에 맞는 Skill 하나만/);
});

test('index links exactly the three available native Skills', () => {
  const links = [...rule().matchAll(/\.devin\/skills\/([a-z-]+)\/SKILL\.md/g)].map(match => match[1]);
  assert.deepEqual(links, skillNames);
  assert.deepEqual(fs.readdirSync(path.join(nativeRoot, 'skills')).sort(), [...skillNames].sort());
  for (const name of links) assert.ok(fs.statSync(path.join(nativeRoot, 'skills', name, 'SKILL.md')).isFile());
});

test('Skills use supported metadata and do not widen tools permissions or delegation', () => {
  for (const name of skillNames) {
    const content = skill(name);
    const header = /^---\n([\s\S]*?)\n---\n/.exec(content);
    assert.ok(header, name);
    assert.match(header[1], new RegExp(`^name: ${name}$`, 'm'));
    const description = /^description: (.+)$/m.exec(header[1]);
    assert.ok(description && description[1].length <= 120, name);
    assert.match(header[1], /^triggers: \[user, model\]$/m);
    assert.doesNotMatch(header[1], /^(?:model|agent|subagent|allowed-tools|permissions):/m);
    assert.doesNotMatch(content, /docs\/devin\/(?:INSTRUCTIONS|START)\.md/);
    assert.doesNotMatch(content, /시작.*모든 Skill.*(?:읽|로드)/);
  }
});

test('example and install instructions retain migrated paths', () => {
  const task = JSON.parse(read(path.join(nativeRoot, 'task.example.json')));
  assert.equal(task.stateFile, 'state/STATE.md');
  assert.equal(task.verificationCommands[0], 'node --test .devin/tests/validate-task.test.cjs');
  const readme = read(path.join(nativeRoot, 'README.md'));
  matches(readme, [/node \.devin\/tools\/validate-task\.cjs \.devin\/task\.example\.json/, /Desktop/, /미검증/, /덮어쓰지/]);
  for (const name of ['DESIGN.template.md', 'STATE.template.md', 'COST-COMPARISON.md']) assert.ok(doc(name));
});

test('always-on safety retains approval boundaries quality and retry limits', () => {
  matches(rule(), [/총 입력·출력 토큰/, /완료 기준·필수 검증·안전 규칙/, /push·배포·삭제·비밀정보/, /기존 사용자 변경/, /회사.*권한.*우회/s, /복구 한도/, /미검증/, /자동 위임/]);
  matches(skill('task-finish'), [/필수 회귀·통합 검증/, /미실행.*미검증/s, /약화하지 않는다/]);
});

test('discovery expands with evidence instead of imposing hard read limits', () => {
  matches(skill('task-start'), [/파일·함수.*재현/s, /검색 결과 없음.*출력 잘림.*부족/s, /읽기 횟수.*중단하지 않는다/s]);
});

test('normal execution preserves raw logs and command outcomes', () => {
  matches(rule(), [/원본 로그/, /명령·종료 코드.*실패.*증거 경로/s]);
  matches(skill('task-start'), [/비밀정보/, /요약.*성공.*원래 명령.*실패/s]);
  matches(skill('task-finish'), [/출력 잘림/, /실패·경고/]);
});

test('resume invalidates stale evidence and does not replay all history', () => {
  matches(skill('task-resume'), [/상태 파일.*필요한 설계 부분/s, /변경.*다시 확인/s, /확인할 수 없으면.*다시 읽/s, /이력 전체.*다시 읽지 않는다/s, /누락.*미검증.*재조사·검증/s]);
});

test('connected work stays together and reports retain evidence', () => {
  matches(rule(), [/분석→수정→검증/, /독립 작업.*보류/s, /단계별.*재개 확인.*요구하지 않는다/s]);
  matches(skill('task-finish'), [/변경 이유·수정 파일·테스트 결과·잔여 위험/, /완료 기준 ID/, /실제.*경로/s]);
});

test('design retains entry points and scoped references', () => {
  matches(doc('DESIGN.template.md'), [/탐색 시작점/, /파일·함수/, /재현/, /관련 절/, /오류 전후/, /원본 로그/, /변경 이유·수정 파일·테스트 결과·잔여 위험/]);
});

test('comparison includes total tokens failed attempts and native Skill metadata', () => {
  matches(doc('COST-COMPARISON.md'), [/변경 전 Devin 직접/, /변경 후 Devin 직접/, /총 입력·출력 토큰/, /실패·중단/, /재시도/, /캐시/, /unknown/, /완료율/, /비용 절감/, /Skill.*메타데이터/]);
});

test('long-run working set preserves global constraints and dependencies', () => {
  matches(rule(), [/장기 자율 실행/]);
  matches(skill('task-start'), [/현재 단계/, /전역 제약/, /단계 전환.*의존/s]);
  matches(skill('task-resume'), [/전역 제약/, /현재 단계/]);
});

test('checkpoint offloading preserves cumulative limits and recoverable evidence', () => {
  matches(skill('task-resume'), [/별도 이력/, /보관.*참조.*확인.*요약/s, /누적 복구 횟수.*초기화하지 않는다/s, /복구 전에.*기록/s]);
  matches(doc('STATE.template.md'), [/현재 단계/, /전역 제약/, /미해결 위험/, /모든 완료 기준/, /전체 이력 목록.*별도 색인/s, /참조.*확인/s, /초기화하지 않는다/]);
  matches(doc('DESIGN.template.md'), [/요약.*보존.*완료 기준.*승인.*복구/s]);
});

test('long-run comparison separates startup and repeated context costs', () => {
  matches(doc('COST-COMPARISON.md'), [/장기 자율 실행/, /초기.*반복/s, /초반·중반·후반/, /상태.*읽기.*이력/s, /요약·보관.*비용/s]);
});

test('ordinary requests bootstrap without manual files and questions stay read-only', () => {
  matches(rule(), [/Devin Local/, /설명·질문.*파일.*만들지 않는다/s]);
  matches(skill('task-start'), [/직접 작성.*요구하지 않는다/s, /사용자만 결정/, /양식 안내.*제거.*사용자 기록.*보존/s]);
});

test('preparation preserves existing tasks and checks safe target paths', () => {
  matches(skill('task-start'), [/같은 작업.*재사용/s, /다른 작업.*덮어쓰지 않는다/s, /\.devin\/tasks\//, /심볼릭 링크/, /여러 후보.*질문/s, /누적 복구 횟수.*초기화하지 않는다/s]);
});

test('prepared contracts use real project checks instead of example self-tests', () => {
  matches(skill('task-start'), [/maxRetries.*3/s, /allowPaidExecution.*false/s, /실제 프로젝트.*검증 명령/s, /예제.*자체 검사.*대체하지 않는다/s, /Node.*없으면.*수동.*기록/s, /validate-task\.cjs/]);
});

test('Desktop documentation retains native permissions and runtime caveats', () => {
  matches(read(path.join(nativeRoot, 'README.md')), [/Devin Local/, /Normal/, /Restricted Mode/, /Memories.*Workflows.*의존하지 않는다/s, /권한.*우회하지 않는다/s, /docs\.devin\.ai\/desktop\/devin-local/, /실사용.*미검증/s]);
});

test('legacy document paths are small indexes rather than copied procedures', () => {
  const index = doc('INSTRUCTIONS.md');
  assert.ok(index.length < 800);
  for (const name of skillNames) assert.match(index, new RegExp(name));
  const legacyStart = doc('START.md');
  assert.ok(legacyStart.length < 400);
  assert.match(legacyStart, /task-start/);
  assert.doesNotMatch(index + legacyStart, /maxRetries: 3|validate-task\.cjs|1\. 사용자가/);
});
