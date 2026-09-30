const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { Readable, Writable } = require('node:stream');
const test = require('node:test');

const {
    assertSafeRelativePath,
    copyDirectory,
    createQuestionReader,
    ensureCustomRuleTemplates,
    findSkillDirectories,
    inspectExistingProject,
    installSkill,
    installProjectPolicy,
    parseProjectType,
    parseSelectedEngines,
    removeStaleManagedSkills,
    renderProjectPolicy,
    runCli,
    synchronizeSkills,
    updateGitignore,
    upsertManagedBlock,
    validateUniqueSkillNames,
} = require('../setup');

test('연속으로 들어온 대화형 응답을 순서대로 읽는다', async () => {
    const output = new Writable({ write(chunk, encoding, callback) { callback(); } });
    const rl = readline.createInterface({ input: Readable.from(['2\n2\n']), output });
    const ask = createQuestionReader(rl);

    assert.equal(await ask('첫 번째 질문: '), '2');
    assert.equal(await ask('두 번째 질문: '), '2');
    rl.close();
    await new Promise((resolve) => output.end(resolve));
});

test('연속된 기존 프로젝트와 Gemini 선택을 동기화 단계에 전달한다', async () => {
    const output = new Writable({ write(chunk, encoding, callback) { callback(); } });
    let received;

    await runCli({
        input: Readable.from(['2\n2\n']),
        output,
        projectRoot: 'example-project',
        synchronize: async (...arguments_) => {
            received = arguments_;
            return { skillCount: 1, policyFiles: 2 };
        },
    });

    assert.deepEqual(received, ['example-project', ['2'], 'existing']);
    await new Promise((resolve) => output.end(resolve));
});

test('프로젝트와 엔진 선택을 해석하고 잘못된 번호를 거부한다', () => {
    assert.equal(parseProjectType(' 1 '), 'new');
    assert.equal(parseProjectType('2'), 'existing');
    assert.throws(() => parseProjectType('3'), /1 또는 2/);
    assert.deepEqual(parseSelectedEngines('1'), ['1']);
    assert.deepEqual(parseSelectedEngines('2'), ['2']);
    assert.deepEqual(parseSelectedEngines('1,2'), ['1', '2']);
    assert.deepEqual(parseSelectedEngines(' 2, 1,2 '), ['2', '1']);
    assert.throws(() => parseSelectedEngines(''), /1, 2 또는 1,2/);
    assert.throws(() => parseSelectedEngines('1,3'), /1, 2 또는 1,2/);
});

test('잘못된 엔진 선택은 파일 생성 전에 거부한다', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-test-'));
    try {
        await assert.rejects(() => synchronizeSkills(tempDirectory, ['3'], 'new'), /1, 2 또는 1,2/);
        assert.deepEqual(fs.readdirSync(tempDirectory), []);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

function withTempDirectory(run) {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-test-'));
    try {
        run(tempDirectory);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

test('한글과 공백이 있는 경로에 중첩 디렉터리를 복사한다', () => {
    withTempDirectory((tempDirectory) => {
        const source = path.join(tempDirectory, 'source', 'nested');
        const destination = path.join(tempDirectory, '수소추진 선박', '복사 결과');
        fs.mkdirSync(source, { recursive: true });
        fs.writeFileSync(path.join(source, 'SKILL.md'), '# copied');

        copyDirectory(path.join(tempDirectory, 'source'), destination);

        assert.equal(fs.readFileSync(path.join(destination, 'nested', 'SKILL.md'), 'utf8'), '# copied');
    });
});

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

test('모든 엔진의 기존 지침 내용을 보존하고 관리 블록만 갱신한다', () => {
    withTempDirectory((tempDirectory) => {
        const policyFiles = ['AGENTS.md', 'GEMINI.md', path.join('.agents', 'rules', 'jobkim.md')];
        for (const policyFile of policyFiles) {
            const policyPath = path.join(tempDirectory, policyFile);
            fs.mkdirSync(path.dirname(policyPath), { recursive: true });
            fs.writeFileSync(policyPath, '# User rules\n');

            upsertManagedBlock(policyPath, renderProjectPolicy('existing'));
            upsertManagedBlock(policyPath, renderProjectPolicy('new'));

            const content = fs.readFileSync(policyPath, 'utf8');
            assert.match(content, /# User rules/);
            assert.match(content, /# New Project Entry Policy/);
            assert.doesNotMatch(content, /# Existing Project Entry Policy/);
            assert.equal(content.match(/<!-- ai-init:jobkim:start -->/g).length, 1);
        }
    });
});

test('기존 gitignore를 보존하고 ai-init 관리 항목만 갱신한다', () => {
    withTempDirectory((tempDirectory) => {
        const gitignorePath = path.join(tempDirectory, '.gitignore');
        fs.writeFileSync(gitignorePath, 'node_modules/\n');

        updateGitignore(tempDirectory);
        updateGitignore(tempDirectory);

        const content = fs.readFileSync(gitignorePath, 'utf8');
        assert.match(content, /node_modules\//);
        assert.match(content, /\/\.ai-core\//);
        assert.match(content, /\/\.agents\/rules\/jobkim\.md/);
        assert.match(content, /\/\.agents\/rules\/local\.md/);
        assert.match(content, /\/\.agents\/skills\//);
        assert.doesNotMatch(content, /\/\.agents\/rules\/project\.md/);
        assert.doesNotMatch(content, /AGENTS\.md|GEMINI\.md/);
        assert.equal(content.match(/# ai-init:managed:start/g).length, 1);
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

for (const [projectType, selectedEngines, expectedFiles] of [
    ['new', ['1'], ['AGENTS.md']],
    ['new', ['2'], ['GEMINI.md', path.join('.agents', 'rules', 'jobkim.md')]],
    ['new', ['1', '2'], ['AGENTS.md', 'GEMINI.md', path.join('.agents', 'rules', 'jobkim.md')]],
    ['existing', ['1'], ['AGENTS.md']],
    ['existing', ['2'], ['GEMINI.md', path.join('.agents', 'rules', 'jobkim.md')]],
    ['existing', ['1', '2'], ['AGENTS.md', 'GEMINI.md', path.join('.agents', 'rules', 'jobkim.md')]],
]) {
    test(`${projectType} 프로젝트에서 ${selectedEngines.join(',')} 엔진 파일만 생성한다`, () => {
        withTempDirectory((tempDirectory) => {
            const existingProfile = projectType === 'existing' ? { instructionsToRead: [] } : null;
            installProjectPolicy(tempDirectory, projectType, selectedEngines, existingProfile);
            const coreRules = fs.readFileSync(path.join(__dirname, '..', 'rules', 'core.md'), 'utf8').trim();
            const modeTitle = projectType === 'existing' ? '# Existing Project Entry Policy' : '# New Project Entry Policy';

            for (const candidate of ['AGENTS.md', 'GEMINI.md', path.join('.agents', 'rules', 'jobkim.md')]) {
                const candidatePath = path.join(tempDirectory, candidate);
                assert.equal(fs.existsSync(candidatePath), expectedFiles.includes(candidate));
                if (expectedFiles.includes(candidate)) {
                    const content = fs.readFileSync(candidatePath, 'utf8');
                    assert.equal(content.includes(coreRules), true);
                    assert.match(content, new RegExp(modeTitle));
                }
            }
            assert.equal(
                fs.existsSync(path.join(tempDirectory, '.ai-core', 'project-profile.json')),
                projectType === 'existing',
            );
        });
    });
}

test('모든 엔진 지침에 공통 스킬 라우팅 정책을 생성한다', () => {
    withTempDirectory((tempDirectory) => {
        installProjectPolicy(tempDirectory, 'new', ['1', '2'], null);
        const coreRules = fs.readFileSync(path.join(__dirname, '..', 'rules', 'core.md'), 'utf8').trim();

        const policyFiles = [
            path.join(tempDirectory, 'AGENTS.md'),
            path.join(tempDirectory, 'GEMINI.md'),
            path.join(tempDirectory, '.agents', 'rules', 'jobkim.md'),
        ];
        for (const policyFile of policyFiles) {
            const content = fs.readFileSync(policyFile, 'utf8');
            assert.equal(content.includes(coreRules), true);
        }
    });
});

test('커스텀 규칙 템플릿을 생성하고 기존 사용자 커스텀 규칙은 보존한다', () => {
    withTempDirectory((tempDirectory) => {
        const projectRulePath = path.join(tempDirectory, '.agents', 'rules', 'project.md');
        const localRulePath = path.join(tempDirectory, '.agents', 'rules', 'local.md');

        // 최초 실행: 템플릿 생성 확인
        ensureCustomRuleTemplates(tempDirectory);
        assert.equal(fs.existsSync(projectRulePath), true);
        assert.equal(fs.existsSync(localRulePath), true);
        assert.match(fs.readFileSync(projectRulePath, 'utf8'), /# Project Custom Rules/);
        assert.match(fs.readFileSync(localRulePath, 'utf8'), /# Local \/ Personal Rules/);

        // 사용자가 커스텀 내용 작성
        fs.writeFileSync(projectRulePath, '# Custom Project Rules by User', 'utf8');
        fs.writeFileSync(localRulePath, '# Custom Local Rules by User', 'utf8');

        // 재실행: 사용자 작성 내용 보존 확인
        ensureCustomRuleTemplates(tempDirectory);
        assert.equal(fs.readFileSync(projectRulePath, 'utf8'), '# Custom Project Rules by User');
        assert.equal(fs.readFileSync(localRulePath, 'utf8'), '# Custom Local Rules by User');
    });
});

test('기존 프로젝트의 커스텀 규칙 파일을 조사 대상 지침으로 포함한다', () => {
    withTempDirectory((tempDirectory) => {
        const rulesDirectory = path.join(tempDirectory, '.agents', 'rules');
        fs.mkdirSync(rulesDirectory, { recursive: true });
        fs.writeFileSync(path.join(rulesDirectory, 'project.md'), '# project');
        fs.writeFileSync(path.join(rulesDirectory, 'local.md'), '# local');

        const profile = inspectExistingProject(tempDirectory);
        assert.equal(profile.instructionsToRead.includes('.agents/rules/project.md'), true);
        assert.equal(profile.instructionsToRead.includes('.agents/rules/local.md'), true);
    });
});
