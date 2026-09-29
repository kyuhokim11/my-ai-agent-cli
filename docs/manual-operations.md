# 개발·배포 절차와 릴리스 기록

이 문서는 이 패키지를 개발하고 npm에 게시할 때 사용한다. 설치해서 쓰는 방법은 [README](../README.md)를 참고한다.

## 지금 확인할 곳

- 이번 배포 범위와 남은 검증: [v1.2.0 준비 기록](#v120-릴리스-준비-기록)
- 커밋부터 게시까지 실행 순서: [릴리스 절차](#릴리스-절차)
- Git과 npm을 맞춰야 하는 범위: [일치 기준](#git과-npm의-일치-기준)

코드·문서 수정과 검증은 에이전트가 준비한다. Git 스테이징·커밋·푸시·태그, npm 인증·게시, 패키지 삭제·접근 권한 변경과 운영 배포는 사용자가 직접 수행한다. 특정 단계만 일회성으로 맡길 수 있으며, 그 권한은 다음 단계로 이어지지 않는다. 에이전트는 목적·범위·대상 파일과 검증 방법을 먼저 제시한다.

npm 계정과 scope는 `jobbykim`, 저자는 `jobkim`, GitHub 소유자는 `kyuhokim11`이다. 비밀번호·토큰·2FA 코드와 복구 코드는 기록하지 않는다.

## v1.0.0 릴리스 기록

릴리스 완료일: 2026-09-23, Asia/Seoul

### 배포 정보

- npm 패키지: `@jobbykim/ai-init`
- npm 버전: `1.0.0`
- npm dist-tag: `latest`
- 공개 범위: public scoped package
- npm 페이지: `https://www.npmjs.com/package/@jobbykim/ai-init/v/1.0.0`
- GitHub 저장소: `https://github.com/kyuhokim11/my-ai-agent-cli`
- Git 태그: `v1.0.0`
- 릴리스 커밋 및 태그 대상: `b90952e0148203507a801e0c554e2044ef444cde` (`fix: bin 경고 수정`)

### 주요 구현

- Ponytail과 Paperthin의 전체 `skills/` 동기화
- GitHub Tree API와 Git blob SHA를 이용한 무결성 확인
- 네트워크 실패 시 마지막 정상 캐시 유지
- 외부 소스를 추가할 수 있는 `skill-sources.json`
- 자체 작업 원칙과 신규·기존 프로젝트 정책
- 자체 `jobkim-project-intake` 스킬
- Codex `AGENTS.md`, Gemini CLI `GEMINI.md`, Antigravity `.agents/rules/jobkim.md` 연동
- 기존 사용자 스킬과 지침 보존
- upstream MIT 라이선스와 NOTICE 보존

### 검증 결과

아래 수치와 상태는 `v1.0.0` 릴리스 완료 시점의 스냅샷이다.

- `npm test`: 8개 테스트 통과
- `npm publish --dry-run`: 통과
- 실제 tarball 신규 프로젝트 초기화: 통과
- 실제 tarball 기존 프로젝트 초기화: 통과
- `1.0.0` 배포 시점 스킬 35개 설치 확인
- npm 공개 게시 확인
- `latest`가 `1.0.0`을 가리키는 것 확인
- 공개 `npx @jobbykim/ai-init` 실행: 사용자 검증 완료
- 로컬 `main`, `origin/main`, `v1.0.0` 태그 일치 확인

### 당시 확인한 제한

- Windows 환경에서 검증했으며 macOS와 Linux 실환경 검증은 남아 있다.
- 별도의 `update`, `status`, `uninstall` 명령은 제공하지 않으며, 현재 CLI는 하나의 대화형 초기화 흐름만 제공한다.
- 외부 스킬의 `main` 브랜치를 추적하므로 실행 시점에 따라 설치 내용이 달라질 수 있다. 각 설치에서 실제 동기화한 tree SHA는 대상 프로젝트의 `.ai-core/sources/<source-id>/_SOURCE.json`에 기록하지만, npm 릴리스 자체는 해당 upstream SHA를 고정하지 않는다.

## v1.1.0 릴리스 기록

2026-09-29 레지스트리 조회에서 `1.1.0` 게시와 `latest`를 확인했다. 사용자는 앞선 배포·검증 완료를 보고했다. 로컬 `v1.1.0` 태그는 존재하지만, 이 문서의 릴리스 커밋·완료일·태그 대조 기록은 아직 보완이 필요하다.

### 릴리스 범위

- 코드 작성, 기능 추가, 버그 수정, 리팩터링, 코드 리뷰, 설계와 의존성 선택 작업에 Ponytail을 기본 적용하는 공통 라우팅 정책
- Paperthin을 포함한 나머지 스킬을 요청·작업 상태와 스킬 설명이 일치할 때 사용하는 선택 기준
- 사용자 호출 전용 스킬의 자동 실행 방지
- Codex `AGENTS.md`, Gemini CLI `GEMINI.md`, Antigravity `.agents/rules/jobkim.md`에 동일한 공통 정책 전달
- 모든 대상 지침에 공통 스킬 라우팅 정책이 생성되는지 확인하는 회귀 테스트
- 연속된 대화형 입력에서도 두 번째 응답을 잃지 않고 초기화를 계속하는 입력 처리
- Windows 한글·공백 경로에서 네이티브 충돌을 일으킨 `fs.cpSync()` 제거와 안전한 파일 단위 복사
- 기존 `.gitignore`를 보존하면서 ai-init 캐시, Antigravity 규칙 파일과 `.agents/skills/` 전체를 자동 제외
- 신규·기존 프로젝트와 Codex·Gemini/Antigravity·동시 선택의 6개 조합 및 잘못된 입력 검증
- 현재 프로젝트의 역할과 장기 AI 개발 시스템 전략 문서화

### 보존한 준비 검증 기록

- 패키지 버전 `1.1.0` 변경: 완료
- Node.js `v22.22.2`, npm `10.9.7`, `main` 브랜치 확인: 완료
- `npm test`: 20개 테스트 통과
- `git diff --check`: 오류 없음
- 당시 미리보기는 입력 처리 수정 후 재검증 예정으로 기록되어 있었다. 이 항목을 사후 테스트 통과로 바꾸지는 않는다.

위 수치는 `1.1.0` 준비 당시 기록이다. 공개 실행·재설치의 상세 결과는 사용자 완료 보고와 별도로 보완할 수 있다.

## Git과 npm의 일치 기준

Git은 개발 이력, npm은 특정 버전의 배포 결과를 관리한다. 모든 커밋마다 npm을 게시할 필요는 없다.

반드시 일치해야 하는 범위:

- 게시된 npm 버전과 릴리스 커밋의 `package.json` 버전
- npm에 실제 포함된 코드·규칙·스킬과 해당 릴리스 커밋의 패키징 결과
- Git 태그 `v<version>`과 npm 버전 `<version>`
- 릴리스 기록에 적은 전체 커밋 SHA와 Git 태그가 가리키는 커밋

항상 일치하지 않아도 되는 범위:

- GitHub `main`의 최신 커밋과 npm `latest`의 소스 상태
- 릴리스 이후 추가된 문서, 테스트 또는 다음 버전 개발 코드
- 릴리스 완료 결과를 기록하기 위한 사후 문서 커밋

게시 후 완료 결과를 적는 문서 커밋은 릴리스 태그 다음에 남겨도 된다. 패키지에 포함되는 파일을 바꿔 다시 배포하려면 새 버전이 필요하다. 이미 게시한 버전과 푸시한 태그는 재사용하지 않는다.

## 업데이트 계획

버그·문서·호환 수정은 patch, 하위 호환 기능 추가는 minor, 호환성을 바꾸는 변경은 major로 정한다. 이미 게시한 버전은 그대로 남기고 변경은 새 버전으로 배포한다.

후속 후보는 다음과 같다. 설계와 승인 후 작은 단위로 진행한다.

1. `init`, `update`, `status`, `uninstall` 역할 분리
2. 변경 예정 파일을 실제 수정 전에 보여주는 preview 기능
3. 설치된 소스와 tree SHA를 보여주는 상태 명령
4. CLI 관리 파일만 제거하는 안전한 uninstall 기능
5. 비대화형 검증을 위한 명시적 CLI 옵션

한 번에 모두 구현하지 않는다. 사용자 데이터 보호와 현재 대화형 흐름의 하위 호환성을 먼저 설계한다.

Windows에서는 과거 공개 실행과 현재 자동 테스트를 확인했다. 이번 실사용 확인은 버전별 기록을 참고한다. macOS/Linux의 신규·기존 프로젝트, symlink와 재실행은 미검증이다.

공통 규칙 개선과 다른 프로젝트로의 분리 방향은 [시스템 전략](system-strategy.md)에서 관리한다.

## v1.2.0 릴리스 준비 기록

상태: 배포 준비 중. 게시 완료 기록이 아니다.

- 패키지: `@jobbykim/ai-init`, 공개 scoped package
- 버전: `1.2.0` (사용자 변경 확인)
- 범위: 기록·맥락 관리 정책과 자체 스킬, 성공 설치의 버전·적용 정보, 반복 동기화 시 관리 표식 보존
- 기존 설치: 대상 프로젝트에서 다시 실행해야 새 규칙과 스킬 적용
- 제한: 이미 관리 표식이 소실된 설치는 자동 복구하지 않음. 실제 에이전트 기록 행동은 별도 확인 필요
- 릴리스 커밋·태그·완료일: 사용자 Git 작업과 공개 검증 후 기록

배포 준비 검증(2026-09-29, Asia/Seoul):

- `npm test`: 28개 통과, 신규/기존 × 엔진 3가지 선택 및 재설치 보존 검증
- JavaScript 문법·Git diff 공백 검사: 통과
- `npm publish --dry-run --registry=https://registry.npmjs.org/`: 통과, 공개 접근 및 배포 파일 13개 확인
- npm 게시 버전 조회: `1.0.0`, `1.1.0` 확인, `1.2.0` 미게시
- 외부 다운로드 포함 실사용 초기화, 실제 에이전트 행동, 게시 후 공개 `npx` 검증: 미수행
- 타입체크·빌드·별도 린트: 해당 스크립트 없음

README와 링크된 문서 정리도 이번 변경 범위에 포함한다. README는 npm에도 들어가며, `docs/` 문서는 GitHub에서 제공한다.

다음은 [릴리스 절차](#릴리스-절차)를 순서대로 실행한다. 게시 완료로 바꾸는 것은 레지스트리와 실제 실행 결과를 확인한 뒤다.

## 릴리스 절차

명령은 한 단계씩 실행하고 결과를 확인한 뒤 다음 단계로 넘어간다. 기본 위치는 `C:\dev\my-ai-agent-cli`다. 아래는 `1.2.0` 기준이며 다음 배포에서는 버전과 태그명을 바꾼다.

### 1. 사전 조건 확인

1. Node.js 18 이상과 npm 버전을 확인한다.
2. 현재 브랜치가 `main`이고 작업 트리에 의도하지 않은 변경이 없는지 확인한다.
3. npm 공식 레지스트리와 로그인 계정을 확인한다.

```powershell
Set-Location C:\dev\my-ai-agent-cli
node --version
npm --version
git branch --show-current
git status --short --branch
git diff --stat
git diff
```

조건을 충족하지 않으면 릴리스를 진행하지 않는다.

위임 예시: `현재 상태와 배포 범위만 확인해줘. 파일 수정과 Git 작업은 하지 마.`

### 2. 변경 준비

규칙·스킬·코드 변경과 사용자 계약을 검토한다. 새 소스를 추가하면 효용, 라이선스·NOTICE와 스킬 충돌도 확인한다. 새 스킬은 적용 조건과 실제 절차를 함께 검증한다.

```powershell
npm test
npm publish --dry-run --registry=https://registry.npmjs.org/
```

테스트 통과와 배포 파일 목록을 확인한다. 설치 동작이 바뀌면 별도 신규·기존 테스트 프로젝트에서 로컬 소스 또는 tarball을 실행하고 재설치·사용자 파일 보존도 확인한다. 하나라도 실패하면 중단한다.

### 3. 버전 결정

- 버그·문서·호환 수정: patch
- 하위 호환 기능 추가: minor
- 기존 사용법이나 생성 결과의 호환되지 않는 변경: major

버전은 사용자 결정 후 변경하고 `package.json`에서 확인한다. 버전이나 배포 파일을 바꿨다면 미리보기를 다시 확인한다.

### 4. 커밋과 브랜치 푸시

에이전트가 제시한 대상 파일만 스테이징한다. 아래 `git add`는 이번 문서 정리 범위다. 다른 배포에서는 해당 변경 파일 목록으로 바꾼다.

```powershell
git add README.md docs/manual-operations.md docs/project-context-policy-design.md docs/system-strategy.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

예상 파일만 포함됐는지 확인한 뒤 커밋한다. 메시지는 영어 유형과 한글 설명으로 쓴다.

```powershell
git commit -m "docs: 사용 안내와 연관 문서를 일관되게 정리"
git log -1 --oneline
git rev-parse HEAD
git status --short
```

원하는 변경이 모두 커밋됐고 작업 트리가 깨끗하면 푸시한다.

```powershell
git push origin main
git fetch origin
git status --short --branch
```

위임 예시: `보고한 파일만 스테이징해줘`, `현재 스테이징만 지정 메시지로 커밋해줘`, `현재 main만 푸시해줘`. 각각 별도 요청이며 다음 단계의 권한은 포함하지 않는다.

### 5. 로컬 태그

```powershell
git tag --list v1.2.0
```

없을 때만 검증한 HEAD에 태그를 만든다. 이미 있으면 `git rev-list -n 1 v1.2.0`으로 대상부터 확인하고 임의로 옮기지 않는다.

```powershell
git tag -a v1.2.0 -m "release: v1.2.0"
git rev-list -n 1 v1.2.0
git rev-parse HEAD
```

두 SHA가 같아야 한다. 전체 SHA는 게시 후 결과 기록에 남기고, 태그는 공개 패키지 검증이 끝날 때 푸시한다.

위임 예시: `현재 HEAD에 v1.2.0 로컬 태그만 만들고 SHA를 확인해줘. 태그 푸시는 하지 마.`

### 6. npm 인증과 게시

먼저 배포하려는 정확한 버전이 이미 존재하는지 확인한다. 버전이 조회되면 게시를 중단하고 버전 결정부터 다시 확인한다. `E404`이면 아직 게시되지 않은 버전이라는 뜻이므로 다음 검증으로 진행한다.

```powershell
npm whoami --registry=https://registry.npmjs.org/
npm view @jobbykim/ai-init@1.2.0 version --registry=https://registry.npmjs.org/
```

계정이 `jobbykim`인지 확인한다. 인증 실패 시 `npm login --registry=https://registry.npmjs.org/` 후 다시 확인한다. 미게시 버전 조회의 `E404` 외 오류는 먼저 해결한다.

검증 후 소스 변경이 없는 상태에서 게시한다.

```powershell
npm publish --access public --registry=https://registry.npmjs.org/
```

게시 성공 여부가 불분명하면 반복 게시하지 말고 먼저 조회한다.

```powershell
npm view @jobbykim/ai-init@1.2.0 name version --registry=https://registry.npmjs.org/
npm view @jobbykim/ai-init dist-tags --json --registry=https://registry.npmjs.org/
```

### 7. 공개 패키지 검증

저장소 밖의 신규·기존 테스트 프로젝트 루트에서 각각 실행한다.

```powershell
npx @jobbykim/ai-init@1.2.0
Get-Content .ai-core/install-info.json
```

선택한 엔진의 지침, `jobkim-project-context` 스킬과 참조 문서, 설치 버전·시각을 확인한다. 재실행 후 사용자 문장·같은 이름의 사용자 스킬·작업 문서가 보존되고 관리 스킬이 유지되어야 한다. 신규/기존 × 엔진 3가지 조합은 자동 테스트와 구분해 실사용 결과를 남긴다.

기록 정책의 효과는 [실제 사용 확인](project-context-policy-design.md#실제-사용-확인)을 따른다. 파일 설치가 성공했다고 에이전트 행동까지 통과로 기록하지 않는다.

### 8. 태그 푸시와 결과 기록

공개 패키지 검증이 모두 끝나면 사용자가 태그를 푸시한다.

```powershell
git push origin v1.2.0
```

위임 예시: `공개 검증 결과를 확인하고 기존 v1.2.0 태그만 푸시해줘.`

npm 게시가 실패하면 태그는 푸시하지 않는다. 소스를 수정했다면 재검증과 커밋을 먼저 진행하고 기존 로컬 태그의 대상을 확인한다. 이미 게시한 버전은 새 버전으로 수정 배포한다.

릴리스가 완료되면 Codex가 이 문서에 버전, 날짜, 전체 커밋 SHA, 태그, npm 조회 결과, 공개 `npx` 검증과 남은 제한을 기록한다. 사용자는 이 최종 기록을 별도의 사후 문서 커밋으로 커밋하고 푸시한다. 따라서 릴리스 태그는 검증된 배포 소스를 가리키며, 최종 결과 기록 커밋은 의도적으로 그 태그 다음에 위치한다.
