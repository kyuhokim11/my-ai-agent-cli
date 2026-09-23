# Universal AI-Agent Dev Initializer

`jobkim`의 작업 방식, 규칙, 전략과 자체 스킬을 npm 패키지로 버전 관리하고, Codex와 Gemini/Antigravity 프로젝트에 동일하게 적용하는 CLI입니다. 검토된 외부 오픈소스 스킬 컬렉션도 함께 설치하고 최신 상태로 동기화합니다.

## 시스템 정의

- npm에 게시된 같은 버전은 어느 컴퓨터와 프로젝트에서도 같은 `jobkim` 규칙과 자체 스킬을 제공합니다.
- 자체 규칙과 스킬은 이 저장소에서 발전시키며, 다음 npm 버전에 포함해 사용하는 프로젝트로 전달합니다.
- 외부 스킬은 공식 저장소의 최신 버전을 동기화하지만, 소스 추가 전 효용과 라이선스를 검토합니다.
- 사용자 지시는 검토 후 자체 규칙, 전략, 스킬 또는 초기화 정책의 적절한 단일 원천에 반영합니다.
- 에이전트 모델이 발전하면 불필요해진 지침을 제거하고, 여전히 필요한 작업 원칙과 검증 기준을 남깁니다.

## 현재 지원 소스

- [Ponytail](https://github.com/DietrichGebert/ponytail)
- [Paperthin](https://github.com/LilMGenius/paperthin)

지원 소스의 기준은 `skill-sources.json`입니다. 각 실행은 지정된 브랜치의 최신 Git tree를 조회하고 `skills/` 아래의 모든 파일을 다운로드합니다. 내려받은 파일은 Git blob SHA를 대조한 후에만 기존 캐시를 교체하며, 동기화된 tree SHA는 `_SOURCE.json`에 기록됩니다.

## 설치 동작

```bash
ai-init
```

실행 후 신규/기존 프로젝트 유형과 Codex, Gemini/Antigravity 또는 둘 모두를 선택할 수 있습니다.

- 원본 스킬은 현재 프로젝트의 `.ai-core/sources/<source-id>`에 저장됩니다.
- 공통 Agent Skills는 `.agents/skills`에 연결됩니다. Codex, Gemini CLI와 Antigravity가 이 경로를 지원합니다.
- Codex 상시 지침은 `AGENTS.md`의 관리 블록에 기록됩니다.
- Gemini CLI 상시 지침은 `GEMINI.md`의 관리 블록에 기록됩니다.
- Antigravity 상시 지침은 `.agents/rules/jobkim.md`에 기록됩니다.
- 심볼릭 링크 또는 Windows junction을 만들 수 없으면 디렉터리를 복사합니다.
- 기존 사용자 스킬과 이름이 겹치면 사용자 파일을 보존하고 해당 스킬 설치를 건너뜁니다.
- 기존 `AGENTS.md`와 `GEMINI.md` 내용은 보존하고 이 CLI의 마커 내부만 갱신합니다.
- 이전 실행에서 이 CLI가 관리했다고 표시한 스킬만 업데이트하거나 정리합니다.
- 네트워크 동기화가 실패하면 마지막으로 정상 동기화된 캐시를 사용합니다. 최초 실행이고 캐시도 없으면 설치를 중단합니다.

### 신규 프로젝트

목적과 성공 조건을 먼저 확정하고, 요청되지 않은 프레임워크나 확장 구조를 미리 추가하지 않는 초기화 정책을 적용합니다.

### 기존 프로젝트

기존 지침, Git 상태, 패키지·빌드 설정과 관련 진입 흐름을 먼저 확인하는 정책을 적용합니다. 설치 시 발견한 루트 지침과 구성 파일, 최상위 디렉터리는 `.ai-core/project-profile.json`에 기록하며, 에이전트는 실제 작업 경로를 추가로 조사한 뒤 변경합니다.

## 소스 추가

새 스킬 컬렉션은 `skill-sources.json`에 다음 정보를 추가합니다.

- 고유한 `id`
- GitHub `owner`와 `repo`
- 추적할 `ref`
- 저장소 루트 기준 `skillsPath`
- 함께 보존할 `legalFiles`
- 이름 충돌이 예상될 때 사용할 선택적 `installPrefix`

소스를 추가하기 전에 라이선스가 재배포를 허용하는지, 저작권·허가 고지와 upstream NOTICE를 어떤 범위로 보존해야 하는지 검토해야 합니다. 확인되지 않은 저장소를 자동으로 탐색하거나 설치하지 않습니다.

## 라이선스

이 CLI는 MIT 라이선스로 배포됩니다. 다운로드되는 스킬은 각 upstream 프로젝트의 라이선스를 따릅니다. 설치기는 매니페스트에 지정된 upstream `LICENSE`와 `NOTICE`를 각 설치 스킬에 함께 보존합니다. 자세한 출처는 `NOTICE`를 참고하세요.
