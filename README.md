# ai-init

AI 에이전트로 개발할 때 사용할 작업 규칙과 스킬을 프로젝트에 설치하는 CLI입니다. 새 컴퓨터나 다른 프로젝트에서도 같은 개발 방식을 쓰려고 만들었습니다. Codex, Gemini CLI, Antigravity에 적용할 수 있습니다.

## 무엇을 설정하나요?

- 코드를 바꾸기 전에 관련 구조와 기존 지침을 읽고, 필요한 만큼만 수정하도록 안내합니다.
- Git 작업과 배포는 사용자가 직접 수행하는 것을 기본으로 하고, 요청한 단계만 에이전트에게 맡길 수 있게 합니다.
- 작업 날짜, 주요 변경, 검증 결과와 다음 할 일을 기존 문서에 남기도록 안내합니다. 문서가 부족하면 필요한 구조를 제안하고 승인 후 만듭니다.

[Ponytail](https://github.com/DietrichGebert/ponytail)과 [Paperthin](https://github.com/LilMGenius/paperthin)의 스킬 파일을 가져오고, 기존 프로젝트 조사와 작업 기록을 위한 자체 스킬도 설치합니다. 생성 지침은 코딩 작업에 Ponytail을 적용하고 다른 스킬은 작업에 맞춰 선택하도록 안내합니다. 플러그인 설치는 포함하지 않습니다.

## 사용 방법

Node.js 18 이상과 GitHub에 연결할 수 있는 네트워크가 필요합니다. 기존 작업이 있다면 먼저 Git 상태를 확인하거나 백업해 두세요.

설정할 프로젝트의 루트 폴더에서 실행합니다.

```bash
npx @jobbykim/ai-init
```

1. **신규 / 기존 프로젝트**를 선택합니다. 신규는 목표와 최소 구조부터 시작하고, 기존은 실제 코드와 문서를 먼저 확인하도록 설정합니다.
2. **Codex / Gemini·Antigravity / 둘 모두**를 선택합니다. 번호는 `1`, `2`, `1,2`로 입력합니다.

설치가 끝나면 해당 프로젝트에서 에이전트의 새 세션을 시작하고 평소처럼 작업을 요청하세요. 예를 들면:

```text
로그인 오류를 조사해줘. 관련 코드와 기존 작업 기록을 확인하고 수정 계획을 알려줘.
```

에이전트가 계획을 제시하면 필요한 범위의 수정을 요청합니다. 여러 단계의 작업에서는 기록을 갱신하고, 다음 세션에서 그 기록과 실제 코드를 확인해 작업을 이어가도록 지침이 제공됩니다. 단순 질문이나 오탈자 수정에 기록 파일을 만들도록 강제하지 않습니다.

## 프로젝트에 추가되는 파일

| 파일·폴더 | 용도 |
|---|---|
| `AGENTS.md` | Codex 작업 지침 |
| `GEMINI.md`, `.agents/rules/jobkim.md` | Gemini CLI와 Antigravity 작업 지침 |
| `.agents/skills/` | 공통 스킬 |
| `.ai-core/` | 스킬 원본과 설치 정보 |

선택한 엔진의 지침만 생성합니다. 기존 지침은 보존하고 ai-init이 추가한 구간을 갱신합니다. 같은 이름의 사용자 스킬이 있으면 덮어쓰지 않고 건너뜁니다.

`.gitignore`에는 `.ai-core/`, `.agents/rules/jobkim.md`, `.agents/skills/` 전체를 제외하도록 추가합니다. `AGENTS.md`와 `GEMINI.md`는 Git 제외 대상이 아닙니다. 이미 Git에서 추적 중인 파일은 이 설정만으로 추적이 해제되지 않습니다.

## 업데이트와 버전 확인

새 규칙을 적용하려면 각 프로젝트에서 다시 실행합니다. 최신 패키지를 지정하려면:

```bash
npx @jobbykim/ai-init@latest
```

자체 규칙과 스킬은 npm 패키지 버전을 따르고, 외부 스킬은 실행할 때 지정된 GitHub 브랜치에서 가져옵니다. npm 버전을 고정해도 외부 스킬 내용은 바뀔 수 있습니다. 동기화에 실패하면 이전 캐시를 사용하고, 캐시가 없는 최초 설치는 중단합니다.

`1.2.0`부터 마지막으로 성공한 적용 버전과 시각을 `.ai-core/install-info.json`에 기록합니다. 이 파일을 직접 열거나 PowerShell에서 확인할 수 있습니다.

```powershell
Get-Content .ai-core/install-info.json
```

실패한 재실행에서는 이전 기록이 유지되지만 일부 파일은 변경됐을 수 있습니다.

## 장점과 한계

장점은 프로젝트마다 규칙과 스킬을 직접 복사할 필요가 없다는 점입니다. 기존 프로젝트의 문서 구조를 활용하며, 사람이 파일을 열어 작업 흐름과 남은 일을 확인할 수 있도록 기록 기준을 제공합니다.

에이전트가 지침을 항상 지킨다고 보장하지는 않습니다. 스킬 인식과 실행은 사용하는 에이전트에 따라 확인해야 하며, 원본 플러그인의 전체 동작과 같지는 않습니다. 설치만으로 과거 작업 이력이 생기거나 모델이 학습되는 것도 아닙니다.

외부 스킬을 내려받는 데 시간이 걸릴 수 있고, 현재 자동 제거 명령은 없습니다. macOS와 Linux 실환경 검증은 아직 진행하지 않았습니다.

## 더 알아보기

- [개발·배포 절차와 릴리스 기록](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/manual-operations.md): 커밋부터 게시까지 단계별 명령.
- [프로젝트 기록과 작업 인계](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/project-context-policy-design.md): 문서 구조, 변경 이력, 재개·인계 기준.
- [AI 개발 시스템에서 ai-init의 역할](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/docs/system-strategy.md): 현재 책임과 향후 프로젝트 분리 방향.

## 라이선스

작성자: jobkim. CLI와 자체 스킬은 MIT 라이선스입니다. 외부 스킬의 라이선스와 출처 고지도 함께 설치합니다. 자세한 출처는 [NOTICE](https://github.com/kyuhokim11/my-ai-agent-cli/blob/main/NOTICE)를 참고하세요.
