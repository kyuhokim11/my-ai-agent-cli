# Claude Code 지원 구현 기록

2026-11-19, Asia/Seoul. 일반 사용법은 [README](../README.md), 게시 절차는 [개발·배포 문서](manual-operations.md)를 따른다.

## 작업 범위와 기준 상태

시작 시 기존 1.5.0-rc.1 개발 변경과 미추적 파일이 있었다. 해당 내용을 보존하면서 Claude 지원을 추가했다. 기준 자동 테스트는 44개였다. 기존 RC 변경은 작업 전 사본을 기준으로 먼저 커밋하고, Claude 지원은 아래 작업 단위로 로컬 커밋한다.

사용자는 프로젝트에서 `npx @jobbykim/ai-init@latest`를 실행한다. 첫 설치에서는 프로젝트 유형과 AI를 선택하고, 재실행에서는 기존 AI 선택을 표시하며 Enter로 유지한다. 메뉴는 `1) Codex`, `2) Gemini CLI / Antigravity`, `3) Claude Code`, `4) 전체 선택`이다. 번호 2는 계속 두 제품을 함께 선택한다.

## 구현 구조

- `lib/engines.js`, `lib/adapters/`: 제품별 지침·스킬 위치, 호출 제한 변환과 안내.
- `lib/configuration.js`: ai-init.json 검증, 저장 구성 재사용, 이전 표시 이름을 엔진 ID로 이관.
- `lib/policies.js`: 공통 원칙·프로젝트 유형·제품별 안내 조합, 관리 구간만 갱신·제거.
- `lib/installation-plan.js`: v1/v2 manifest, 수정 감지, 설치 자원 변경 목록.
- `lib/transaction.js`: 최초 상태와 작업용 사본 준비, 관리 링크 이관, 적용 직전 검사, 실패 복구.
- `setup.js`: 위 기능 연결, 원본 캐시와 제품별 설치본 분리.

준비 중 대상 프로젝트를 수정하지 않는다. 최초 상태의 사본과 작업용 사본을 분리하며, 같은 계획으로 dry-run 출력 또는 실제 적용을 수행한다. dry-run에는 구성·잠금·캐시·새 템플릿·설치 기록도 포함한다. 적용 직전 변경될 자원의 원본 해시를 다시 확인한다. 전원 장애·강제 종료·검사 직후의 경쟁 구간까지 원자적으로 보호하는 파일시스템 트랜잭션은 아니다.

## 설치 결과와 소유권

```text
project/
├─ ai-init.json                       # 제품·프로필·스킬 구성
├─ ai-init.lock.json                  # 고정 외부 소스
├─ AGENTS.md                         # Codex 선택 시
├─ GEMINI.md                         # Gemini/Antigravity 선택 시
├─ CLAUDE.md                         # Claude 선택 시
├─ .agents/
│  ├─ rules/
│  │  ├─ project.md                   # 사용자 소유, 공유
│  │  ├─ local.md                     # 사용자 소유, 로컬
│  │  └─ jobkim.md                    # Antigravity 관리 지침
│  └─ skills/<name>/                  # 공통 제품 설치본
├─ .claude/
│  └─ skills/<name>/                  # Claude 설치본
└─ .ai-core/
   ├─ sources/                       # 원본 캐시
   ├─ install-info.json
   ├─ install-manifest.json           # schema v2
   └─ project-profile.json            # 기존 프로젝트 조사
```

Claude만 선택하면 AGENTS.md·GEMINI.md와 공통 제품 스킬 설치본을 생성하지 않는다. 기존 .claude/CLAUDE.md만 있으면 해당 진입점을 사용하고 import를 그 파일 기준 상대 경로로 만든다. 팀·개인 규칙은 .agents/rules/project.md·local.md 한 원본을 유지한다. 해당 파일의 Antigravity trigger가 Claude 활성 조건으로 변환된다는 의미는 아니다.

Codex와 Claude를 함께 선택하면 원본을 재사용하고 제품별 스킬을 일반 파일로 복사한다. 같은 .agents/skills를 사용하는 제품끼리는 한 번 배치한다. 사용자 호출 전용은 두 제품의 제한 중 하나라도 있으면 제품 형식으로 보존한다. allowed-tools 등 기존 필드의 권한을 임의로 확대하지 않는다. 원본 플러그인의 hooks·MCP·상태 표시 기능은 설치하지 않는다.

gitignore의 ai-init 구간은 생성한 스킬 경로와 관리 인덱스만 제외한다. .agents/skills/나 .claude/ 전체를 제외하지 않는다. 기존 사용자 ignore 항목은 보존한다. ai-init.json·잠금·제품 지침·project.md는 공유하고, 캐시·설치 기록·local.md·Claude 개인 설정은 로컬로 둔다.

## 첫 설치와 갱신

--type new|existing은 프로젝트 작업 정책이며 설치 이력과 별개다. 신규 프로젝트도 충돌 검사하며, 앱 구조·프레임워크·ADR·작업 기록은 설치만으로 생성하지 않는다. 기존 프로젝트는 실제 지침·설정·문서 위치를 조사하며 기존 문서를 이동하지 않는다.

--engine은 최종 구성, --add-engine claude는 기존 구성을 유지하는 추가다. 비대화형 init에서 선택을 생략하면 저장 구성을 사용한다. 제품 추가로 외부 SHA를 갱신하지 않는다. lock --update는 별도 작업이다.

관리 스킬의 내용·추가 파일·소유권이나 관리 지침 구간이 변경됐으면 적용을 보류한다. 지침 구간 밖 사용자 내용과 project.md·local.md는 보존한다. 같은 이름의 사용자 스킬도 전체 적용 전에 충돌로 보고한다. dry-run은 ready: false와 conflicts를 제공하고 종료 코드 1을 반환한다.

엔진 제외 시 이전 manifest가 소유권을 증명하는 스킬과 관리 구간만 정리한다. ai-init이 만든 지침 파일은 사용자 내용이 없을 때만 삭제한다. 생성 여부가 불명확하면 파일 자체는 보존한다. 사용자 settings·hooks·MCP·스킬은 건드리지 않는다.

schema v1 manifest와 프로젝트 안의 관리 junction은 v2와 일반 파일로 이관한다. 더 오래된 설치처럼 스킬 무결성 기록 자체가 없으면 수정 여부를 판정할 수 없어 자동 교체하지 않는다. 해당 스킬을 프로젝트 밖에 별도 보관하고 해당 스킬 설치 폴더를 제거한 뒤 재설치하며, 사용자 변경은 별도 이름의 스킬로 옮긴다. 설치 폴더나 지침 파일 전체가 없으면 재설치로 복원할 수 있다. dry-run의 경로별 안내를 따른다.

## 작업 단위와 커밋 메시지

기존 1.5.0 RC 변경은 설치 기반, CI·패키지 검증, 릴리스 문서 순서로 먼저 기록한다. Claude 지원의 공통 파일은 커밋별 내용에 맞춰 스테이징한다.

| 단위 | 커밋 메시지 | 주요 변경 |
|---|---|---|
| C1 | `refactor: 제품별 설치 어댑터와 구성 모델 분리` | 엔진 경로 등록과 기존 제품 어댑터, 구성 모델 |
| C2 | `feat: Claude Code 규칙과 스킬 설치 지원` | Claude 선택과 파일 설치, 공통 정책, 검증, 설치 계획·복구, 기존 테스트 갱신 |
| C3 | `feat: 설치 구성 재사용과 충돌 검사 및 복구 강화` | 기존 구성 이관과 재사용, 제품 추가·교체 CLI 연결 |
| C4 | `test: Claude 설치 조합과 갱신 회귀 검증 추가` | Claude 회귀 테스트, 패키지·네트워크 스모크 |
| C5 | `docs: Claude 설치와 기존 구성 갱신 안내 정리` | README, 이 문서, 시스템 전략·개발 절차 |

## 검증 상태

- 최종 자동 테스트 79개 통과: 기준 44개와 Claude·갱신 회귀 35개. 신규/기존 프로젝트의 메뉴 조합, 이관, 호출 제한 표기, 동시 사용자 변경 감지, 첫 설치·갱신 실패 복구, 누락 파일 복원과 사용자 인덱스 보존을 포함한다.
- Claude 필드를 포함한 자체 스킬 검증과 git diff --check 통과.
- 실제 고정 외부 소스 네트워크 dry-run 통과: 자체 포함 스킬 53개, 정책 4개, 변경 자원 121개. 대상 폴더 무변경을 확인했고 내려받은 스킬 코드는 실행하지 않았다.
- 실제 npm 패키징·임시 패키지 설치·전체 제품 bundled 첫 설치·저장 구성 재설치·doctor·사용자 파일 보존 검증 통과. 패키지 파일 29개이며 새 어댑터·계획 모듈의 포함을 확인했다.
- Windows / Node 22.22.2에서 검사한다. 다른 OS·Node 버전은 CI 결과 확인이 필요하다.
- 현재 Claude Code 실행 파일이 PATH에 없어 실제 세션의 지침 로딩·스킬 호출·행동 평가는 수행하지 않았다. runtimeVerified는 false다.
- 후속 실제 확인: 새 Claude 세션의 /context all, 자체 스킬 호출, 사용자 호출 전용 차단, 기존 행동 평가 시나리오.
- 명령: npm test, npm run validate:skills, npm run test:network, npm run verify:package, git diff --check.

## 공식 근거

- [지침·import·AGENTS.md](https://code.claude.com/docs/en/memory)
- [Skills와 호출 제어](https://code.claude.com/docs/en/skills)
- [설치](https://code.claude.com/docs/en/setup)
- [설정](https://code.claude.com/docs/en/settings)
- [플러그인 구조](https://code.claude.com/docs/en/plugins-reference)
