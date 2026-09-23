# 사용자 직접 수행 작업 기록

이 문서는 계정, 원격 저장소, 공개 배포처럼 외부 상태를 바꾸거나 되돌리기 어려운 작업을 기록한다. 이러한 작업은 사용자가 직접 수행하고, Codex는 필요한 변경 준비와 실행 전후 검증을 담당한다.

비밀번호, npm 토큰, GitHub 토큰, 2FA 코드와 복구 코드는 이 저장소에 기록하지 않는다.

상태 기록 기준: 2026-09-23, Asia/Seoul. `현재`라고 표시된 상태는 실행 전에 반드시 문서의 확인 명령으로 다시 검증한다.

## 운영 원칙

다음 작업은 사용자가 직접 수행한다.

- Git 커밋 최종 실행
- GitHub 푸시
- npm 로그인과 계정 인증
- npm 최초 배포 및 이후 버전 배포
- npm 패키지 삭제, 폐기 또는 접근 권한 변경
- 운영 환경 배포와 환경 설정 변경

Codex는 다음 범위에서 작업한다.

- 변경 파일 작성
- 테스트, 패키지 미리보기와 tarball 검증
- 커밋 대상과 제외 대상 정리
- 한글 커밋 메시지 제안
- 실행할 명령과 예상 결과 안내
- 사용자 실행 후 Git과 npm 상태 확인

## 완료된 중요 작업

### GitHub 저장소 구성

- 저장소: `https://github.com/kyuhokim11/my-ai-agent-cli`
- 원격 이름: `origin`
- 기본 브랜치: `main`
- 현재 확인된 상태: 로컬 `main`과 `origin/main` 일치

### Git 커밋과 푸시

다음 커밋이 GitHub에 반영되어 있다.

1. `d62e11b feat:base-rules, ponytail, paperthin 규칙 인프라 구축`
2. `1489332 feat:크로스 플랫폼 호환 setup.js 엔진 구현`
3. `1c0f197 feat: 프로젝트 유형별 에이전트 초기화 시스템 구축`

세 번째 커밋에는 외부 스킬 전체 동기화, 라이선스 보존, 자체 규칙과 자체 스킬, 신규·기존 프로젝트 정책 및 테스트가 포함된다.

### npm 계정과 패키지 정책

- npm Username: `jobbykim`
- 최종 패키지명: `@jobbykim/ai-init`
- 공개 범위: public scoped package
- 패키지 저자 표기: `jobkim`
- 최초 배포 버전 예정값: `1.0.0`
- npm 레지스트리 확인 결과: 아직 동일한 패키지가 게시되지 않음

이름 차이는 의도된 것이다. npm 계정과 패키지 scope는 `jobbykim`, 패키지 저자 표기는 `jobkim`, GitHub 저장소 소유자는 `kyuhokim11`이다.

### 로컬 검증

- `npm test`: 8개 테스트 통과
- `npm pack --dry-run`: 통과
- 실제 tarball 설치: 통과
- 신규 프로젝트 초기화: `1.0.0` 배포 후보 기준 스킬 35개와 신규 정책 생성 확인
- 기존 프로젝트 초기화: `1.0.0` 배포 후보 기준 스킬 35개, 사용자 지침 보존과 프로젝트 프로필 생성 확인
- Windows 환경: 검증 완료
- macOS/Linux 환경: 미검증

## 현재 미완료 상태

- `README.md`와 `package.json`의 npm 공개 배포 정보가 아직 커밋되지 않았다.
- 현재 컴퓨터는 npm에 로그인되어 있지 않다.
- `@jobbykim/ai-init`은 아직 npm에 게시되지 않았다.
- 공개 npm 패키지를 이용한 `npx @jobbykim/ai-init` 실검증은 배포 후 수행해야 한다.
- 자동 제거 명령은 아직 제공하지 않는다.

## 다음 사용자 직접 작업

### 1. npm 배포 정보 커밋

Codex가 변경 범위와 검증 결과를 보고한 후 사용자가 직접 수행한다.

```bash
git status --short
git diff --cached --name-only
git add README.md package.json docs/manual-operations.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "chore: npm 공개 배포 정보와 운영 절차 정리"
```

완료 기준:

- 첫 번째 `git diff --cached --name-only` 출력이 비어 있음. 기존 staged 파일이 있다면 먼저 중단하고 범위를 확인한다.
- 의도한 세 파일만 커밋에 포함됨
- 두 번째 `git diff --cached --name-only` 출력이 `README.md`, `docs/manual-operations.md`, `package.json` 세 파일과 일치함
- `git status`에 예상하지 않은 변경이 없음

### 2. GitHub 푸시

```bash
git push origin main
git fetch origin
```

완료 기준:

```bash
git status --short --branch
```

출력에서 `main`과 `origin/main` 사이에 `ahead` 또는 `behind`가 없어야 한다.

### 3. npm 로그인

```bash
npm config get registry
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

완료 기준:

```text
https://registry.npmjs.org/
jobbykim
```

인증 정보나 명령 출력에 포함된 민감 정보는 문서나 Git에 저장하지 않는다.

### 4. 배포 직전 확인

```bash
npm test
npm publish --dry-run --registry=https://registry.npmjs.org/
```

확인 항목:

- 패키지명: `@jobbykim/ai-init`
- 버전: `1.0.0`
- 공개 범위: `public`
- `package.json`의 `publishConfig.access`: `public`
- `LICENSE`, `NOTICE`, `README.md`, `rules/`, `bundled-skills/`, `setup.js`, `skill-sources.json` 포함
- 테스트 통과

### 5. npm 최초 배포

실행 직전에 다음을 다시 확인한다.

```bash
git status --short --branch
npm whoami --registry=https://registry.npmjs.org/
npm view @jobbykim/ai-init name version --registry=https://registry.npmjs.org/
```

확인 기준:

- Git 작업 트리가 깨끗하고 `main`과 `origin/main`이 일치함
- npm 계정이 `jobbykim`으로 표시됨
- `npm view`가 `E404 Not Found`를 반환하여 아직 `1.0.0`이 게시되지 않았음
- 직전 `npm publish --dry-run`의 파일 목록과 패키지명·버전이 의도와 일치함

```bash
npm publish --access public --registry=https://registry.npmjs.org/
```

이 명령은 패키지를 공개 레지스트리에 게시하므로 사용자가 출력 내용을 확인하면서 직접 실행한다.

완료 기준:

```bash
npm view @jobbykim/ai-init name version --registry=https://registry.npmjs.org/
```

예상 결과:

```text
name = '@jobbykim/ai-init'
version = '1.0.0'
```

배포 직후 조회가 실패하면 즉시 다시 게시하지 않는다. npm 웹 페이지와 `npm view`를 몇 분 뒤 다시 확인하고, 동일 버전이 이미 등록됐는지 먼저 판단한다.

### 6. 공개 패키지 실구동 확인

저장소 밖의 빈 폴더와 테스트용 기존 프로젝트에서 각각 실행한다.

```bash
npx @jobbykim/ai-init
```

확인 항목:

- 신규 프로젝트 정책 생성
- 기존 프로젝트의 사용자 지침 보존
- `1.0.0` 기준 `.agents/skills`에 스킬 35개 설치
- Codex용 `AGENTS.md`에 `<!-- ai-init:jobkim:start -->`와 `<!-- ai-init:jobkim:end -->` 관리 블록이 한 쌍만 존재
- Gemini용 `GEMINI.md`에 같은 관리 블록이 한 쌍만 존재
- Antigravity용 `.agents/rules/jobkim.md` 생성
- 기존 프로젝트의 관리 블록 밖 사용자 문장이 실행 전후 동일하게 유지됨
- 재실행 후 관리 블록 수와 스킬 수가 증가하지 않음

`1.0.0`은 Windows에서 검증한 최초 공개 버전으로 취급한다. macOS와 Linux 지원을 확정적으로 표현하기 전에 각 환경에서 tarball 및 `npx` 검증을 추가한다.

## 이후 버전 배포 절차

1. 자체 규칙, 자체 스킬 또는 실행 엔진 변경
2. 단위 테스트와 tarball 검증
3. 변경 성격에 맞는 버전 증가
4. 사용자 커밋과 GitHub 푸시
5. 사용자 `npm publish`
6. 공개 패키지 버전 및 `npx` 실구동 확인

버전을 이미 게시한 뒤 같은 버전의 내용을 덮어쓰지 않는다. 수정이 필요하면 새 버전을 발행한다.
