# 사용자 직접 수행 작업 및 릴리스 기록

이 문서는 계정, 원격 저장소, 공개 배포처럼 외부 상태를 바꾸거나 되돌리기 어려운 작업의 책임과 완료 기록을 관리한다. 이러한 작업은 사용자가 직접 수행하고, Codex는 변경 준비와 실행 전후 검증을 담당한다.

비밀번호, npm 토큰, GitHub 토큰, 2FA 코드와 복구 코드는 이 저장소에 기록하지 않는다.

## 운영 책임

사용자가 직접 수행하는 작업:

- Git 커밋 최종 실행
- GitHub 푸시와 릴리스 태그 푸시
- npm 로그인과 계정 인증
- npm 최초 배포 및 이후 버전 배포
- npm 패키지 삭제, 폐기 또는 접근 권한 변경
- 운영 환경 배포와 환경 설정 변경

Codex가 담당하는 작업:

- 요청 범위의 파일 변경
- 테스트, 패키지 미리보기와 tarball 검증
- 커밋 대상과 제외 대상 정리
- 한글 커밋 메시지 제안
- 사용자 실행 명령과 완료 기준 안내
- 사용자 실행 후 Git과 npm 상태 확인

## 작업 승인과 Git 실행 방식

상태를 변경하는 작업은 Codex가 목적, 범위, 대상 파일과 검증 방법을 먼저 제시하고 사용자가 승인한 범위에서 진행한다. 읽기, 검색과 상태 확인은 승인된 작업의 설계와 검증에 필요한 범위에서 수행할 수 있다.

Git 작업은 사용자가 직접 수행하는 것을 기본으로 한다. Codex는 각 단계의 실행 위치, 전체 명령어, 포함·제외 파일, 예상 결과와 중단 조건을 제공한다. 사용자는 원하는 경우 특정 단계만 일회성으로 위임할 수 있으며, 그 승인은 해당 단계가 끝나면 소멸한다. 스테이징 승인은 커밋 승인이 아니고, 커밋 승인은 푸시·태그·npm 게시 승인이 아니다.

### 상태 확인

```powershell
git branch --show-current
git status --short --branch
git diff --stat
git diff
```

일회성 위임 예시: `현재 Git 상태와 변경 내용을 확인해서 커밋 범위만 정리해줘. 수정, 스테이징, 커밋은 하지 마.`

### 스테이징

```powershell
git add <파일1> <파일2>
git status --short
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

일회성 위임 예시: `이번에 보고한 커밋 대상 파일만 스테이징하고 결과를 보여줘. 커밋과 푸시는 하지 마.`

### 커밋

```powershell
git commit -m "<type>: <한글 설명>"
git log -1 --oneline
git rev-parse HEAD
```

일회성 위임 예시: `현재 스테이징된 변경만 제안한 메시지로 커밋해줘. 추가 스테이징과 푸시는 하지 마.`

### 브랜치 푸시

```powershell
git push origin main
git status --short --branch
```

일회성 위임 예시: `현재 main의 미푸시 커밋만 origin/main에 푸시하고 결과를 확인해줘. 태그와 npm 작업은 하지 마.`

### 로컬 태그 생성

```powershell
git tag -a v<version> -m "release: v<version>"
git rev-list -n 1 v<version>
git rev-parse HEAD
```

일회성 위임 예시: `현재 HEAD에 지정한 버전의 로컬 태그만 생성하고 HEAD와 태그 SHA가 같은지 확인해줘. 태그는 푸시하지 마.`

### 태그 푸시

```powershell
git push origin v<version>
```

일회성 위임 예시: `npm 공개 검증 결과를 확인한 뒤 지정한 기존 로컬 태그만 origin에 푸시해줘.`

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

npm 계정과 패키지 scope는 `jobbykim`, 패키지 저자 표기는 `jobkim`, GitHub 저장소 소유자는 `kyuhokim11`이다. 이름 차이는 의도된 것이다.

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

### 현재 제한

- Windows 환경에서 검증했으며 macOS와 Linux 실환경 검증은 남아 있다.
- 별도의 `update`, `status`, `uninstall` 명령은 제공하지 않으며, 현재 CLI는 하나의 대화형 초기화 흐름만 제공한다.
- 외부 스킬의 `main` 브랜치를 추적하므로 실행 시점에 따라 설치 내용이 달라질 수 있다. 각 설치에서 실제 동기화한 tree SHA는 대상 프로젝트의 `.ai-core/sources/<source-id>/_SOURCE.json`에 기록하지만, npm 릴리스 자체는 해당 upstream SHA를 고정하지 않는다.

## v1.1.0 릴리스 준비 기록

릴리스 상태: 준비 중

실행 순서와 실패 시 중단 기준은 [이후 릴리스 절차](#이후-릴리스-절차)를 따른다. 릴리스 기준 브랜치는 `main`이며, 사용자는 검증된 릴리스 커밋을 푸시하고 같은 커밋에 로컬 태그를 만든다. npm 게시와 공개 패키지 검증이 끝난 뒤에만 태그를 원격에 푸시한다.

### 배포 예정 정보

- npm 패키지: `@jobbykim/ai-init`
- npm 버전: `1.1.0`
- npm dist-tag: `latest`
- 공개 범위: public scoped package
- Git 태그: `v1.1.0`
- 릴리스 커밋 및 완료일: 릴리스 커밋과 공개 패키지 검증 후 기록

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

### 릴리스 전 검증 상태

- 패키지 버전 `1.1.0` 변경: 완료
- Node.js `v22.22.2`, npm `10.9.7`, `main` 브랜치 확인: 완료
- `npm test`: 20개 테스트 통과
- `git diff --check`: 오류 없음
- `npm publish --dry-run`: 입력 처리 수정 반영 후 재검증 필요
- npm 공개 게시 및 `latest` 확인: 게시 후 기록
- 빈 프로젝트 공개 `npx @jobbykim/ai-init@1.1.0` 실행: 게시 후 기록
- 재실행 시 사용자 내용 보존과 관리 블록 비중복 확인: 게시 후 기록

기존 프로젝트에는 자동 적용되지 않는다. `1.1.0` 게시 후 대상 프로젝트에서 `npx @jobbykim/ai-init@1.1.0`을 다시 실행해야 관리 블록에 새 라우팅 정책이 반영된다.

### 유지되는 제한

- Windows 외 macOS와 Linux의 실환경 검증은 아직 완료되지 않았다.
- `update`, `status`, `uninstall` 전용 명령은 제공하지 않는다.
- 외부 스킬은 각 소스의 `main` 브랜치를 추적하므로 설치 시점에 따라 내용이 달라질 수 있다.
- 지침 기반 스킬 라우팅은 공식 플러그인의 명령, 훅 또는 지속 모드를 복제하지 않는다.

## Git과 npm의 일치 기준

Git과 npm은 역할이 다르므로 최신 상태가 항상 같은 시점에 있을 필요는 없다. Git은 개발 이력과 다음 변경을 관리하고, npm은 사용자가 설치하는 특정 버전의 배포 결과를 보관한다. 따라서 npm 게시 후 Git에 문서 수정이나 다음 버전 개발 커밋이 추가되어도 정상이다.

반드시 일치해야 하는 범위:

- 게시된 npm 버전과 릴리스 커밋의 `package.json` 버전
- npm에 실제 포함된 코드·규칙·스킬과 해당 릴리스 커밋의 패키징 결과
- Git 태그 `v<version>`과 npm 버전 `<version>`
- 릴리스 기록에 적은 전체 커밋 SHA와 Git 태그가 가리키는 커밋

항상 일치하지 않아도 되는 범위:

- GitHub `main`의 최신 커밋과 npm `latest`의 소스 상태
- 릴리스 이후 추가된 문서, 테스트 또는 다음 버전 개발 코드
- 릴리스 완료 결과를 기록하기 위한 사후 문서 커밋

예를 들어 npm `1.0.0`과 Git 태그 `v1.0.0`은 같은 릴리스 소스를 가리켜야 하지만, 이후 `main`에 문서 커밋이 추가되면 `main`이 태그보다 앞서는 것은 정상이다. 이때 npm을 다시 게시하거나 기존 태그를 옮기지 않는다.

운영 기준은 다음과 같다.

1. 개발 중인 모든 Git 커밋마다 npm을 게시하지 않는다.
2. 배포할 변경이 준비되었을 때만 `package.json` 버전을 올리고 릴리스 커밋을 만든다.
3. 그 커밋을 대상으로 테스트와 패키지 내용을 검증한 뒤 같은 버전으로 npm에 게시한다.
4. 검증된 릴리스 커밋에 같은 버전의 Git 태그를 남긴다.
5. 게시 후 문서나 다음 개발 변경은 새 Git 커밋으로 관리한다.
6. 이미 게시된 npm 버전과 푸시한 릴리스 태그는 수정하거나 재사용하지 않는다. 수정이 필요하면 새 버전을 만든다.

## 업데이트 계획

### 1. 릴리스 기준선 유지

`v1.0.0`은 최초 공개 기준선으로 유지한다. 이미 게시한 `1.0.0`의 내용을 덮어쓰지 않으며, 변경은 새 버전으로 배포한다.

### 2. 패치 버전 `1.0.x`

기존 기능과 명령 사용법을 바꾸지 않는 수정만 포함한다.

- 실행 오류 수정
- 사용자 파일 보존 관련 안전성 수정
- 다운로드·캐시·라이선스 처리 오류 수정
- README와 운영 문서 보완
- 테스트 누락 보완

기능 추가나 CLI 흐름 변경은 패치 버전에 포함하지 않는다.

### 3. 후속 기능 버전

다음 후보는 설계와 사용자 승인 후 작은 단위로 구현한다.

1. `init`, `update`, `status`, `uninstall` 역할 분리
2. 변경 예정 파일을 실제 수정 전에 보여주는 preview 기능
3. 설치된 소스와 tree SHA를 보여주는 상태 명령
4. CLI 관리 파일만 제거하는 안전한 uninstall 기능
5. 비대화형 검증을 위한 명시적 CLI 옵션

한 번에 모두 구현하지 않는다. 사용자 데이터 보호와 현재 대화형 흐름의 하위 호환성을 먼저 설계한다.

### 4. 플랫폼 검증

- Windows: 완료
- macOS: 신규·기존 프로젝트, symlink, 재실행 검증 필요
- Linux: 신규·기존 프로젝트, symlink, 재실행 검증 필요

플랫폼별 차이는 기능 코드보다 테스트와 문서로 먼저 확인한다. 검증 전에는 macOS/Linux 지원을 확정적으로 표현하지 않는다.

### 5. 시스템 성장 원칙

- 사용자에게서 새 규칙을 받으면 공통 규칙, 프로젝트 정책, 자체 스킬 중 한 곳을 단일 원천으로 선택한다.
- 모든 대화 내용을 자동으로 규칙에 추가하지 않는다. 반복 가치와 다른 프로젝트에서의 재사용 가능성을 검토한다.
- 자체 스킬을 추가하거나 변경할 때 트리거 조건, 실제 작업 절차, 안전 경계와 검증 방법을 함께 작성한다.
- 외부 스킬은 효용, 유지보수 상태, 보안 위험, 라이선스와 NOTICE를 검토한 후 `skill-sources.json`에 추가한다.
- 에이전트 성능이 발전하면 불필요한 지침을 제거하고 여전히 필요한 계약과 검증 기준만 유지한다.
- 규칙과 스킬 변경은 가능한 경우 회귀 테스트 또는 재현 가능한 검증 사례와 함께 배포한다.

## 이후 릴리스 절차

릴리스 준비와 검증은 Codex가 수행하고, 커밋·푸시·npm 인증·게시·태그 푸시는 사용자가 직접 수행한다. 모든 명령은 패키지 저장소 루트에서 실행한다.

### 1. 사전 조건 확인

1. Node.js 18 이상과 npm 버전을 확인한다.
2. 현재 브랜치가 `main`이고 작업 트리에 의도하지 않은 변경이 없는지 확인한다.
3. npm 공식 레지스트리와 로그인 계정을 확인한다.

```bash
node --version
npm --version
git branch --show-current
git status --short --branch
npm whoami --registry=https://registry.npmjs.org/
```

조건을 충족하지 않으면 릴리스를 진행하지 않는다.

### 2. 변경 준비

1. 작업 목적과 배포 버전 범위 결정
2. 코드·규칙·스킬·문서 변경
3. `npm test`
4. 신규·기존 프로젝트 tarball 검증
5. 변경된 사용자 계약과 제한을 릴리스 기록 초안에 문서화

### 3. 버전 결정

- 버그·문서·호환 수정: patch
- 하위 호환 기능 추가: minor
- 기존 사용법이나 생성 결과의 호환되지 않는 변경: major

버전 변경은 사용자가 릴리스를 결정한 뒤 수행한다.

### 4. 사용자 릴리스 커밋과 로컬 태그

Codex가 포함 파일, 제외 파일, 검증 결과와 커밋 메시지를 보고한 뒤 사용자가 직접 릴리스 소스를 커밋하고 푸시한다. 그 커밋에 로컬 태그를 만들되 npm 게시가 확인될 때까지 태그는 푸시하지 않는다.

```bash
git status --short
git diff --cached --name-only
git diff --cached --check
git diff --cached
git push origin main
git fetch origin
git status --short --branch
git tag -a v<version> -m "release: v<version>"
git rev-list -n 1 v<version>
```

태그가 가리키는 전체 커밋 SHA를 릴리스 기록 초안에 남긴다.

### 5. 사용자 npm 배포

먼저 배포하려는 정확한 버전이 이미 존재하는지 확인한다. 버전이 조회되면 게시를 중단하고 버전 결정부터 다시 확인한다. `E404`이면 아직 게시되지 않은 버전이라는 뜻이므로 다음 검증으로 진행한다.

```bash
npm whoami --registry=https://registry.npmjs.org/
npm view @jobbykim/ai-init@<version> version --registry=https://registry.npmjs.org/
npm publish --dry-run --registry=https://registry.npmjs.org/
npm publish --access public --registry=https://registry.npmjs.org/
```

게시 성공 여부가 불분명하면 같은 명령을 반복하지 않는다. 먼저 새 버전을 조회한다.

```bash
npm view @jobbykim/ai-init@<version> name version dist-tags --registry=https://registry.npmjs.org/
```

### 6. 공개 패키지 검증

`latest` 대신 게시한 정확한 버전을 지정해 검증한다.

1. 저장소 밖의 빈 폴더에서 `npx @jobbykim/ai-init@<version>` 실행
2. 테스트용 기존 프로젝트에서 같은 명령 실행
3. 선택한 에이전트의 지침과 스킬 파일이 생성되는지 확인
4. 기존 사용자 문장과 같은 이름의 사용자 스킬이 보존되는지 확인
5. 재실행해 관리 블록이나 스킬이 중복 생성되지 않는지 확인

### 7. 태그 푸시와 사후 기록

공개 패키지 검증이 모두 끝나면 사용자가 태그를 푸시한다.

```bash
git push origin v<version>
```

npm 게시가 실패했다면 태그를 푸시하지 않는다. 수정 후 새 릴리스 커밋을 만들고 로컬 태그가 그 커밋을 가리키도록 정리한 뒤 절차를 다시 시작한다.

릴리스가 완료되면 Codex가 이 문서에 버전, 날짜, 전체 커밋 SHA, 태그, npm 조회 결과, 공개 `npx` 검증과 남은 제한을 기록한다. 사용자는 이 최종 기록을 별도의 사후 문서 커밋으로 커밋하고 푸시한다. 따라서 릴리스 태그는 검증된 배포 소스를 가리키며, 최종 결과 기록 커밋은 의도적으로 그 태그 다음에 위치한다.
