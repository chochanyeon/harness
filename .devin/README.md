# Devin 네이티브 경량 하네스

충분한 단일 설계와 장기 자율 실행을 유지하면서 사용자 재개 메시지·중복 오케스트레이션·반복 컨텍스트 주입을 줄인다. Pi·Claude 설치나 npm 패키지 설치는 필요 없다.

## 다른 PC·프로젝트에 설치
이 저장소에서 **`.devin/`과 `docs/devin/` 두 폴더**를 대상 프로젝트의 같은 위치에 복사한다. 숨김 폴더 `.devin/`이 누락되지 않도록 한다. 이 저장소의 루트 package.json과 기존 `.pi/`, `.claude/`, `.harness/`는 복사하지 않는다.

```text
대상 프로젝트/
├─ .devin/
│  ├─ config.json
│  ├─ rules/autonomous-execution.md
│  ├─ task.example.json
│  ├─ tools/validate-task.cjs
│  └─ tests/validate-task.test.cjs
└─ docs/devin/
   ├─ INSTRUCTIONS.md
   ├─ DESIGN.template.md
   ├─ STATE.template.md
   └─ COST-COMPARISON.md
```

대상에 `.devin/` 또는 `docs/devin/`이 이미 있으면 덮어쓰지 않는다. 기존 설정을 백업하고 필요한 항목만 사람이 병합한다. 아래 PowerShell 예제는 두 경로 중 하나라도 있으면 중단한다. 원본 경로와 대상 경로를 실제 위치로 바꾼다.

```powershell
$source = 'I:\harness'
$target = 'C:\work\my-project'
if (!(Test-Path -LiteralPath $target -PathType Container)) { throw '대상 프로젝트가 없습니다.' }
if ((Test-Path -LiteralPath "$target\.devin") -or (Test-Path -LiteralPath "$target\docs\devin")) { throw '기존 구성이 있습니다. 덮어쓰지 말고 병합하세요.' }
Copy-Item -LiteralPath "$source\.devin" -Destination "$target\.devin" -Recurse -Force
New-Item -ItemType Directory -Path "$target\docs" -Force | Out-Null
Copy-Item -LiteralPath "$source\docs\devin" -Destination "$target\docs\devin" -Recurse
```

## 네이티브 로드와 기존 규칙 이관
공식 **Devin CLI** 문서에 따르면 `.devin/rules/*.md`와 `trigger: always_on`을 지원한다. 이 패키지는 짧은 상시 규칙 하나만 사용한다. 긴 실행 지침·설계는 시작 시 참조하고 실행 상태는 파일로 유지한다. `.devin/global_rules.md`나 별도 루트 AGENTS.md를 추가해 같은 규칙을 중복 로드하지 않는다.

`config.json`의 `read_config_from`은 `agents_standard`, `cursor`, `windsurf`, `claude`를 false로 설정한다. 이는 기존 AGENTS/Claude/Cursor/Windsurf 지침과 무거운 하네스의 중복 import를 막기 위한 의도적인 선택이다. **그 결과 필수 프로젝트 지침도 자동 import되지 않을 수 있다.** 실행 전에 기존 AGENTS.md·CLAUDE.md 등의 API 계약·보안·빌드·테스트·금지 규칙을 검토하고 필요한 규칙을 네이티브 규칙 또는 작업 설계로 옮긴다. 회사 필수 규칙을 제거하지 않는다. 필요한 import를 유지할 경우 설정을 병합하고 중복 지침을 점검한다. 파일 자체는 삭제하거나 수정하지 않는다.

사용자 전역 설정·다른 플러그인·회사 정책을 모두 차단한다고 보장하지 않는다. 실제 버전에서 활성 규칙과 config.local.json 등 개인 설정을 확인한다. 위 자동 로드·설정 지원은 CLI 공식 근거이며 **Desktop이 같은 방식으로 동작하는지는 미검증**이다. Desktop에서는 해당 버전의 안내를 확인하고, 자동 로드가 확인되지 않으면 지침과 설계를 명시적으로 제공한다.

## 첫 작업 준비
1. `docs/devin/DESIGN.template.md`를 `docs/devin/DESIGN.md`로 복사해 충분한 설계를 작성한다. 목표·범위·결정·순서·완료 기준·검증·복구·중단 조건을 확정한다.
2. `.devin/task.example.json`을 `.devin/task.json`으로 복사해 작업 내용을 채운다. 예제 검증 명령은 이 패키지 자체의 검사이며 실제 프로젝트의 검증 명령으로 바꾼다.
3. `.devin/state/`를 만들고 `docs/devin/STATE.template.md`를 `.devin/state/STATE.md`로 복사한다. 예제의 stateFile은 작업 JSON 파일 기준 `state/STATE.md`이므로 이 경로와 일치한다. 실제 작업 상태·로그를 공유 저장소에 커밋할지는 프로젝트 정책을 따른다.
4. 대상 프로젝트에서 Devin을 직접 사용한다. CLI 자동 호출 wrapper는 없다. 완성된 설계 경로를 시작 메시지에서 한 번 지정한다.

> docs/devin/DESIGN.md를 기준으로 구현·검증·수정·자체 리뷰를 자율 진행하세요. .devin/task.json의 복구 한도와 상태 경로를 따르고, 단계별 재개 확인 없이 완료 또는 실제 차단 사유를 보고하세요.

## 오프라인 검사
Node.js 18 이상이 필요하다. npm install은 필요 없다. 설치한 대상 프로젝트 루트에서는 작업 검사와 검사 도구 테스트를 실행한다. 실제 작업 계약은 task.example.json 대신 task.json으로 검사한다.

```sh
node .devin/tools/validate-task.cjs .devin/task.example.json
node --test .devin/tests/validate-task.test.cjs
```

`native-layout.test.cjs`는 **수정하지 않은 배포 원본 전용** 계약 검사다. 원본 저장소 루트에서만 추가 실행한다.

```sh
node --test .devin/tests/native-layout.test.cjs
```

배포 원본 검사는 import 설정 네 값이 false이고 규칙 파일이 정확히 하나인지를 확인한다. 대상 프로젝트에서 필요한 import나 안전 규칙을 병합한 경우 원본 전용 검사가 실패하는 것은 의도된 차이이며 설치 오류를 의미하지 않는다. 이 경우 병합된 설정과 활성 규칙을 별도로 검토한다.

검사는 JSON만 읽고 입력 명령을 실행하지 않는다. 상태 파일도 생성하지 않는다. 경로 검사는 문자열 검사이며 심볼릭 링크 대상이나 쓰기 권한을 보장하지 않는다. 실제 파일 쓰기는 승인된 프로젝트 내부에서 수행한다. 검사 도구는 설계 문서의 완전성이나 실행 지침 준수를 보증하지 않는다.

## 비용 한계
allowPaidExecution=false는 오프라인 준비 과정의 제한이며 Devin의 사용료를 0으로 만드는 플랫폼 설정이 아니다. 고정 모델 선택·하드 예산 제한은 확인하지 않았다. 유료 개발이나 비용 비교는 별도 승인 후 수행한다. 비용 절감률은 미측정이다. 비교 절차는 `docs/devin/COST-COMPARISON.md`, 현재 검증 기록은 `docs/devin/VERIFICATION.md`에 있다.

## 공식 근거
- https://docs.devin.ai/cli/extensibility/rules — `.devin/` rules, trigger, config import 제어. 2026-10-23 확인.
- 공식 문서는 비용 절감을 위해 상시 규칙을 작게 유지하고 관련 시에만 로드되는 Skills 활용을 권장한다. 현재 버전은 짧은 규칙과 명시적 문서 참조를 사용하며 별도 Skill은 추가하지 않는다.
