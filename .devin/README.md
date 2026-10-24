# Devin Desktop · Local 경량 하네스

동일한 완료 기준·변경 품질·검증 수준을 유지하면서 장기 자율 실행을 끝낼 때까지의 총 입력·출력 토큰을 줄이는 것이 목표다. 충분한 단일 설계와 장기 자율 실행을 유지하면서 사용자 재개 메시지·중복 오케스트레이션·반복 컨텍스트 주입을 줄인다. 주 사용 환경은 **Devin Desktop의 Devin Local**이다. Pi·Claude 설치나 npm 패키지 설치는 필요 없다.

## 다른 PC·프로젝트에 설치
신뢰할 수 있는 저장소 사본에서 아래 설치기를 실행한다. **Node.js 18+**가 필요하며 npm install·관리자 권한은 요구하지 않는다. 설치기는 명시된 배포 파일 18개만 대상 프로젝트의 `.devin/`과 `docs/devin/`에 설치한다. 작업 상태·개인 설정까지 섞일 수 있으므로 사용 중인 폴더 전체를 재귀 복사하지 않는다. 루트 package.json·`.pi/`·`.claude/`·`.harness/`는 설치하지 않는다.

```text
대상 프로젝트/
├─ .devin/
│  ├─ config.json
│  ├─ rules/autonomous-execution.md
│  ├─ skills/
│  │  ├─ task-start/SKILL.md
│  │  ├─ task-resume/SKILL.md
│  │  └─ task-finish/SKILL.md
│  ├─ task.example.json
│  ├─ tools/
│  │  ├─ install.cjs
│  │  └─ validate-task.cjs
│  └─ tests/
│     ├─ install.test.cjs
│     ├─ native-layout.test.cjs
│     └─ validate-task.test.cjs
└─ docs/devin/
   ├─ INSTRUCTIONS.md
   ├─ START.md
   ├─ DESIGN.template.md
   ├─ STATE.template.md
   ├─ COST-COMPARISON.md
   └─ VERIFICATION.md
```

저장소 루트에서 대상 경로를 실제 프로젝트로 바꿔 실행한다. 공백·한글이 있는 경로도 따옴표로 감싼다.

```sh
node .devin/tools/install.cjs --target "C:\work\my-project" --dry-run
node .devin/tools/install.cjs --target "C:\work\my-project"
```

`--dry-run`도 실제 설치와 같은 사전 검사를 수행하지만 파일·디렉터리를 만들지 않는다. macOS/Linux에서는 대상 경로를 `/path/to/project` 형태로 지정한다. 코드는 OS 공통 Node API를 사용하며 실제 검증 환경은 Windows/Node 24다. 다른 OS·Node 18 실측은 아직 수행하지 않았다.

### 설치 안전 경계
- 대상 프로젝트 폴더는 미리 존재해야 한다. `.devin/` 또는 `docs/devin/`이 파일·폴더·끊어진 링크를 포함해 이미 있으면 덮어쓰지 않는다. 자동 병합·업데이트·force 옵션은 없으며 기존 구성은 사람이 검토·병합한다.
- 원본 파일·경로 및 대상·상위 경로의 심볼릭 링크/Node가 인식하는 junction을 거부한다. 원본과 대상이 같거나 서로 포함하는 경로도 거부한다. 기존 일반 `docs/`와 다른 프로젝트 파일은 보존한다.
- 허용 목록만 복사한다. `.devin/task.json`, `state/`, `tasks/`, `config.local.json`, 추가 Skills, 실제 `DESIGN.md` 등 개인·실행 자료는 설치하지 않는다. 외부 명령·Devin·npm 설치·프로젝트 테스트를 설치기가 실행하지 않는다.
- 쓰기 실패 시 이번 실행이 생성한 동일 파일·빈 디렉터리만 정리한다. 예기치 않은 파일·소유 변경은 보존하고 정리 미완료 경로를 오류에 표시한다. 재귀 삭제는 하지 않는다.
- 링크 검사는 시점 검사다. 적대적인 동시 경로 교체에 대한 보안 경계나 강제 종료·전원 차단의 원자성을 보장하지 않는다. 설치 중 원본·대상을 다른 작업으로 변경하지 않는다. 실패 후 잔여 경로가 있으면 내용을 확인하고 수동으로 복구하며 무조건 삭제하거나 재설치하지 않는다.

## 네이티브 로드와 기존 규칙 이관
공식 문서는 **Devin Local이 Devin CLI와 같은 에이전트 하네스를 공유**한다고 설명하며, Desktop 문서는 `.devin/rules/*.md` 자동 탐색과 `trigger: always_on`을 지원한다고 명시한다. 이 패키지는 안전 핵심과 조건별 인덱스만 상시 규칙에 두고, 세 가지 네이티브 Skill을 필요한 때에만 사용한다. 긴 설계·실행 상태는 필요할 때 파일로 읽으며, `.devin/global_rules.md`나 별도 루트 AGENTS.md에 같은 규칙을 중복 등록하지 않는다. **Cascade Memories·Workflows에 의존하지 않는다.**

`config.json`의 `read_config_from`은 `agents_standard`, `cursor`, `windsurf`, `claude`를 false로 설정한다. 이는 기존 AGENTS/Claude/Cursor/Windsurf 지침과 무거운 하네스의 중복 import를 막기 위한 의도적인 선택이다. **그 결과 필수 프로젝트 지침도 자동 import되지 않을 수 있다.** 실행 전에 기존 AGENTS.md·CLAUDE.md 등의 API 계약·보안·빌드·테스트·금지 규칙을 검토하고 필요한 규칙을 네이티브 규칙 또는 작업 설계로 옮긴다. 회사 필수 규칙을 제거하지 않는다. 필요한 import를 유지할 경우 설정을 병합하고 중복 지침을 점검한다. 파일 자체는 삭제하거나 수정하지 않는다.

`read_config_from`은 CLI 문서 근거의 import 설정이다. Local의 공유 하네스 근거만으로 Desktop 전역 설정·다른 플러그인·회사 정책까지 차단한다고 보장하지 않는다. 실제 설치 버전에서 활성 규칙과 config.local.json 등 개인 설정을 확인한다. **공식 지원 근거와 별개로 실제 Desktop/Local 자동 로드·자율 준비 실사용은 미검증**이다.

## Desktop에서 사용
1. 처음에만 `.devin/`과 `docs/devin/`을 설치하고 필수 프로젝트 규칙을 확인한다. Desktop에서 대상 프로젝트 루트를 연다.
2. 설치·규칙 변경 후 새 대화에서 에이전트 선택을 **Devin Local**, 작업을 실행할 수 있는 **Normal** 모드로 맞춘다. Restricted Mode에서는 에이전트가 비활성화된다. 파일 읽기·쓰기·명령 실행의 필요한 권한만 허용하고, 회사 설정·권한 요청을 우회하지 않는다. 이 하네스는 권한 창을 없애는 설정이 아니다.
3. 평소처럼 구현·수정을 요청한다. 특별한 시작 문구나 사용자의 설계·JSON 수작업은 필요하지 않도록 지침을 구성했다. 설명·질문만 하는 요청에는 작업 파일을 만들지 않는다.
4. Local이 코드로 확인할 수 없는 필수 결정만 묻고, 설계·작업 JSON·상태 파일을 준비한 뒤 구현·검증·수정·자체 리뷰를 이어가도록 안내한다. 기존 같은 작업은 재개하며 다른 작업 파일은 덮어쓰지 않는다.

처음 쓰는 기본 경로는 `docs/devin/DESIGN.md`, `.devin/task.json`, `.devin/state/STATE.md`다. 충돌하는 기존 파일이 있으면 고유한 `.devin/tasks/<task-id>/`에 `DESIGN.md`, `task.json`, `state/STATE.md`를 둔다. 상대 stateFile은 해당 작업 JSON 기준이다. 재개 후보가 불명확할 때만 경로를 확인하며 실제 작업 경로는 상태와 최종/차단 보고에 남긴다. 작업 상태·로그의 커밋 여부는 프로젝트 정책을 따른다.

이는 규칙과 Skills에 따른 에이전트 절차이며 자동 파일 생성 프로그램이나 CLI 호출 wrapper가 아니다. 설치 후 실제 Local에서 작은 승인 작업으로 규칙 적용·Skill 선택·파일 준비·재개·검증을 확인해야 한다. 사용자가 이미 작성한 설계를 지정하는 방식도 지원한다. 슬래시 명령은 필수가 아니며 Skills의 `triggers: [user, model]`로 모델 사용을 허용했다. 별도 모델·서브에이전트·도구 권한 확장은 설정하지 않았다.

## 조건별 로딩
| 조건 | 사용할 Skill |
|---|---|
| 새 작업·계약 누락/충돌 | `.devin/skills/task-start/SKILL.md` |
| 재개·검증 실패·상태 정리 | `.devin/skills/task-resume/SKILL.md` |
| 완료 또는 차단 보고 직전 | `.devin/skills/task-finish/SKILL.md` |

시작마다 `INSTRUCTIONS.md`를 읽던 연결은 제거했다. `docs/devin/INSTRUCTIONS.md`와 `START.md`는 기존 경로 호환용 짧은 인덱스/이동 안내일 뿐 실행 매뉴얼이 아니다. 모든 Skill 본문을 미리 읽지 않는다. 설계·상태·상세 증거는 해당 작업의 필요한 부분만 조회하고, 이 README·비용 비교·검증 이력은 사람이 확인할 때 읽는다.

## 토큰 효율 적용
설계 템플릿에 탐색 시작점과 관련 자료 위치를 채운다. 필요한 조사·테스트·안전 규칙은 줄이지 않는다. 루트 규칙 외에 Skill 이름·설명 등 메타데이터도 초기 비용이며, 선택한 본문·도구 출력·상태 재조회·재시도 비용은 별도다. 파일 분리만으로 이미 읽은 내용이 대화 맥락에서 제거되지는 않는다.

초기 이해 후에는 현재 단계에 필요한 맥락을 조회한다. 상태 파일은 누적 일지가 아니라 현재 요약으로 유지하고, 과거 상세 근거는 별도 이력에 보관·참조한다. 요약해도 기준별 상태·미해결 위험·승인 경계·누적 복구 횟수는 보존한다. 플랫폼의 대화 기록을 직접 삭제하거나 자동 압축을 강제하는 기능은 아니다.

같은 목표의 분석·수정·검증은 묶고 독립 작업만 보류·분리한다. 상시 규칙은 짧은 파일 하나로 유지하고 JSON 스키마·검사기는 변경하지 않는다. 아래 원본 전용 검사는 인덱스 경로·Skill 메타데이터·안전 지침·전체 매뉴얼 자동 로딩 방지 계약도 확인하지만 실제 Devin 선택·준수나 토큰 절감을 증명하지 않는다. 비교 절차는 `docs/devin/COST-COMPARISON.md`를 따른다.

## 오프라인 검사
Node.js 18 이상이 필요하다. npm install은 필요 없다. 설치한 대상 프로젝트 루트에서는 작업 검사와 검사 도구 테스트를 실행한다. 실제 작업 계약은 task.example.json 대신 task.json으로 검사한다.

```sh
node .devin/tools/validate-task.cjs .devin/task.example.json
node --test .devin/tests/validate-task.test.cjs .devin/tests/install.test.cjs
```

`native-layout.test.cjs`는 **수정하지 않은 배포 원본 전용** 계약 검사다. 원본 저장소 루트에서만 추가 실행한다.

```sh
node --test .devin/tests/native-layout.test.cjs
```

배포 원본 검사는 import 설정 네 값이 false이고 규칙 파일이 하나이며 지정된 Skills 세 개와 짧은 호환 인덱스가 있는지 확인한다. 대상 프로젝트에서 필요한 import·안전 규칙·추가 Skills를 병합한 경우 원본 전용 검사가 실패할 수 있으며 설치 오류를 의미하지 않는다. 이 경우 병합된 설정·활성 규칙·Skills를 별도로 검토한다.

JSON 검사기는 입력 명령을 실행하거나 상태 파일을 만들지 않는다. 설치기 테스트는 임시 프로젝트에서 설치·거부·복구를 검증하고 실제 프로젝트에는 설치하지 않는다. 경로 검사는 문자열 검사이며 심볼릭 링크 대상이나 쓰기 권한을 보장하지 않는다. 실제 파일 쓰기는 승인된 프로젝트 내부에서 수행한다. 검사 도구는 설계 문서의 완전성이나 실행 지침 준수를 보증하지 않는다.

## 비용 한계
allowPaidExecution=false는 오프라인 준비 과정의 제한이며 Devin의 사용료를 0으로 만드는 플랫폼 설정이 아니다. 고정 모델 선택·하드 예산 제한은 확인하지 않았다. 유료 개발이나 비용 비교는 별도 승인 후 수행한다. 비용 절감률은 미측정이다. 비교 절차는 `docs/devin/COST-COMPARISON.md`, 현재 검증 기록은 `docs/devin/VERIFICATION.md`에 있다.

## 공식 근거
- https://docs.devin.ai/desktop/devin-local — CLI와 공유하는 하네스·권한 모델·Normal 모드, Cascade Memories/Workflows 미지원.
- https://docs.devin.ai/desktop/cascade/memories — Desktop의 `.devin/rules` 자동 탐색·activation mode.
- https://docs.devin.ai/cli/extensibility/rules — `.devin/` rules, trigger, config import 제어.
- https://docs.devin.ai/cli/extensibility/skills/overview — 프로젝트 `.devin/skills/<name>/SKILL.md`, user/model trigger.
- https://docs.devin.ai/cli/extensibility/skills/creating-skills — name·description·triggers 메타데이터 형식. 권한 확장이나 subagent 실행 옵션은 사용하지 않는다.
