# 검증 현황

## 현재 변경 — 기존 설치 명령의 Devin 컴포넌트

### 범위와 의도
별도 사용자 설치 명령을 추가하는 것이 아니라 기존 `init-target-harness.sh/.ps1/.py`에 `devin` 선택지를 연결했다. CMD는 기존 전달 경로 그대로 `-Component devin`을 지원한다. Shell/PowerShell은 선택한 ref를 임시 clone하고, Python은 로컬 체크아웃을 사용하며, 실제 복사는 기존 안전 Node helper에 위임한다. Devin 분기는 일반 target/ 복사·clean·CoreNLP·Pi 실행 전에 끝난다. 기본 `all`은 workflow+memory+claude 그대로이며 Node도 새로 요구하지 않는다. Devin은 명시적 단독 선택으로만 설치하고 Force/Clean·컴포넌트 혼합·사용자 지정 source 옵션은 거부한다. 기존 업데이트 스크립트는 변경하지 않았다.

### 검증 근거
| 확인 | 명령/방법 | 결과 |
|---|---|---|
| RED | 통합 설치 테스트의 기본 설치 사례 4개, 구현 전 실행 | Python/Shell/PowerShell/CMD 모두 devin 미지원으로 실패 |
| 통합 설치 | `python -m pytest tests/test_devin_component_install.py -q` | 44개 통과, 실패·건너뜀 0 |
| 기존 설치 회귀 포함 | `python -m pytest tests/test_devin_component_install.py tests/test_component_install_update.py -q` | 59개 통과·실패 0·기존 Windows 제외 2개 건너뜀 |
| 기존 Devin 검사 | `npm run test:devin` | 45개 통과·실패 0·기존 파일 symlink 권한 제한 1개 건너뜀 |
| 구문 | `npm run lint:devin`, `bash -n`, Python AST, PowerShell Parser | 모두 통과 |
| 독립 리뷰 | reviewer run `73c2d420-c6da-4ad7-9222-027241edac2d`, 연결 diff 8개 파일 정적 검토 | 구체적 결함 없음. Merge verdict: OK with notes. 직접 Git/테스트 실행은 하지 않음 |

44개 통합 검사는 임시 로컬 Git 저장소만 사용한다. Shell은 표준입력으로 전달해 `curl | sh` 형태를 재현했고, PowerShell·CMD·Python도 다른 프로젝트 cwd에서 실제 파일 설치를 확인했다. 기본 all의 Node 불필요·Devin 제외, dry-run 대상 무변경, 없는 대상 미생성, 기존 파일 보호, Node 부재, force/clean·혼합 거부, bundle 없는 ref의 안전 실패, 원래 경로의 링크 검사 전달을 각 진입점에서 검증했다. 테스트는 GitHub·Docker·Devin에 접속하지 않았다.

리뷰 보고서는 `I:/harness/.pi/subagent-artifacts/devin-component-integration-review-r1.md`에 보관했다. 메인은 원래 대상 경로 전달, destructive 옵션의 사전 거부, 기본 all의 불변성, 문서의 URL/ref 일치를 대조했다. 검토 결과 수집·분류를 마쳤고 진행 중인 위임 작업은 없다.

### 한계와 전달
검증 환경은 Windows/Git Bash/PowerShell 5.1/CMD/Python 3.14/Node 24다. 네이티브 macOS/Linux·Node 18 및 실제 Devin Local 적용·토큰 효과는 미검증이다. 다운로드된 진입점과 clone 대상 ref를 일치시켜야 하며, main 반영 전에는 URL과 `--ref`/`-Ref` 모두 `feat/devin-local-installer`를 사용한다. 원격 main을 변경하지 않고 기존 기능 브랜치에 추가 커밋으로 전달한다.

## 이전 개선 — 설치기·배포 검증

### 범위와 안전 경계
`.devin/tools/install.cjs`에 Node.js 18+ 설치기를 추가했다. 기존 승인된 Local Skills 구성과 함께 허용 목록의 배포 파일 18개만 복사한다. 기존 `.devin/`·`docs/devin/`, 심볼릭 링크/Node가 인식하는 junction, 원본·대상 중첩은 거부한다. 작업 상태·개인 설정·추가 Skills와 Pi/Claude 하네스·루트 package.json은 설치하지 않는다. dry-run은 같은 사전 검사만 수행한다. 설치기가 외부 명령·Devin·npm 설치·프로젝트 검증을 실행하지 않는다. 쓰기 실패는 이번 실행 소유 파일·빈 디렉터리만 정리하며 예기치 않은 자료는 보존하고 정리 미완료를 보고한다. 적대적 동시 경로 교체나 프로세스 강제 종료에 대한 원자성은 보장하지 않는다.

### 구현·검증 근거
| 확인 | 명령/방법 | 결과 |
|---|---|---|
| RED | 설치기 구현 전 `node --test --test-reporter=tap .devin/tests/install.test.cjs` | 최초 설치기 검사 16개 실패, exit 1 |
| 전체 검사 | 세 테스트 파일에 `node --test --test-reporter=tap` | 46개 중 45개 통과, 실패 0, 건너뜀 1, exit 0 |
| 프로젝트 테스트 연결 | `npm run test:devin` | 같은 46개: 45 통과·실패 0·건너뜀 1, exit 0 |
| 구문 검사 | `npm run lint:devin` | 설치기·검사기·테스트 CJS 5개 통과, exit 0 |
| 실제 설치 smoke | 임시 프로젝트에 CLI 설치 후 배포된 validator·세 테스트 실행 | 18개 파일 설치·JSON 유효, 45 통과·실패 0·건너뜀 1 |
| 제외 경계 | 배포 대상의 `.pi`·`.claude`·`.harness`·package.json·실제 task.json 확인 | 모두 없음 |
| 독립 리뷰 | 읽기 전용 reviewer run `542ce620-876d-4094-826e-072c10b323f2` | 변경 17개와 staged diff 확인, 구체적 결함 없음. Merge verdict: OK with notes. Git·테스트 직접 재실행은 하지 않음 |

### 회귀 범위와 한계
정상 설치·dry-run·재설치/기존 파일 거부·공백/한글 경로·원본 불완전·경로 중첩·개인 자료 제외·디렉터리 링크·끊어진 링크·쓰기 실패 복구·예기치 않은 파일 보존·설치 중 충돌·설치본 재배포·CLI 인자를 검사했다. 파일 심볼릭 링크 검사는 Windows EPERM으로 1개 건너뛰었고, 디렉터리 junction 관련 검사는 실제 실행했다. 검증 환경은 Windows/Node v24.14.0이다. Node 18·macOS/Linux 실측, 실제 Devin Local 자동 적용/실행·비용 효과는 여전히 미검증이다. 유료 Devin 호출은 수행하지 않았다.

독립 리뷰 보고서는 `I:/harness/.pi/subagent-artifacts/devin-local-installer-review-r1.md`에 보관했다. 메인 자체 검토도 덮어쓰기·링크·rollback·배포 경계·문서/명령 일치를 확인했다. 예상 밖 자료 보존·한도·미검증 표시를 유지하며, 남은 사항은 위 검증 한계다. 리뷰 결과 수집·분류를 마쳤고 진행 중인 위임 작업은 없다.

원본 체크아웃은 커밋 없는 master와 미추적 사용자 파일을 유지한다. 전달용 변경만 원격 main `d09f6c5` 기반 `.worktrees/devin-local-installer`의 `feat/devin-local-installer`에서 검토·커밋·push한다. 원격 main과 다른 사용자 파일을 덮어쓰지 않는다.

## 이전 개선 — 조건부 Skills와 짧은 인덱스

### 목표와 범위
시작마다 긴 INSTRUCTIONS.md를 읽던 연결을 제거했다. 상시 규칙은 안전·검증·자율 실행의 최소 원칙과 조건별 경로만 유지한다. `.devin/skills/task-start`, `task-resume`, `task-finish`로 준비·재개/복구·완료 검증을 분리하고 `triggers: [user, model]`을 사용한다. 별도 모델·도구 권한·서브에이전트 설정은 추가하지 않았다. 기존 INSTRUCTIONS.md·START.md 경로는 짧은 호환 인덱스로 유지한다. 설계·상태 템플릿, JSON 스키마·예제·검사기·앱 소스는 변경하지 않았다.

### 공식 근거와 결정
- https://docs.devin.ai/cli/extensibility/rules — Rules/AGENTS 최소화와 관련 시에만 주입되는 Skills 사용 권장.
- https://docs.devin.ai/cli/extensibility/skills/overview — 프로젝트 `.devin/skills/<name>/SKILL.md`와 user/model trigger.
- https://docs.devin.ai/cli/extensibility/skills/creating-skills — name·description·triggers 형식. 권한 확장·별도 모델·agent/subagent 옵션은 사용하지 않는다.
- https://docs.devin.ai/desktop/devin-local — Local과 CLI의 공유 하네스 근거. 실제 설치 버전의 선택·로드 동작은 별도 확인 대상이다.

### 실행 근거
| 확인 | 명령/방법 | 결과 |
|---|---|---|
| RED | `node --test --test-reporter=tap .devin/tests/native-layout.test.cjs` | 새 구조 계약 적용 직후 20개 중 5개 통과·15개 실패, exit 1 |
| 최종 GREEN | `node --test --test-reporter=tap .devin/tests/validate-task.test.cjs .devin/tests/native-layout.test.cjs` | 28개 통과, 실패·건너뜀 0, exit 0 |
| JSON 검사 | `node .devin/tools/validate-task.cjs .devin/task.example.json` | exit 0. 입력 명령 실행·상태 생성 없음 |
| 구문 검사 | 검사기·두 테스트 파일에 각각 `node --check <file>` | 3개 모두 exit 0 |
| 공백 검사 | 변경·신규 10개 파일에 `git diff --no-index --check -- /dev/null <file>` | 공백 오류 진단 없음. no-index exit 1은 파일 차이 |
| 자체 검토 | 이전 지침과 세 Skill의 경계·증거·복구·권한 규칙 대조 | 정적 검토. 독립 리뷰는 미수행 |

### 정적 크기 비교
| 항목 | 이전 | 현재 |
|---|---|---|
| 상시 규칙 | 555자 | 817자: 최소 안전 규칙을 이곳에 보존 |
| 시작에 강제로 읽던 INSTRUCTIONS.md | 3,417자 | 466자 호환 인덱스, 자동 로드 연결 없음 |
| START.md | 1,441자 준비 매뉴얼 | 184자 이동 안내, 자동 로드 연결 없음 |
| 조건부 절차 | 위 문서에 혼재 | task-start 1,704자 / task-resume 987자 / task-finish 729자 |

이전에는 상시 규칙과 INSTRUCTIONS.md 합계 3,972자를 읽도록 지시했다. 현재는 상시 규칙 외에 네이티브 Skill 메타데이터의 초기 비용이 있으며, 선택한 본문만 추가한다. 세 Skill frontmatter 파일 텍스트 합계 322자는 참고값이지 실제 주입 형식이나 토큰 측정값이 아니다. 시작 Skill·다른 Skill의 선택/중복 호출·경로 메타데이터·도구 출력·캐시·후속 대화까지 포함한 실제 절감률은 unknown이다. 파일 분리로 이미 읽은 내용이 대화에서 제거되는 것은 아니다.

### 회귀 확인표
| 상황 | 목표 | 근거·한계 |
|---|---|---|
| 일반 설명·질문 | 상시 안전·인덱스만, 작업 파일 미생성 | 정적 문구 계약. 실제 Skill 비선택은 미검증 |
| 새 구현·계약 누락 | task-start만 선택하고 실제 요청의 파일·검증 준비 | 경로·네이티브 metadata·기존 준비 계약 정적 검사 |
| 재개·검증 실패·상태 비대화 | task-resume으로 유효 근거 복원·누적 복구·이력 관리 | 보존 항목·누락 재검증·한도 정적 검사 |
| 완료·차단 보고 | task-finish에서 현재 변경의 필수 검증·자체 리뷰·기준별 근거 확인 | 미검증·실패 은폐/테스트 약화 금지 정적 검사 |
| 전체 지침 재주입 | 루트/Skills에서 구 매뉴얼 자동 읽기 금지, 메타데이터만 간결히 유지 | 자동 경로 부재·짧은 호환 인덱스·권한 확장 부재 검사 |

### 미검증과 한계
이번 검증은 파일·문구·메타데이터 계약에 한정된다. 실제 Desktop/Local의 Skills 발견·조건 선택·동시/반복 로딩·자율 실행·재개·토큰/비용 효과는 미검증이며 승인된 작업으로 dogfood가 필요하다. 유료 Devin 호출은 수행하지 않았다. 필수 안전 규칙·검증 수준은 유지했으며 정적 문자 수 차이를 실제 토큰 절감으로 주장하지 않는다.

## 이전 개선 — Desktop의 Devin Local 기본 사용

### 목표와 범위
주 사용 환경을 Desktop의 Devin Local로 확정했다. 상시 규칙·실행 지침·README를 일반 구현 요청에서 설계·작업 JSON·상태를 준비하도록 수정했다. 사용자의 수동 파일 작성이나 특별한 시작 문구를 요구하지 않되, 설명·질문에는 파일을 만들지 않는다. 상세 준비 절차는 `START.md`로 분리해 새 작업·파일 누락·경로 충돌·재개 불명확 시에만 읽는다. 기존 같은 작업은 실제 경로·누적 복구 횟수를 유지하고, 다른 작업은 고유 경로를 사용한다. JSON 스키마·검사기·기본 예제·앱 소스는 변경하지 않았다.

### 공식 근거
- https://docs.devin.ai/desktop/devin-local — Local은 CLI와 에이전트 하네스를 공유하며 자체 모드·권한 모델을 사용한다. Cascade Memories/Workflows는 지원하지 않는다. Restricted Mode에서는 에이전트를 사용할 수 없다.
- https://docs.devin.ai/desktop/cascade/memories — Desktop의 `.devin/rules` 자동 탐색·우선 경로와 `trigger` activation mode가 문서화되어 있다.
- https://docs.devin.ai/cli/extensibility/rules — rules·import 설정의 CLI 근거. 이를 Desktop의 모든 전역 설정·회사 정책 차단 보장으로 확대하지 않았다.

### 실행 근거
| 확인 | 명령/방법 | 결과 |
|---|---|---|
| RED | `node --test --test-reporter=tap .devin/tests/native-layout.test.cjs` | 기존 13개 통과, Local 준비·경로·실제 검증·Desktop 안내 계약 4개 실패, exit 1 |
| 최종 GREEN | `node --test --test-reporter=tap .devin/tests/validate-task.test.cjs .devin/tests/native-layout.test.cjs` | START.md 분리 후에도 25개 통과, 실패·건너뜀 0, exit 0 |
| JSON 검사 | `node .devin/tools/validate-task.cjs .devin/task.example.json` | exit 0. 입력 명령 실행·상태 생성 없음 |
| 구문 검사 | 검사기·native-layout 테스트에 각각 `node --check <file>` | 두 파일 모두 exit 0 |
| 공백 검사 | 변경·신규 8개 파일에 `git diff --no-index --check -- /dev/null <file>` | 공백 오류 진단 없음. no-index exit 1은 파일 차이 |
| 상시 규칙 | 변경 전후 문자 수와 단일 파일 계약 | 506→555자, 파일 1개 유지. 토큰 측정값은 아님 |
| 자체 검토 | 실제 작업 경로·문서 간 연결·복구 횟수·권한 경계 대조 | 정적 검토. 독립 리뷰는 미수행 |

### 회귀 확인표
| 상황 | 목표 | 검증 수준·잔여 위험 |
|---|---|---|
| 일반 구현 요청 | Local이 필요한 결정만 질문하고 준비·실행 | 정적 문구 계약. 실제 Local 파일 준비는 미검증 |
| 질문·설명 요청 | 불필요한 작업 파일 미생성 | 정적 문구 계약. 에이전트 준수 확인 필요 |
| 기존·부분·다른 작업 | 재사용·누락 보완·고유 경로 분리, 덮어쓰기/복구 횟수 초기화 금지 | 정적 문구 계약. 심볼릭 링크·경로 검사는 프로그램으로 강제하지 않음 |
| 새 작업/재개 | START는 필요 시에만 읽고 정상 재개는 상태·관련 설계 참조 | 문서 연결 및 정적 계약. 자동 압축을 구현한 것은 아님 |
| 검증 | 실제 프로젝트 명령 사용, 예제 자체 검사로 대체 금지 | 기존 검사기 회귀와 정적 계약. Node 부재 시 수동 확인·도구 미실행 표시 |
| Desktop 정책 | Devin Local/Normal 사용, 권한·Restricted Mode·회사 정책 보존 | 공식 문서·정적 안내. 권한 요청 우회 설정 없음 |

### 미검증과 한계
공식 지원 근거 확인과 에이전트 절차의 실사용 검증은 다르다. 실제 Desktop/Local 실행·자동 로드·자율 준비·충돌 복구·장기 실행·비용 비교는 수행하지 않았다. 파일 준비는 LLM 지침이며 독립 자동 생성 프로그램이 아니다. 유료 Devin/LLM 호출은 실행하지 않았고 실제 토큰·비용 절감률은 unknown이다. 설치 후 승인된 작은 작업에서 일반 요청만으로 파일 준비·재개·검증되는지 먼저 확인해야 한다.

## 이전 개선 — 장기 자율 실행의 작업 맥락·상태 관리

### 목표와 범위
최적화 대상을 짧은 작업의 초기 입력이 아니라 동일 품질의 장기 자율 실행 누적 토큰으로 확정했다. 초기 설계 이해 후 현재 단계의 맥락을 조회하며, 상태 파일을 누적 일지가 아닌 현재 요약으로 관리하도록 지침·템플릿·README를 보완했다. 과거 상세 근거와 전체 이력 목록은 별도 이력·색인으로 분리하고 필요한 참조만 조회한다. 실제 상태 초기 작성 후 양식 안내만 제거하며 사용자 기록은 보존한다. 완료 기준별 상태·미검증·미해결 위험·전역 제약·승인 경계·누적 복구 횟수는 요약 시에도 보존한다. 비교 절차는 초기 비용과 반복 비용을 구분하고 장기 실행 초반·중반·후반을 관측하도록 수정했다.

### 실행 근거
| 확인 | 명령/방법 | 결과 |
|---|---|---|
| RED | `node --test --test-reporter=tap .devin/tests/native-layout.test.cjs` | 기존 10개 통과, 장기 실행 문구 계약 3개 실패, exit 1 |
| 추가 RED | 같은 명령에 `--test-name-pattern="checkpoint offloading"` 적용 | 양식 안내 제거 계약 추가 후 해당 검사 실패, exit 1 |
| 최종 GREEN | `node --test --test-reporter=tap .devin/tests/validate-task.test.cjs .devin/tests/native-layout.test.cjs` | 21개 통과, 실패·건너뜀 0, exit 0 |
| 작업 JSON 검사 | `node .devin/tools/validate-task.cjs .devin/task.example.json` | exit 0. 입력 명령은 실행하지 않음 |
| 구문 검사 | 검사기·두 테스트 파일에 각각 `node --check <file>` | 모두 exit 0. 최종 테스트 수정 후 native-layout도 재검사 통과 |
| 공백 검사 | 변경 7개 파일에 `git diff --no-index --check -- /dev/null <file>` | 공백 오류 진단 없음. no-index exit 1은 파일 차이 |
| 자체 검토 | 단계별 의존 확인·참조 누락·요약 보존 항목·누적 복구 상한 대조 | 정적 검토. 독립 리뷰는 미수행 |

### 회귀 확인표
| 상황 | 목표 | 근거·한계 |
|---|---|---|
| 장기 단계 전환 | 현재 작업 맥락 조회와 전역 제약·의존 관계 확인 | 정적 문구 계약. 필수 회귀·통합 검증은 유지 |
| 상태 비대화 | 상세 근거·전체 이력 색인 분리, 양식 안내 제거 | 정적 문구 계약. 실제 파일 관리·토큰 감소는 미검증 |
| 요약·재개 | 보관 내용·참조 확인, 누락 시 미검증·재조사 | 정적 문구 계약. 복구 횟수·승인 경계는 초기화 금지 |
| 장기 효과 비교 | 초기/반복 비용과 초반·중반·후반 상태·읽기량 비교 | 절차 정적 검사. 실패·재시도·요약·보관 비용도 집계 |

### 미검증과 한계
유료 Devin/LLM 호출·실제 자율 실행·효과 비교는 수행하지 않았다. 지침은 추가 읽기·출력을 줄이도록 안내할 뿐 플랫폼의 대화 기록 제거·자동 압축을 강제하지 않는다. 상태·맥락의 크기를 기계적으로 제한하는 구현이 아니며, 실제 토큰·비용 절감률은 unknown이다. 지침 증가분과 요약·보관 비용까지 포함한 승인된 장기 실행 dogfood가 필요하다. 상시 규칙·JSON 스키마·검사기·앱 소스는 이번에도 수정하지 않았다.

## 이전 개선 — 동일 품질·총토큰 효율

### 목표와 범위
완료 기준·변경 품질·필수 검증을 보존하면서 작업당 총 입력·출력 토큰을 줄이도록 실행 지침을 개선했다. 파일·함수·재현에서 출발하는 점진 탐색, 원본 로그와 대화용 요약 분리, 변경된 근거 재확인, 간결한 상태·최종 보고, 독립 작업 보류를 추가했다. 설계·상태 템플릿과 README를 연결하고 비용 비교를 변경 전/후 Devin 직접 실행으로 정렬했다. JSON 스키마·검사기·설정·상시 규칙·앱 코드는 변경하지 않았다.

### 실행 근거
| 확인 | 명령/방법 | 결과 |
|---|---|---|
| RED | `node --test --test-reporter=tap .devin/tests/native-layout.test.cjs` | 기존 3개 통과, 새 문구 계약 7개 실패, exit 1 |
| GREEN | `node --test --test-reporter=tap .devin/tests/validate-task.test.cjs .devin/tests/native-layout.test.cjs` | 18개 통과, 실패·건너뜀 0, exit 0 |
| 작업 JSON 검사 | `node .devin/tools/validate-task.cjs .devin/task.example.json` | exit 0. 명령 실행·상태 쓰기 없음 |
| 구문 검사 | 검사기·두 테스트 파일에 각각 `node --check <file>` | 3개 모두 exit 0 |
| 공백 검사 | 변경 파일에 `git diff --no-index --check -- /dev/null <file>` | 공백 오류 진단 없음. 미추적 파일도 검사했으며 no-index의 exit 1은 파일 차이를 뜻함 |
| 자체 검토 | 변경한 지침·템플릿·비교 절차·테스트 대조 | 승인 경계·복구 상한·미검증 표시 유지. 독립 리뷰는 미수행 |
| 상시 주입 | 수정 전 내용과 문자열 대조 | 상시 규칙 506자 그대로. 문자 수는 토큰 측정값이 아님 |

### 회귀 확인표
| 상황 | 이전 | 목표 | 검증 수준·잔여 위험 |
|---|---|---|---|
| 탐색 시작·무결과 | 구체적 시작점/확장 규칙 없음 | 관련 구간부터 조사, 증거 부족·잘림 시 확장 | 정적 문구 계약. 실제 조사 품질은 dogfood 필요 |
| 도구 출력 | 요약·원본·종료 코드 구분 미지정 | 원본 증거 보관, 실패·경고·종료 코드 보존 | 정적 문구 계약. 실행 래퍼나 강제 장치는 아님 |
| 재개 | 상태와 필요한 설계 참조 | 짧은 상태 유지, 변경된 파일·규칙 재확인 | 정적 문구 계약. 오래된 근거 재사용 방지는 실사용 확인 필요 |
| 검증 수준 | 완료 기준별 실제 근거 요구 | 좁은 테스트 후 필수 회귀·통합 검증 유지 | 정적 문구 계약 및 기존 JSON 검사 회귀 통과 |
| 작업·보고 | 자율 실행·완료 근거 보고 | 같은 목표는 연결, 독립 작업 보류, 짧은 근거 보고 | 정적 문구 계약. 실패·미검증은 생략하지 않음 |
| 효과 측정 | Pi 경유/직접 실행 비용 비교 | Devin 지침 변경 전/후 총토큰·완료율·품질 비교 | 절차 정적 검사. 실패·중단·재시도 포함, unknown 유지 |

### 미검증과 한계
실제 Devin 실행·유료 호출·비용 비교는 수행하지 않았다. 문구 계약 테스트는 LLM의 지침 준수나 실제 동작을 입증하지 않는다. 상세 실행 지침은 1,496자에서 2,470자로 늘었으므로 초기 입력 오버헤드가 있으며, 반복 탐색·출력 감소로 상쇄되는지는 미측정이다. 템플릿 증가분과 모든 세션·실패·재시도까지 포함한 비교가 필요하다. 토큰·비용 절감률은 unknown이며 사용자 승인 후 dogfood가 필요하다.

아래는 이번 변경 이전의 검증 이력이며 이번 실행 결과와 구분한다.

## 이전 변경
카탈로그와 별도인 자동 품질 게이트의 npm ENOENT까지 수정했다. Windows npm 해석을 `detectBuildSystem` 공통 반환값으로 이동해 테스트·빌드·자동 품질 게이트가 같은 Node/npm-cli.js 호출을 사용하도록 통합했다. 중복된 카탈로그 전용 분기는 제거했다. 사용자 reload 후 최종 테스트 11/11과 구문 검사 및 자동 리뷰 승인 품질 게이트가 모두 통과했다. 게이트 예외나 생략은 사용하지 않았다.
사용자 요청으로 기존 `devin/` 초안을 네이티브 `.devin/` 및 `docs/devin/` 구성으로 옮겼다. 기존 `devin/README.md`는 이전 경로 안내만 유지한다. 루트 package.json은 이전에 승인된 테스트 연결용 파일이며 새 경로를 참조한다.

## 실행 근거
| 확인 | 방법 | 결과 |
|---|---|---|
| CLI 규칙·import 설정 근거 | 공식 https://docs.devin.ai/cli/extensibility/rules 확인 | `.devin/rules/*.md`, trigger: always_on, read_config_from 확인 |
| JSON 구문 | .devin/config.json, .devin/task.example.json, package.json을 JSON.parse | 통과 |
| 파일·경로 정적 확인 | .devin/ 및 docs/devin/ 파일 목록과 내용 검사 | 규칙 1개와 분리된 상세 문서 확인 |
| 프로젝트 테스트 | 공통 resolver 수정 및 reload 후 workflow_run_command(project-test) | exit 0. 11개 통과, 실패 0, 건너뜀 0. 실행기 포함 약 4.4초 |
| 구문 검사 | 공통 resolver 수정 및 reload 후 workflow_run_command(code-quality) | exit 0. Node --check로 CJS 3개 및 catalog.ts 통과, 약 0.35초. TS 타입 검사가 아님 |
| 자동 리뷰 승인 게이트 | submit_review_package 후 자동 품질 게이트 | 패키지 수락, Critical/Major/Minor 0, 품질 게이트 통과 및 review_approved 전이 확인 |
| RED/GREEN | 테스트를 검사 구현보다 먼저 작성했으나 초기 실행도 카탈로그에서 차단 | 미증명 |
| 독립 검토 | 읽기 전용 reviewer 최초 검토 및 수정분 재검토 완료 | 최초 Minor 3건 모두 수정 확인. 수정 범위의 추가 문제 없음. 정적 재검토에 한정 |
| 실제 CLI 자동 로드 | Devin 실행하지 않음 | 미검증 |
| Desktop 실사용 | 0회 | 미검증 |
| 실제 비용 비교 | 0회 | 절감률 unknown |
| 명시적 유료 Devin 호출 | 0회 | 수행하지 않음 |

정적 확인은 테스트 통과·실제 제품 동작·자율 실행 효과의 증거가 아니다.

## 독립 리뷰 지적과 수정
- 상태 파일 경로: NUL·끝 구분자·`.` 구성요소를 거부하도록 검사식을 수정하고 회귀 테스트를 추가했다. 해당 회귀 테스트를 포함한 11개 테스트가 통과했다.
- 경로 기준: 작업 JSON 기준 `state/STATE.md`와 프로젝트 기준 `.devin/state/STATE.md`를 지침에 구분했다.
- 설치 검사: 대상 프로젝트용 검사 명령과 수정하지 않은 배포 원본 전용 native-layout 검사를 README에서 분리했다. 병합된 안전 규칙이나 import 설정 때문에 원본 검사가 실패할 수 있음을 설명했다.
- reviewer의 원본 결과는 Pi 세션의 subagent-artifacts/e2a25ad9-df99-410b-8104-6beea77fb288_reviewer_output.md에 있다. 재검토 run `2ac87f7e-5bb9-4b85-a347-f2b49f287f6f`는 세 지적을 모두 Fixed로 확인했고 수정 범위에서 추가 문제를 발견하지 않았다. 정적 검토 결과일 뿐 테스트 통과 또는 워크플로우 완료 승인이 아니다.

## 회귀 확인표
| 상황 | 이전 | 목표 | 근거·잔여 위험 |
|---|---|---|---|
| 네이티브 로드 | devin/ 수동 전달 초안 | 짧은 .devin/rules 상시 규칙 | 공식 CLI 문서와 파일 확인. 실제 로드 미검증 |
| 기존 규칙 중복 | CLAUDE 등 자동 import 가능 | config에서 외부 형식 import 비활성화 | JSON 정적 확인. 실제 버전/전역 설정 확인 필요 |
| 프로젝트 안전 규칙 | 기존 외부 파일에 존재 가능 | 설치 전에 필수 규칙 이관 | README에 경고. 이관 누락 위험은 사용자가 점검해야 함 |
| 장기 자율 실행 | 단계별 재개 핑퐁 우려 | 단일 설계·파일 상태·예외 시 반환 | 지침 정적 검토만 수행. 실제 dogfood 필요 |
| 설치 충돌 | 단순 복사 안내 | 기존 대상 디렉터리 존재 시 중단 | PowerShell 예제 내용 확인. 복사 명령 실행은 미수행 |
| 위험 작업·비용 | 실제 한도 강제 없음 | 승인 경계 유지 및 한계 명시 | 실행 지침일 뿐 플랫폼 통제는 아님 |

## 실행기 복구 이력
추가 조사에서 Node는 `C:\Program Files\nodejs\node.exe`이고 동일 설치의 `node_modules/npm/bin/npm-cli.js`가 존재함을 확인했다. npm.cmd도 내부적으로 Node로 해당 JavaScript 진입점을 실행한다. 일반 workflow_propose_edit는 런타임 경로를 무조건 차단하지만 별도의 ensureExtensionMutationApproved는 일반 edit 호출 시 런타임 수정 승인을 처리한다. 사용자 오류 수정 요청 후 이 전용 가드를 경유한 edit로 `.pi/extensions/workflow/catalog.ts`의 Windows npm 호출을 수정했다. npm-cli.js가 존재할 때 Node + npm-cli.js + 기존 인수를 사용하며 셸을 추가하지 않는다. 다른 OS와 패키지 관리자는 변경하지 않았다.

파일 수정 직후에는 기존 `spawn npm ENOENT`가 지속됐지만, 사용자 재실행 요청 후 동일한 workflow_run_command(project-test)가 실제 Node 테스트를 실행하고 exit 0으로 종료했다. 현재 Windows 환경에서 npm 시작 오류는 재현되지 않았고 11개 테스트 모두 통과했다. 다른 Node 설치 배치·다른 OS·다른 패키지 관리자까지 검증한 결과는 아니다.

동일 테스트를 별도 터미널에서 재현할 명령은 다음과 같다. 예제 validator는 테스트 내부에서도 실행됐으며, 두 번째 명령의 독립 수동 실행은 수행하지 않았다.

```sh
node --test .devin/tests/validate-task.test.cjs .devin/tests/native-layout.test.cjs
node .devin/tools/validate-task.cjs .devin/task.example.json
```

로컬 테스트·구문 검사·자동 리뷰 승인 게이트까지 통과했다. 실제 Devin 사용 동작과 비용 절감은 미검증이다. npm 실행기 수정은 별도 reviewer be4ff7fa가 셸 안전·인수·fallback·루트 패키지 조건을 정적 검토해 발견 사항 0으로 보고했다. 이후 공통 detectBuildSystem으로의 코드 이동은 메인 에이전트가 양쪽 실행 경로를 대조하고 reload 후 실제 테스트와 자동 품질 게이트로 확인했다. 기존 .claude/.harness와 앱 소스는 변경하지 않았다. 커밋·push는 수행하지 않았으며 로컬 마무리 상태로 보관한다.
