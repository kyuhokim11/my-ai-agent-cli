const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

module.exports = {
    label: 'Codex',
    skills: '.agents/skills',
    explicitPolicy: 'agents/openai.yaml',
    adaptSkill({ directory, explicitOnly }) {
        if (!explicitOnly) return null;
        const file = path.join(directory, 'agents', 'openai.yaml');
        const document = fs.existsSync(file) ? YAML.parseDocument(fs.readFileSync(file, 'utf8')) : new YAML.Document({});
        if (document.errors.length) throw new Error(`잘못된 호출 정책: ${file}`);
        document.setIn(['policy', 'allow_implicit_invocation'], false);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, document.toString(), 'utf8');
        return 'agents/openai.yaml';
    },
    policyPaths(root) {
        const override = path.join(root, 'AGENTS.override.md');
        return [fs.existsSync(override) && fs.readFileSync(override, 'utf8').trim() ? 'AGENTS.override.md' : 'AGENTS.md'];
    },
    instructions: 'Codex에서는 현재 작업 범위의 AGENTS.override.md와 AGENTS.md 탐색 계층을 확인한다. .codex/Codex.md는 존재할 때 참고하는 사용자 문서다.',
};
