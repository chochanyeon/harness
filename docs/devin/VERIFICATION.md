# 검증 현황

## 검증 대상
원격 `main` 기준 소스에 `.devin/`과 `docs/devin/`을 추가했다. 기존 esbuild 의존성과 `build:claude-adapter`는 유지하고 루트 package.json에 `test:devin`/`lint:devin`만 추가했다. Windows npm 실행 복구는 배포 소스 `target/.pi/extensions/workflow/catalog.ts`에 반영했다.

## 실행 결과
| 검사 | 결과 |
|---|---|
| Devin 구성·JSON 검사 도구 Node 테스트 | 11 통과, 실패 0, 건너뜀 0 |
| 원격 소스 표적 pytest | 23 통과: Windows npm 회귀 3개, workflow catalog 8개, code quality gate 12개 |
| JS/TS 구문 검사 | validator·두 Node 테스트·target catalog.ts의 Node --check 통과 |
| git diff --check | 통과 |
| CLI 공식 설정 근거 | https://docs.devin.ai/cli/extensibility/rules 확인 |
| 실제 Devin CLI/Desktop 실행 | 수행하지 않음 |
| 유료 Devin 호출·비용 비교 | 수행하지 않음, 절감률 unknown |

검사는 활성 워크플로우의 project-test/code-quality 명령으로 이식된 소스를 직접 지정해 실행했다. 원격 소스 전체 테스트 스위트나 TS 타입 검사는 실행하지 않았다. 로컬 구문 검사의 catalog.ts 직접 처리는 Node 24 환경에서 수행했으며 독립 `.devin/` 도구의 요구 조건은 Node 18 이상이다.

## 리뷰 및 수정 근거
초기 독립 검토에서 Minor 3건을 수정했고 재검토에서 모두 Fixed로 확인됐다.
- NUL·끝 구분자·점 경로 요소를 상태 파일 경로에서 거부하고 회귀 테스트 추가.
- 작업 JSON 기준 `state/STATE.md`와 프로젝트 기준 `.devin/state/STATE.md` 구분.
- 설치 후 검사와 수정하지 않은 배포 원본 전용 native-layout 검사 분리.

Windows npm의 Node/npm-cli.js 직접 실행과 루트 검사 설정도 별도 독립 검토에서 발견 사항 0을 받았다. 해석 위치를 공통 detectBuildSystem으로 이동한 후 카탈로그와 자동 품질 게이트를 실제로 통과했다. 이식 소스에서는 진입점 존재/부재 및 비Windows 조건에 대해 모든 script command의 executable/argv를 추가 회귀 검사했다. 플랫폼 조건 모의 검사는 다른 OS에서 실제 npm을 실행한 결과가 아니다.

## 회귀 경계와 잔여 위험
| 경계 | 확인 및 잔여 위험 |
|---|---|
| 상시 규칙 | 짧은 규칙 하나가 상세 지침을 참조. 실제 제품 자동 로드는 미검증 |
| 기존 프로젝트 규칙 | import 비활성화 전에 필수 안전 규칙 이관 필요. 설치 안내에 경고 |
| 자율 실행 | 단일 충분한 설계·파일 상태·유한 복구·예외 시 사용자 반환을 명시. 실제 dogfood 필요 |
| 안전 승인 | push·배포·삭제·비밀정보 접근·권한/범위 확대는 명시적 승인 필요 |
| 비용 | 지침·JSON 검사로 청구 한도를 강제하지 않음. 실제 단가·과금 산식·절감률 미확인 |
| Windows npm | Node 설치의 npm-cli.js가 있으면 셸 없이 직접 실행. 없으면 기존 동작. 다른 Node 설치 배치 실제 검증은 미수행 |
| 설치 | 기존 대상 구성 덮어쓰기 금지. PowerShell 복사 예제의 실제 실행은 미수행 |

## 재현
저장소 루트에서 다음 명령을 사용할 수 있다.

```sh
npm run test:devin
npm run lint:devin
python -m pytest tests/test_windows_npm_invocation.py tests/test_workflow_catalog.py tests/test_code_quality_gate.py -q
```

다른 프로젝트에 복사한 독립 구성에는 npm 설치 없이 다음을 사용한다.

```sh
node .devin/tools/validate-task.cjs .devin/task.example.json
node --test .devin/tests/validate-task.test.cjs
```

native-layout 검사는 수정하지 않은 배포 원본 전용이다. 병합한 설치에서 원본의 import/rule 개수와 달라져 실패하는 것은 설치 오류와 구분한다.
