const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    label: 'Claude Code',
    skills: '.claude/skills',
    explicitPolicy: 'disable-model-invocation',
    adaptSkill({ document, explicitOnly }) {
        if (!explicitOnly) return null;
        document.set('disable-model-invocation', true);
        return 'disable-model-invocation';
    },
    policyPaths(root) {
        // Keep an existing native entry point instead of creating a duplicate.
        return [fs.existsSync(path.join(root, '.claude', 'CLAUDE.md')) && !fs.existsSync(path.join(root, 'CLAUDE.md'))
            ? '.claude/CLAUDE.md' : 'CLAUDE.md'];
    },
    instructions: 'Claude Code에서는 CLAUDE.md, CLAUDE.local.md와 .claude/rules/의 로딩 범위를 확인한다. Codex의 AGENTS.override.md를 Claude 지침으로 취급하지 않는다. 스킬은 .claude/skills/에서 사용하며, 사용자 호출 전용 스킬의 disable-model-invocation을 유지한다. 별도 에이전트에 위임할 때 필요한 제약과 검증 기준을 명시한다. 지침은 permissions·hooks·sandbox 설정을 대신하지 않는다.',
};
