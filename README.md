# ai-init

사람의 설계 의도와 프로젝트 맥락을 AI에게 전달하고, 구체적인 계획과 실제 검증을 바탕으로 정확하고 효율적으로 작업하도록 규칙과 스킬을 설치하는 CLI입니다. 새 컴퓨터나 다른 프로젝트에서도 같은 개발 방식을 쓰려고 만들었습니다. Codex, Gemini CLI, Antigravity, Claude Code에 적용할 수 있습니다. 목적과 판단 기준은 [시스템 전략](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/system-strategy.md)에 정리합니다.

## 무엇을 설정하나요?

- 관련 구조와 지침을 확인하고, 복잡한 작업은 목표·영향·대안·위험·검증 방법을 계획에 담도록 안내합니다. 수정량보다 원인 해결과 유지보수성을 우선합니다.
- 계획 안의 구현은 맡기되, 계획을 바꾸는 판단과 규칙 충돌은 공유하고 사용자 피드백을 받은 뒤 진행합니다. 실제 검증과 미확인 사항을 구분해 보고합니다.
- Git 작업과 배포는 사용자가 직접 수행하는 것을 기본으로 하고, 요청한 단계만 에이전트에게 맡길 수 있게 합니다.
- 작업 날짜, 주요 변경, 검증 결과와 다음 할 일을 기존 문서에 남기도록 안내합니다. 문서가 부족하면 필요한 구조를 계획에 포함합니다.

[Ponytail](https://github.com/DietrichGebert/ponytail)과 [Paperthin](https://github.com/LilMGenius/paperthin)의 스킬 파일을 가져오고, 기존 프로젝트 조사와 작업 기록을 위한 자체 스킬도 설치합니다. 스킬은 작업에 도움이 될 때 선택하며, 특정 스킬을 모든 개발 작업에 의무 적용하지 않습니다. 플러그인 설치는 포함하지 않습니다.

## 사용 방법

최소 실행 선언은 Node.js 18 이상이며, 보안 지원 중인 Node.js 22·24·26 LTS를 권장합니다. 외부 스킬을 설치하려면 GitHub 네트워크가 필요합니다. 기존 작업이 있다면 먼저 Git 상태를 확인하거나 백업해 두세요.

설정할 프로젝트의 루트 폴더에서 실행합니다.

```bash
npx @jobbykim/ai-init
```

1. **신규 / 기존 프로젝트**를 선택합니다. 신규는 목표와 요구에 맞는 구조부터 시작하고, 기존은 실제 코드와 문서를 먼저 확인하도록 설정합니다.
2. **사용할 AI**를 선택합니다. 복수 선택은 `1,3`처럼 쉼표로 입력합니다.

```text
사용할 AI — 복수 선택 가능
1) Codex
2) Gemini CLI / Antigravity
3) Claude Code
4) 전체 선택
```

재실행하면 기존 선택이 표시됩니다. Enter로 유지하거나 새 번호를 입력합니다. 프로젝트 유형·프로필·스킬 선택은 `ai-init.json`에서 재사용하며, 신규/기존 프로젝트는 작업 정책의 구분이고 첫 설치/갱신 여부는 자동으로 확인합니다. 앱 코드·프레임워크·문서 체계는 설치만으로 생성하지 않습니다.

설치가 끝나면 해당 프로젝트에서 에이전트의 새 세션을 시작하고 평소처럼 작업을 요청하세요. 예를 들면:

```text
로그인 오류를 조사해줘. 관련 코드와 기존 작업 기록을 확인하고 수정 계획을 알려줘.
```

이 예시는 계획까지만 요청하므로 파일을 수정하지 않습니다. “로그인 오류를 수정하고 검증까지 해줘”처럼 구현을 요청하면 접근을 공유한 뒤 요청 범위에서 진행하며, “계획을 보고 승인할 때까지 기다려줘”라고 지정하면 대기합니다. 고정된 4단계나 보고 형식을 매번 채울 필요는 없습니다. 계획을 바꾸는 다른 판단·의견이나 규칙 충돌은 이유·영향·대안을 공유하고 피드백을 받은 뒤 진행합니다.

여러 단계의 작업에서는 관련 기록을 갱신하고, 다음 세션에서 그 기록과 실제 코드를 대조해 이어갑니다. 단순 질문이나 오탈자 수정에 기록 파일을 만들도록 강제하지 않습니다. 프로젝트 목적·효율을 해치는 내용은 짚고, 합의한 범위에서 개선하거나 범위 변경에 대한 피드백을 받습니다.

## 프로젝트에 추가되는 파일

| 파일·폴더 | 용도 |
|---|---|
| `AGENTS.md` | Codex 작업 지침 |
| `GEMINI.md`, `.agents/rules/jobkim.md` | Gemini CLI와 Antigravity 작업 지침 |
| `CLAUDE.md` 또는 기존 `.claude/CLAUDE.md` | Claude Code 작업 지침 |
| `ai-init.json`, `ai-init.lock.json` | 공유할 설치 구성과 외부 소스 고정 정보 |
| `.agents/rules/project.md` | 프로젝트/팀 공통 커스텀 규칙 (Git 추적 권장) |
| `.agents/rules/local.md` | 개발자 개인 로컬 커스텀 규칙 (Git 제외) |
| `.agents/skills/` | Codex·Gemini CLI·Antigravity 스킬 설치본 |
| `.claude/skills/` | Claude Code 스킬 설치본 |
| `.ai-core/` | 스킬 원본과 설치 정보 |

선택한 엔진의 지침만 생성합니다. 기존 지침의 사용자 구간과 사용자 스킬은 보존합니다. 같은 이름의 사용자 스킬이나 수정된 관리 스킬·관리 구간이 있으면 충돌 경로를 보고하고 전체 적용을 보류합니다. 제품별 설치본은 일반 파일로 복사하며 공통 원본은 재사용합니다.

제품별 선택·미리보기·진단도 제공합니다. 아래는 이 저장소의 개발 소스 기준이며 `--root`는 실제 대상 경로로 바꿉니다. npm 패키지를 사용할 때는 해당 버전의 `npx @jobbykim/ai-init` 뒤에 같은 인자를 붙입니다.

```powershell
node setup.js init --root C:/dev/example --type existing --engine codex,antigravity --profile bundled --dry-run --json
node setup.js init --root C:/dev/example --type existing --engine codex,antigravity --profile bundled
node setup.js status --root C:/dev/example --json
node setup.js doctor --root C:/dev/example --json
# 기존 제품을 유지하고 Claude 추가
node setup.js init --root C:/dev/example --add-engine claude --dry-run --json
node setup.js init --root C:/dev/example --add-engine claude
# 최종 제품 구성을 지정하거나 저장 구성 재사용
node setup.js init --root C:/dev/example --engine codex,claude
node setup.js init --root C:/dev/example --json
```

`--profile full`은 자체·외부 스킬을, `bundled`는 자체 스킬만 설치합니다. 첫 설치 기본 프로필은 기존과 같은 full이며 옵션을 생략한 갱신은 저장값을 유지합니다. `--skill NAME`을 반복하면 외부 스킬을 선택하며 자체 스킬은 유지합니다. 선택에서 빠진 관리 스킬은 무결성 확인 후 제거하므로 범위를 바꿀 때 미리보기를 확인합니다. 기존 번호 `1`, `2`, `1,2`는 유지하며 옵션에서는 `codex`, `gemini`, `antigravity`, `claude`, `all`을 사용할 수 있습니다. `--engine`은 최종 구성을 지정하고 `--add-engine`은 기존 구성에 추가합니다.

Antigravity 관리 규칙과 새 템플릿에는 YAML `trigger`를 포함합니다. 기존 사용자 `project.md`·`local.md`는 자동 수정하지 않고 Antigravity 선택 시 `doctor`에서 누락을 안내합니다. Codex의 루트 `AGENTS.override.md`가 활성 상태라면 해당 관리 구간을 갱신합니다. Claude는 전용 진입 파일에서 팀·개인 규칙을 import하며 Codex override를 자동 적용한다고 가정하지 않습니다.

### Claude Code 준비

ai-init은 Claude Code 실행 프로그램과 인증을 설치하지 않습니다. Windows PowerShell에서는 아래 공식 설치 명령을 한 번 실행하고 새 터미널을 엽니다.

```powershell
irm https://claude.ai/install.ps1 | iex
claude --version
claude doctor
claude auth login
```

대상 프로젝트에서 ai-init으로 `3) Claude Code`를 선택한 다음 `claude`로 새 세션을 시작합니다. `/context all`에서 지침을 확인하고 `/jobkim-project-intake`, `/jobkim-project-context`로 자체 스킬을 호출할 수 있습니다. 실행 환경·버전에 따라 확인이 필요하며 파일 설치 성공을 실제 호출 검증으로 취급하지 않습니다. 계정별 인증·다른 OS 설치 방법은 [공식 설치 문서](https://code.claude.com/docs/en/setup)를 따릅니다.

### 사용자 및 프로젝트 커스텀 규칙

`.agents/rules/` 디렉터리에 사용자 정의 프롬프트를 위한 두 개의 파일이 함께 제공됩니다:

- `project.md`: 팀 공통 코딩 컨벤션, 기술 스택, 아키텍처 규칙 등을 작성하며 Git에 커밋하여 팀원과 공유합니다.
- `local.md`: 개발자 개인의 취향, 답변 언어/어조, 로컬 환경(포트 등)을 작성하며 `.gitignore`에 등록되어 로컬 머신에만 유지됩니다.
- 이 파일들은 이미 존재할 경우 `ai-init`을 재실행해도 덮어쓰지 않고 보존합니다. 공통 기본값을 프로젝트·개인 상황에 맞게 구체화하며, 규칙 충돌은 임의로 선택하지 않고 사용자 피드백을 받아 해소합니다. 실행 환경의 상위 지침과 권한은 별도로 따릅니다.

`project.md`에는 목적·성공 조건, 모듈 책임, 유지할 계약, 검증 명령과 ADR 원본 링크를 기록합니다. 3D·디자인 시스템 등 분야별 기준은 해당 프로젝트에 필요한 항목만 선택합니다. `local.md`에는 실제 OS·셸과 소스·외부 에셋 경로를 기록하며, 인증 정보는 넣지 않습니다. 새 템플릿은 신규 파일에만 적용되므로 기존 파일은 필요한 항목만 직접 보완합니다. 적용 예시는 [프로젝트별 기준](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/system-strategy.md#프로젝트별-기준)을 참고하세요.

`.gitignore`의 ai-init 구간에는 캐시·개인 규칙·개인 Claude 설정과 생성한 스킬 경로만 제외하도록 추가합니다. `.agents/skills/`나 `.claude/` 전체를 제외하지 않아 사용자 스킬과 팀 설정을 공유할 수 있습니다. `ai-init.json`, `ai-init.lock.json`, 제품 진입 지침과 `project.md`는 공유합니다. 기존 사용자 ignore 항목과 이미 추적 중인 파일의 Git 상태는 바꾸지 않습니다.

## 업데이트와 버전 확인

새 규칙을 적용하려면 각 프로젝트에서 다시 실행합니다. 최신 패키지를 지정하려면:

```bash
npx @jobbykim/ai-init@latest
```

자체 규칙·스킬과 기본 외부 스냅샷은 npm 패키지 버전에 포함됩니다. 최초 적용은 패키지의 `skill-sources.lock.json`을 사용하고, 대상 프로젝트의 `ai-init.lock.json`에 commit/tree SHA를 보존합니다. 이 파일은 Git으로 공유합니다. 이후 설치는 프로젝트 잠금을 사용하며 `--frozen`은 기존 잠금을 필수로 요구합니다. 캐시는 잠금 SHA와 기록된 파일 무결성이 일치할 때만 재사용합니다.

외부 업데이트는 설치와 분리해 명시적으로 준비합니다. 잠금 변경은 콘텐츠의 안전성을 보증하지 않으므로 스킬·스크립트·권한·라이선스 변경을 검토한 뒤 적용합니다.

```powershell
node setup.js lock --root C:/dev/example --update --dry-run
node setup.js lock --root C:/dev/example --update
# 잠금 diff 검토 후 적용합니다.
node setup.js init --root C:/dev/example --type existing --engine codex --frozen
```

`1.2.0`부터 마지막으로 성공한 적용 버전과 시각을 `.ai-core/install-info.json`에 기록합니다. 이 파일을 직접 열거나 PowerShell에서 확인할 수 있습니다.

```powershell
Get-Content .ai-core/install-info.json
```

설치 오류 시 관리 대상 캐시·스킬·규칙·설치 정보를 백업에서 복구합니다. 복구까지 실패하면 백업 위치와 실패 경로를 출력하며 성공으로 표시하지 않습니다. 프로세스 강제 종료나 전원 장애의 복구까지 보장하지는 않습니다. `status`의 해시는 설치 후 차이를 찾기 위한 정보이며 악의적인 로컬 기록 전체 변조에 대한 서명 검증은 아닙니다.

### 기존 프로젝트 업데이트

규칙을 업데이트하려면 대상 프로젝트 루트에서 초기화 명령을 다시 실행합니다. 저장 구성을 불러와 변경 없는 관리 구간과 관리 스킬을 갱신하며 사용자 구간·스킬과 기존 `project.md`·`local.md`는 보존합니다. 제품을 제외하면 해당 관리 설치본과 관리 구간만 정리하며 사용자 내용이 있는 지침 파일은 남깁니다.

이전 schema v1 설치 기록과 관리 junction은 새 기록·일반 파일로 이관합니다. 무결성 기록이 없는 오래된 관리 스킬은 자동 덮어쓰지 않습니다. dry-run에서 안내한 스킬을 프로젝트 밖에 별도 보관하고 해당 스킬 설치 폴더를 제거한 뒤 재설치하세요. 필요한 사용자 변경은 별도 이름의 스킬로 보존합니다. 수정된 관리 스킬·관리 구간도 사용자 내용과 설치물을 분리한 뒤 다시 실행합니다. 설치 폴더나 지침 파일 전체가 삭제됐다면 재설치로 복원할 수 있습니다.

업데이트 후에는 기존 사용자 규칙과 새 기본 규칙이 충돌하는지 검토합니다. 충돌이 있으면 에이전트가 문구·출처·영향·권장안을 제시하고 사용자 피드백을 받은 뒤 수정합니다. 설치 프로그램이 자연어 규칙의 충돌을 자동 판정하거나 해소하지는 않습니다.

## 장점과 한계

장점은 프로젝트마다 규칙과 스킬을 직접 복사할 필요가 없다는 점입니다. 기존 프로젝트의 문서 구조를 활용하며, 사람이 파일을 열어 작업 흐름과 남은 일을 확인할 수 있도록 기록 기준을 제공합니다.

에이전트가 지침을 항상 지킨다고 보장하지는 않습니다. 스킬 인식과 실행은 사용하는 에이전트에 따라 확인해야 하며, 원본 플러그인의 전체 동작과 같지는 않습니다. 설치만으로 과거 작업 이력이 생기거나 모델이 학습되는 것도 아닙니다.

외부 스킬을 내려받는 데 시간이 걸릴 수 있고, 전체 제거 전용 명령은 없습니다. 제품 선택에서 제외한 관리 설치본은 정리합니다. `--dry-run`도 임시 사본에서 다운로드·검증하므로 네트워크와 임시 공간이 필요합니다. 변경 목록에는 정책·스킬뿐 아니라 구성·잠금·캐시·템플릿·설치 기록도 포함하며 대상 프로젝트는 수정하지 않습니다. 충돌은 `ready: false`와 `conflicts`, 종료 코드 1로 보고합니다. macOS/Linux 결과는 CI 실행 후 확인합니다.

`validate`는 YAML·이름·참조·호환 메타데이터를 검사하며 스킬 코드를 실행하지 않습니다. `validate --engine claude`는 지원하는 Claude 전용 필드의 타입도 확인합니다. 사용자 호출 전용은 제품별 파생본에서 Codex·Claude 형식으로 보존합니다. Gemini/Antigravity에서 같은 native 제한을 보장하지 않으며 `doctor`가 안내합니다. 실행 권한·샌드박스·hooks·MCP·플러그인 설정은 변경하지 않습니다. 실제 런타임 검증 여부는 설치 결과의 `runtimeVerified`로 구분합니다.

## 더 알아보기

- [Claude 지원 구조와 작업별 커밋 메시지](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/claude-code-support.md): 설치 구조, 이전 설치 이관과 검증 상태.

- [개발·배포 절차와 릴리스 기록](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/manual-operations.md): 커밋부터 게시까지 단계별 명령.
- [프로젝트 기록과 작업 인계](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/project-context-policy-design.md): 문서 구조, 변경 이력, 재개·인계 기준.
- [AI 개발 시스템에서 ai-init의 역할](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/system-strategy.md): 현재 책임과 향후 프로젝트 분리 방향.

## 라이선스

작성자: jobkim. CLI와 자체 스킬은 MIT 라이선스입니다. 외부 스킬의 라이선스와 출처 고지도 함께 설치합니다. 자세한 출처는 [NOTICE](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/NOTICE)를 참고하세요.
