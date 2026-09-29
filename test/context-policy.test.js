const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    copyDirectory, findSkillDirectories, installSkill, installProjectPolicy,
    inspectExistingProject, updateGitignore,
} = require('../setup');

const repositoryRoot = path.join(__dirname, '..');

for (const projectType of ['new', 'existing']) {
    for (const engines of [['1'], ['2'], ['1', '2']]) {
        test(`기록 정책 ${projectType}/${engines.join(',')}: 번들 전달과 재설치 보존`, () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-context-'));
            try {
                const sources = path.join(root, '.ai-core', 'sources', 'jobkim');
                const target = path.join(root, '.agents', 'skills');
                const customRecord = path.join(root, 'project-notes', 'active.md');
                fs.mkdirSync(path.dirname(customRecord), { recursive: true });
                fs.writeFileSync(customRecord, '# 사용자 작업\n검증 대기\n');
                const targets = [
                    ...(engines.includes('1') ? ['AGENTS.md'] : []),
                    ...(engines.includes('2') ? ['GEMINI.md', '.agents/rules/jobkim.md'] : []),
                ];
                for (const file of targets) {
                    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
                    fs.writeFileSync(path.join(root, file), '기록 원본: project-notes/active.md\n');
                }
                for (let run = 0; run < 2; run += 1) {
                    copyDirectory(path.join(repositoryRoot, 'bundled-skills'), sources);
                    fs.mkdirSync(target, { recursive: true });
                    for (const directory of findSkillDirectories(sources)) {
                        assert.equal(installSkill({ directory, name: path.basename(directory),
                            sourceId: 'jobkim', repository: 'local-test', legalFiles: [] }, target), true);
                    }
                    installProjectPolicy(root, projectType, engines,
                        projectType === 'existing' ? inspectExistingProject(root) : null);
                    updateGitignore(root);
                }
                for (const file of ['SKILL.md', 'references/structure.md', 'references/records.md']) {
                    assert.deepEqual(
                        fs.readFileSync(path.join(target, 'jobkim-project-context', file)),
                        fs.readFileSync(path.join(repositoryRoot, 'bundled-skills', 'jobkim-project-context', file)),
                    );
                }
                assert.equal(fs.existsSync(path.join(target, 'jobkim-project-intake', 'SKILL.md')), true);
                for (const file of targets) {
                    const content = fs.readFileSync(path.join(root, file), 'utf8');
                    assert.ok(content.startsWith('기록 원본: project-notes/active.md\n'));
                    assert.ok(content.includes(fs.readFileSync(path.join(repositoryRoot, 'rules/core.md'), 'utf8').trim()));
                    assert.equal(content.split('<!-- ai-init:jobkim:start -->').length - 1, 1);
                }
                assert.equal(fs.readFileSync(customRecord, 'utf8'), '# 사용자 작업\n검증 대기\n');
                assert.equal(fs.existsSync(path.join(root, 'docs')), false);
                assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), engines.includes('1'));
                assert.equal(fs.existsSync(path.join(root, 'GEMINI.md')), engines.includes('2'));
                assert.doesNotMatch(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /docs|project-notes/);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    }
}
