const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    assertSafeRelativePath,
    findSkillDirectories,
    inspectExistingProject,
    installSkill,
    installProjectPolicy,
    removeStaleManagedSkills,
    renderProjectPolicy,
    upsertManagedBlock,
    validateUniqueSkillNames,
} = require('../setup');

function withTempDirectory(run) {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-test-'));
    try {
        run(tempDirectory);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

test('원격 경로가 대상 폴더 밖으로 이탈하지 못하게 한다', () => {
    assert.throws(() => assertSafeRelativePath('../outside.txt'), /안전하지 않은/);
    assert.equal(assertSafeRelativePath('depth/re0/SKILL.md'), path.join('depth', 're0', 'SKILL.md'));
});

test('중첩 폴더에서 SKILL.md가 있는 디렉터리를 찾는다', () => {
    withTempDirectory((tempDirectory) => {
        const skillDirectory = path.join(tempDirectory, 'depth', 're0');
        fs.mkdirSync(skillDirectory, { recursive: true });
        fs.writeFileSync(path.join(skillDirectory, 'SKILL.md'), '# re0');

        assert.deepEqual(findSkillDirectories(tempDirectory), [skillDirectory]);
    });
});

test('사용자가 만든 같은 이름의 스킬은 덮어쓰지 않는다', () => {
    withTempDirectory((tempDirectory) => {
        const source = path.join(tempDirectory, 'source', 're0');
        const target = path.join(tempDirectory, 'target');
        const existing = path.join(target, 're0');
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(existing, { recursive: true });
        fs.writeFileSync(path.join(existing, 'SKILL.md'), '# user owned');

        const installed = installSkill(
            { directory: source, legalFiles: [], name: 're0', sourceId: 'paperthin', repository: 'example' },
            target,
        );

        assert.equal(installed, false);
        assert.equal(fs.readFileSync(path.join(existing, 'SKILL.md'), 'utf8'), '# user owned');
    });
});

test('관리 대상에서 제외된 스킬만 안전하게 정리한다', () => {
    withTempDirectory((tempDirectory) => {
        const stale = path.join(tempDirectory, 'stale');
        const userOwned = path.join(tempDirectory, 'user-owned');
        fs.mkdirSync(stale, { recursive: true });
        fs.mkdirSync(userOwned, { recursive: true });
        fs.writeFileSync(
            path.join(stale, '.ai-init-source.json'),
            JSON.stringify({ managedBy: 'my-ai-agent-cli', sourceId: 'paperthin' }),
        );
        fs.writeFileSync(
            path.join(tempDirectory, '.ai-init-managed.json'),
            JSON.stringify({ skills: ['stale', 'user-owned'] }),
        );

        removeStaleManagedSkills(tempDirectory, new Set());

        assert.equal(fs.existsSync(stale), false);
        assert.equal(fs.existsSync(userOwned), true);
    });
});

test('서로 다른 소스의 같은 스킬 이름을 거부한다', () => {
    assert.throws(
        () =>
            validateUniqueSkillNames([
                { name: 'review', sourceId: 'first' },
                { name: 'review', sourceId: 'second' },
            ]),
        /스킬 이름 충돌/,
    );
});

test('기존 지침 파일의 사용자 내용을 보존하고 관리 블록만 갱신한다', () => {
    withTempDirectory((tempDirectory) => {
        const agentsPath = path.join(tempDirectory, 'AGENTS.md');
        fs.writeFileSync(agentsPath, '# User rules\n');

        upsertManagedBlock(agentsPath, renderProjectPolicy('existing'));
        upsertManagedBlock(agentsPath, renderProjectPolicy('new'));

        const content = fs.readFileSync(agentsPath, 'utf8');
        assert.match(content, /# User rules/);
        assert.match(content, /# New Project Entry Policy/);
        assert.doesNotMatch(content, /# Existing Project Entry Policy/);
        assert.equal(content.match(/<!-- ai-init:jobkim:start -->/g).length, 1);
    });
});

test('기존 프로젝트의 지침과 구성 파일을 사실 기반으로 기록한다', () => {
    withTempDirectory((tempDirectory) => {
        fs.mkdirSync(path.join(tempDirectory, '.codex'), { recursive: true });
        fs.mkdirSync(path.join(tempDirectory, 'src'));
        fs.writeFileSync(path.join(tempDirectory, '.codex', 'Codex.md'), '# rules');
        fs.writeFileSync(path.join(tempDirectory, 'package.json'), '{}');

        const profile = inspectExistingProject(tempDirectory);

        assert.deepEqual(profile.instructionsToRead, ['.codex/Codex.md']);
        assert.deepEqual(profile.configurationFiles, ['package.json']);
        assert.deepEqual(profile.topLevelDirectories, ['src']);
    });
});

test('선택한 엔진의 지침 파일만 생성한다', () => {
    withTempDirectory((tempDirectory) => {
        installProjectPolicy(tempDirectory, 'new', ['1'], null);
        assert.equal(fs.existsSync(path.join(tempDirectory, 'AGENTS.md')), true);
        assert.equal(fs.existsSync(path.join(tempDirectory, 'GEMINI.md')), false);

        installProjectPolicy(tempDirectory, 'new', ['2'], null);
        assert.equal(fs.existsSync(path.join(tempDirectory, 'GEMINI.md')), true);
        assert.equal(fs.existsSync(path.join(tempDirectory, '.agents', 'rules', 'jobkim.md')), true);
    });
});
