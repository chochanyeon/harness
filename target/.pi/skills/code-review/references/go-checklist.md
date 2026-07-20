# Go Code Review Checklist

> 일반 Go 프로젝트 리뷰 체크리스트 (프로젝트별 ADR이 있으면 그 규칙이 우선한다)

## 에러 처리 (Error Handling)

- **에러 래핑**: 하위 계층 에러를 그대로 반환하지 말고 `fmt.Errorf("context: %w", err)`로 래핑해 원인을 보존하는지 확인한다.
  ```go
  // ❌ 원인 정보 손실
  if err != nil {
      return errors.New("failed to save task")
  }
  // ✅ 원인 보존
  if err != nil {
      return fmt.Errorf("save task: %w", err)
  }
  ```
- **에러 비교**: 문자열 비교(`err.Error() == "..."`) 대신 `errors.Is`/`errors.As`를 사용하는지 확인한다.
- **무시된 에러**: 반환된 `error` 값을 검사 없이 버리는 코드(`_, _ = f()`, 명시적 `//nolint` 주석 없는 무시)를 찾는다. `Close()`, `Flush()` 같은 자원 해제 호출의 에러 무시는 특히 주의 깊게 본다.
- **panic 남용**: 복구 가능한 실행 흐름에서 `panic`을 에러 처리 대신 사용하는 코드를 지적한다. `panic`은 프로그래머 오류(불변 조건 위반)에만 쓰는 것이 관례다.

## 동시성 안전성 (Concurrency Safety)

- **고루틴 누수**: `go func() { ... }()`로 시작된 고루틴이 종료 신호(`context.Context` 취소, 채널 닫힘) 없이 무한정 블록될 수 있는지 확인한다.
- **채널 닫기 책임**: 채널을 닫는 주체가 송신자(sender)인지 확인한다. 수신자가 채널을 닫거나, 여러 송신자가 같은 채널을 닫으려 하는 코드는 `panic: close of closed channel` 위험이 있다.
- **context 전파**: 블로킹 가능한 함수(`net/http` 호출, DB 쿼리, 채널 수신)가 `context.Context`를 받아 취소/타임아웃을 전파하는지 확인한다. `context.Background()`를 요청 스코프 함수 내부에서 새로 만드는 코드는 상위 취소 신호를 끊는다.
- **데이터 경쟁 후보**: 고루틴 여러 개가 뮤텍스 없이 같은 맵/슬라이스/구조체 필드에 쓰는 코드를 찾는다. `go test -race`로 검증되었는지 확인한다.

## 자원 관리 (Resource Management)

- **defer 사용**: 파일, DB 커넥션, HTTP 응답 바디(`resp.Body`) 등 `io.Closer`를 구현하는 자원을 연 직후 `defer x.Close()`로 해제하는지 확인한다.
- **defer 순서**: 반복문 안에서 `defer`를 호출해 자원이 함수 종료까지 누적되는 패턴(루프 안 파일 오픈+defer)을 지적한다. 루프 내부에서는 즉시 해제하거나 별도 함수로 분리해야 한다.
- **Close 에러 처리**: `defer` 안에서 `Close()`의 에러를 완전히 무시하는 것은 일반적으로 허용되지만, 쓰기 작업이 있는 파일의 `Close()` 에러는 데이터 손실을 의미할 수 있으므로 로깅 또는 named return 값 갱신을 권장한다.

## 인터페이스 설계 (Interface Design)

- **작은 인터페이스 선호**: 호출자가 필요한 메서드만 요구하는 작은 인터페이스(`io.Reader`, 1~2 메서드)를 선호하는지 확인한다. 거대한 인터페이스를 구현체 쪽에서 강제하는 패턴을 지적한다.
- **반환값은 구체 타입**: 함수가 인터페이스가 아니라 구체 구조체(포인터)를 반환하는지 확인한다 ("accept interfaces, return structs").
- **인터페이스 위치**: 인터페이스를 구현체 패키지가 아니라 그 인터페이스를 사용하는(소비하는) 패키지에 정의하는지 확인한다.

## 일반 오탐 방지 목록 (Common False Positives)

- **명명된 반환값(named return) 미사용처럼 보이는 경우**: `func Do() (result int, err error)` 형태에서 `result`/`err`를 직접 대입하지 않고 `return x, nil`로 반환하는 코드는 정상이며 "미사용 변수"로 오해하지 않는다.
- **관례적인 `_ = err` 패턴**: 테스트 코드나 정리(cleanup) 경로에서 `_ = conn.Close()`처럼 의도적으로 에러를 무시하는 관례는, 그 자원이 읽기 전용이거나 실패해도 무해한 경우 정상적인 패턴이다. 쓰기 자원의 `Close()` 에러 무시와 구분해서 판단한다.
- **빈 구조체 필드 태그**: `json:"-"` 같은 태그로 직렬화에서 제외된 필드를 "미사용"으로 플래그하지 않는다 — 직렬화 제외가 의도다.
