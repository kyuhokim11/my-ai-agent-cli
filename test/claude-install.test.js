const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable, Writable } = require('node:stream');
const test = require('node:test');
const { synchronizeSkills, prepareSkill, runCli } = require('../setup');
const { expandEngines } = require('../lib/engines');
const { readConfiguration } = require('../lib/configuration');
const { snapshotFiles } = require('../lib/source-lock');
const { createInstallationPlan, readManifest } = require('../lib/installation-plan');
const { applyInstallationPlan } = require('../lib/transaction');
const { status } = require('../lib/diagnostics');
const { frontmatter } = require('../lib/skills');
const crypto = require('node:crypto');

const options = { profile: 'bundled', log: () => {} };
async function temporary(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-claude-test-'));
    try { return await run(root); }
    finally {
        assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
        fs.rmSync(root, { recursive: true, force: true });
    }
}
function write(root, relative, text) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
}
function read(root, relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
async function cli(root, args, answers = '') {
    let output = '';
    const stream = new Writable({ write(chunk, encoding, callback) { output += chunk; callback(); } });
    const result = await runCli({ projectRoot: root, args, input: Readable.from([answers]), output: stream });
    if (args.includes('--json')) assert.equal(JSON.parse(output).error, undefined, output);
    return { result, output };
}

for (const projectType of ['new', 'existing']) {
    for (const selected of [['1'], ['2'], ['3'], ['1', '2'], ['1', '3'], ['2', '3'], ['4']]) {
        test(`${projectType}/${selected}: 제품별 설치·재설치와 진단`, () => temporary(async (root) => {
            const engines = expandEngines(selected);
            const first = await synchronizeSkills(root, selected, projectType, options);
            const hasShared = engines.some((engine) => engine !== 'claude');
            const hasClaude = engines.includes('claude');
            assert.equal(first.skillCount, 2);
            assert.equal(first.targetCount, Number(hasShared) + Number(hasClaude));
            assert.equal(first.installedCopies, 2 * first.targetCount);
            assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), engines.includes('codex'));
            assert.equal(fs.existsSync(path.join(root, 'GEMINI.md')), engines.includes('gemini') || engines.includes('antigravity'));
            assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), hasClaude);
            assert.equal(fs.existsSync(path.join(root, '.ai-core/project-profile.json')), projectType === 'existing');
            for (const directory of ['.agents/skills', '.claude/skills']) {
                if (!(directory.startsWith('.claude') ? hasClaude : hasShared)) continue;
                const installed = path.join(root, directory, 'jobkim-project-context');
                assert.equal(fs.lstatSync(installed).isSymbolicLink(), false);
                assert.equal(read(root, `${directory}/jobkim-project-context/SKILL.md`), read(path.join(__dirname, '..'), 'bundled-skills/jobkim-project-context/SKILL.md'));
            }
            if (hasClaude) {
                assert.match(read(root, 'CLAUDE.md'), /@\.agents\/rules\/project\.md/);
                assert.match(read(root, 'CLAUDE.md'), /@\.agents\/rules\/local\.md/);
            }
            assert.deepEqual(readConfiguration(root).engines, engines);
            await synchronizeSkills(root, selected, projectType, options);
            assert.equal(status(root, require('../package.json'), require('../skill-sources.json')).healthy, true);
        }));
    }
}

test('미리보기는 구성·잠금·템플릿·설치 기록을 포함하고 대상은 변경하지 않는다', () => temporary(async (root) => {
    write(root, 'README.md', 'user notes');
    const before = snapshotFiles(root);
    const result = await synchronizeSkills(root, ['3'], 'existing', { ...options, dryRun: true });
    for (const relative of ['ai-init.json', 'ai-init.lock.json', '.gitignore', '.agents/rules/project.md', '.agents/rules/local.md', '.ai-core/install-info.json', '.ai-core/install-manifest.json', '.claude/skills/jobkim-project-context', 'CLAUDE.md']) {
        assert.ok(result.changes.some((change) => change.path === relative), relative);
    }
    assert.deepEqual(snapshotFiles(root), before);
}));

test('Codex에 Claude 추가 후 제외해도 공통 규칙·사용자 Claude 파일은 보존한다', () => temporary(async (root) => {
    write(root, 'CLAUDE.md', '# 사용자 Claude 안내\n');
    const settings = write(root, '.claude/settings.json', '{"permissions":{"deny":["Read(.env)"]}}');
    write(root, '.claude/skills/my-skill/SKILL.md', '# user skill');
    await synchronizeSkills(root, ['1'], 'existing', options);
    write(root, '.agents/rules/project.md', '# 팀 규칙\n');
    write(root, '.agents/rules/local.md', '# 개인 규칙\n');
    const lock = read(root, 'ai-init.lock.json');
    await cli(root, ['init', '--add-engine', 'claude', '--json']);
    assert.deepEqual(readConfiguration(root).engines, ['codex', 'claude']);
    assert.equal(read(root, 'ai-init.lock.json'), lock);
    assert.ok(fs.existsSync(path.join(root, 'AGENTS.md')));
    await cli(root, ['init', '--engine', 'codex', '--json']);
    assert.equal(read(root, 'CLAUDE.md').trim(), '# 사용자 Claude 안내');
    assert.equal(fs.existsSync(path.join(root, '.claude/skills/jobkim-project-context')), false);
    assert.equal(read(root, '.claude/skills/my-skill/SKILL.md'), '# user skill');
    assert.equal(fs.readFileSync(settings, 'utf8'), '{"permissions":{"deny":["Read(.env)"]}}');
    assert.equal(read(root, '.agents/rules/project.md'), '# 팀 규칙\n');
    assert.equal(read(root, '.agents/rules/local.md'), '# 개인 규칙\n');
}));

test('새로 생성한 Claude 지침은 제외 시 정리하고 공유 스킬은 마지막 소비자까지 유지한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['4'], 'new', options);
    await synchronizeSkills(root, ['2'], 'new', options);
    assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), false);
    assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(root, '.agents/skills/jobkim-project-context')), true);
    await synchronizeSkills(root, ['3'], 'new', options);
    assert.equal(fs.existsSync(path.join(root, '.agents/skills/jobkim-project-context')), false);
    assert.equal(fs.existsSync(path.join(root, 'GEMINI.md')), false);
    assert.equal(fs.existsSync(path.join(root, '.agents/rules/jobkim.md')), false);
}));

test('기존 .claude/CLAUDE.md를 재사용하고 import를 파일 기준으로 생성한다', () => temporary(async (root) => {
    write(root, '.claude/CLAUDE.md', '# existing native instructions\n');
    await synchronizeSkills(root, ['3'], 'existing', options);
    assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), false);
    assert.match(read(root, '.claude/CLAUDE.md'), /@\.\.\/\.agents\/rules\/project\.md/);
    assert.match(read(root, '.claude/CLAUDE.md'), /# existing native instructions/);
    await synchronizeSkills(root, ['3'], 'existing', options);
}));

test('관리 스킬 변경·추가 파일·정책 구간 변경은 갱신과 제거 전에 충돌로 보존한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['1', '3'], 'existing', options);
    write(root, '.claude/skills/jobkim-project-context/custom.txt', 'user addition');
    const before = snapshotFiles(root);
    const preview = await synchronizeSkills(root, ['1'], 'existing', { ...options, dryRun: true });
    assert.equal(preview.ready, false);
    assert.equal(preview.conflicts[0].path, '.claude/skills/jobkim-project-context');
    await assert.rejects(synchronizeSkills(root, ['1'], 'existing', options), /설치 충돌/);
    assert.deepEqual(snapshotFiles(root), before);
    fs.unlinkSync(path.join(root, '.claude/skills/jobkim-project-context/custom.txt'));
    write(root, 'CLAUDE.md', read(root, 'CLAUDE.md').replace('# jobkim Development Principles', '# edited managed principles'));
    await assert.rejects(synchronizeSkills(root, ['1'], 'existing', options), /수정된 관리 구간/);
}));

test('사용자 지침 구간 밖의 변경은 허용하고 같은 이름 사용자 스킬은 전체 적용 전에 보존한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['3'], 'new', options);
    fs.appendFileSync(path.join(root, 'CLAUDE.md'), '\n# custom appendix\n');
    await synchronizeSkills(root, ['3'], 'new', options);
    assert.match(read(root, 'CLAUDE.md'), /# custom appendix/);
    write(root, '.agents/skills/jobkim-project-intake/SKILL.md', '# user owned');
    const before = snapshotFiles(root);
    const preview = await synchronizeSkills(root, ['4'], 'existing', { ...options, dryRun: true });
    assert.equal(preview.ready, false);
    await assert.rejects(synchronizeSkills(root, ['4'], 'existing', options), /같은 이름의 사용자 스킬/);
    assert.deepEqual(snapshotFiles(root), before);
}));

test('Codex 전용 호출 제한을 Claude 파생본에 반영하고 원본·도구 정책은 보존한다', () => temporary((root) => {
    const directory = path.dirname(write(root, 'deploy/SKILL.md', '---\nname: deploy\ndescription: Deploy on request\nallowed-tools: Read\n---\nDeploy $ARGUMENTS\n'));
    write(root, 'deploy/agents/openai.yaml', 'policy:\n  allow_implicit_invocation: false\n');
    const before = snapshotFiles(directory);
    const prepared = prepareSkill({ directory, sourceId: 'fixture', name: 'team-deploy' }, path.join(root, 'derived'), ['claude']);
    const result = frontmatter(fs.readFileSync(path.join(prepared.directory, 'SKILL.md'), 'utf8')).data;
    assert.equal(result['disable-model-invocation'], true);
    assert.equal(result['allowed-tools'], 'Read');
    assert.equal(result.name, 'team-deploy');
    assert.deepEqual(snapshotFiles(directory), before);
    assert.ok(prepared.transformations.includes('disable-model-invocation'));
}));

test('잘못된 Claude 호출 정책을 조용히 무시하지 않는다', () => temporary((root) => {
    const directory = path.dirname(write(root, 'deploy/SKILL.md', '---\nname: deploy\ndescription: Deploy on request\ndisable-model-invocation: sometimes\n---\nbody\n'));
    assert.throws(() => prepareSkill({ directory, sourceId: 'fixture', name: 'deploy' }, path.join(root, 'derived'), ['claude']), /boolean/);
}));

test('schema v1 manifest와 기존 junction 설치본을 일반 파일로 이관한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['1'], 'existing', options);
    const file = path.join(root, '.ai-core/install-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.schemaVersion = 1;
    delete manifest.policies;
    delete manifest.engines;
    for (const skill of manifest.skills) delete skill.path;
    fs.writeFileSync(file, JSON.stringify(manifest));
    fs.unlinkSync(path.join(root, 'ai-init.json'));
    const installed = path.join(root, '.agents/skills/jobkim-project-context');
    const cached = path.join(root, '.ai-core/sources/legacy-installed-context');
    fs.cpSync(installed, cached, { recursive: true });
    assert.equal(path.dirname(installed), path.join(root, '.agents', 'skills'));
    fs.rmSync(installed, { recursive: true });
    fs.symlinkSync(cached, installed, process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(readConfiguration(root).engines, ['codex']);
    await cli(root, ['init', '--add-engine', 'claude', '--json']);
    assert.equal(readManifest(root).schemaVersion, 2);
    assert.equal(fs.lstatSync(installed).isSymbolicLink(), false);
    assert.deepEqual(readConfiguration(root).engines, ['codex', 'claude']);
}));

test('대화형 메뉴는 Gemini·Antigravity를 묶고 기존 선택을 Enter로 유지한다', () => temporary(async (root) => {
    const first = await cli(root, ['--profile', 'bundled'], '2\n4\n');
    assert.match(first.output, /2\) Gemini CLI \/ Antigravity/);
    assert.match(first.output, /3\) Claude Code/);
    assert.match(first.output, /4\) 전체 선택/);
    const again = await cli(root, [], '\n');
    assert.match(again.output, /현재 선택:/);
    assert.doesNotMatch(again.output, /프로젝트 유형\n/);
    assert.deepEqual(readConfiguration(root).engines, ['codex', 'gemini', 'antigravity', 'claude']);
}));

test('저장 구성을 재사용하며 CLI에서 명시한 프로필·선택은 우선 적용한다', () => temporary(async (root) => {
    await cli(root, ['init', '--type', 'new', '--engine', '3', '--profile', 'bundled', '--json']);
    const again = await cli(root, ['init', '--json']);
    assert.equal(JSON.parse(again.output).ready, true);
    assert.deepEqual(readConfiguration(root).engines, ['claude']);
    const replacement = await cli(root, ['init', '--engine', '2', '--json']);
    assert.deepEqual(JSON.parse(replacement.output).engines, ['gemini', 'antigravity']);
    assert.equal(readConfiguration(root).profile, 'bundled');
}));

test('손상된 manifest나 경로 이탈은 파일 변경 전에 거부한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['3'], 'new', options);
    const manifest = readManifest(root);
    manifest.skills[0].path = '../outside';
    write(root, '.ai-core/install-manifest.json', JSON.stringify(manifest));
    const before = snapshotFiles(root);
    await assert.rejects(synchronizeSkills(root, ['3'], 'new', options), /스킬 경로/);
    assert.deepEqual(snapshotFiles(root), before);
}));

test('계획 후 대상 변경을 감지하고 적용하지 않는다', () => temporary(async (root) => {
    const original = path.join(root, 'original'), staged = path.join(root, 'staged');
    write(original, 'CLAUDE.md', 'before');
    write(staged, 'CLAUDE.md', 'after');
    const plan = createInstallationPlan(original, staged, ['CLAUDE.md']);
    write(original, 'CLAUDE.md', 'concurrent user change');
    await assert.rejects(applyInstallationPlan(original, staged, plan), /미리보기 후 파일이 변경/);
    assert.equal(read(original, 'CLAUDE.md'), 'concurrent user change');
}));

test('실제 파일 적용 중 실패하면 Claude·구성·설치 정보를 복구한다', () => temporary(async (root) => {
    const original = path.join(root, 'original'), staged = path.join(root, 'staged');
    for (const base of [original, staged]) {
        write(base, 'CLAUDE.md', base === original ? 'old policy' : 'new policy');
        write(base, 'ai-init.json', base === original ? 'old config' : 'new config');
    }
    const before = snapshotFiles(original);
    const plan = createInstallationPlan(original, staged, ['CLAUDE.md', 'ai-init.json']);
    const copy = fs.copyFileSync;
    let failed = false;
    fs.copyFileSync = (source, destination, ...rest) => {
        if (!failed && source === path.join(staged, 'ai-init.json')) { failed = true; throw new Error('fixture apply failure'); }
        return copy(source, destination, ...rest);
    };
    try { await assert.rejects(applyInstallationPlan(original, staged, plan), /fixture apply failure/); }
    finally { fs.copyFileSync = copy; }
    assert.equal(failed, true);
    assert.deepEqual(snapshotFiles(original), before);
}));

test('무결성 기록이 없는 구버전 관리 스킬은 자동 덮어쓰지 않는다', () => temporary(async (root) => {
    write(root, '.agents/skills/jobkim-project-context/SKILL.md', '# legacy user edits');
    write(root, '.agents/skills/jobkim-project-context/.ai-init-source.json', JSON.stringify({ managedBy: 'my-ai-agent-cli', sourceId: 'jobkim' }));
    const before = snapshotFiles(root);
    const preview = await synchronizeSkills(root, ['1', '3'], 'existing', { ...options, dryRun: true });
    assert.equal(preview.ready, false);
    assert.match(preview.conflicts[0].message, /무결성 기록/);
    assert.deepEqual(snapshotFiles(root), before);
}));

test('일반 설치는 원본 캐시에 관리 표식이나 제품별 변환을 쓰지 않는다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['4'], 'new', options);
    const source = path.join(root, '.ai-core/sources/jobkim/jobkim-project-context');
    assert.equal(fs.existsSync(path.join(source, '.ai-init-source.json')), false);
    assert.equal(fs.existsSync(path.join(source, 'agents/openai.yaml')), false);
    assert.equal(fs.existsSync(path.join(root, '.ai-core/sources/.derived')), false);
    const ignore = read(root, '.gitignore').split('\n');
    assert.ok(!ignore.includes('/.agents/skills/'));
    assert.ok(!ignore.includes('/.claude/'));
    assert.ok(ignore.includes('/.claude/skills/jobkim-project-context/'));
}));

test('첫 설치 적용 중 실패하면 새 디렉터리까지 복구한다', () => temporary(async (root) => {
    write(root, 'README.md', 'user project');
    const before = snapshotFiles(root);
    const copy = fs.copyFileSync;
    let failed = false;
    fs.copyFileSync = (source, destination, ...rest) => {
        if (!failed && destination === path.join(root, 'ai-init.json')) { failed = true; throw new Error('fixture first-install failure'); }
        return copy(source, destination, ...rest);
    };
    try { await assert.rejects(synchronizeSkills(root, ['4'], 'existing', options), /fixture first-install failure/); }
    finally { fs.copyFileSync = copy; }
    assert.equal(failed, true);
    assert.deepEqual(snapshotFiles(root), before);
    assert.deepEqual(fs.readdirSync(root), ['README.md']);
}));

test('다운로드 준비 중 변경된 사용자 지침은 적용 직전 발견하고 보존한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['1'], 'existing', options);
    write(root, 'CLAUDE.md', '# before download\n');
    const info = read(root, '.ai-core/install-info.json');
    const lock = JSON.parse(read(root, 'ai-init.lock.json'));
    const fixtures = lock.sources.map((source) => {
        const files = {
            [`skills/fixture-${source.id}/SKILL.md`]: Buffer.from(`---\nname: fixture-${source.id}\ndescription: Fixture skill\n---\nbody\n`),
            ...Object.fromEntries(source.legalFiles.map((name) => [name, Buffer.from('fixture license')])),
        };
        return { ...source, files };
    });
    let changed = false;
    const request = async (url) => {
        if (!changed) { changed = true; write(root, 'CLAUDE.md', '# concurrent user instructions\n'); }
        const fixture = fixtures.find((entry) => url.includes(`/${entry.owner}/${entry.repo}/`));
        assert.ok(fixture, url);
        if (url.includes('/git/trees/')) return { sha: fixture.tree, tree: Object.entries(fixture.files).map(([file, content]) => ({ path: file, type: 'blob', mode: '100644', sha: crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content])).digest('hex') })) };
        return fixture.files[url.split(`/${fixture.commit}/`)[1]];
    };
    await assert.rejects(synchronizeSkills(root, ['1', '3'], 'existing', { profile: 'full', log: () => {}, request }), /미리보기 후 파일이 변경/);
    assert.equal(read(root, 'CLAUDE.md'), '# concurrent user instructions\n');
    assert.equal(read(root, '.ai-core/install-info.json'), info);
    assert.equal(fs.existsSync(path.join(root, '.claude')), false);
}));

test('Claude boolean aliases retain Codex user-only policy', () => temporary((root) => {
    const directory = path.dirname(write(root, 'deploy/SKILL.md', '---\nname: deploy\ndescription: Deploy on request\ndisable-model-invocation: YES\nuser-invocable: false\n---\nbody\n'));
    const prepared = prepareSkill({ directory, sourceId: 'fixture', name: 'deploy' }, path.join(root, 'derived'), ['codex']);
    assert.equal(require('yaml').parse(read(prepared.directory, 'agents/openai.yaml')).policy.allow_implicit_invocation, false);
}));

test('설치 폴더나 지침 파일 전체가 삭제된 경우 재설치로 복원한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['3'], 'existing', options);
    const installed = path.resolve(root, '.claude/skills/jobkim-project-context');
    assert.equal(path.dirname(installed), path.join(root, '.claude', 'skills'));
    fs.rmSync(installed, { recursive: true });
    fs.unlinkSync(path.join(root, 'CLAUDE.md'));
    assert.equal(status(root, require('../package.json'), []).healthy, false);
    await synchronizeSkills(root, ['3'], 'existing', options);
    assert.equal(fs.existsSync(path.join(installed, 'SKILL.md')), true);
    assert.match(read(root, 'CLAUDE.md'), /@\.agents\/rules\/project\.md/);
    assert.equal(status(root, require('../package.json'), []).healthy, true);
}));

test('선택하지 않은 제품의 사용자 인덱스는 보존하고 소유권 충돌 시 교체하지 않는다', () => temporary(async (root) => {
    const relative = '.agents/skills/.ai-init-managed.json';
    const index = JSON.stringify({ managedBy: 'another-installer', skills: ['user-skill'] });
    write(root, relative, index);
    await synchronizeSkills(root, ['3'], 'new', options);
    assert.equal(read(root, relative), index);
    assert.ok(!read(root, '.gitignore').split('\n').includes(`/${relative}`));
    const before = snapshotFiles(root);
    const preview = await synchronizeSkills(root, ['1', '3'], 'new', { ...options, dryRun: true });
    assert.equal(preview.ready, false);
    assert.ok(preview.conflicts.some((entry) => entry.path === relative));
    assert.deepEqual(snapshotFiles(root), before);
}));
