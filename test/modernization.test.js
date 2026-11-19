const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Writable } = require('node:stream');
const test = require('node:test');
const YAML = require('yaml');
const { validateSkill, antigravityRule, frontmatter } = require('../lib/skills');
const { policyPaths, instructionChain, expandEngines } = require('../lib/engines');
const { resolveLock, validateLock, verifyCachedSource, snapshotFiles } = require('../lib/source-lock');
const { classifyRelease } = require('../lib/release-status');
const { parseArguments } = require('../lib/cli');
const { evaluate } = require('../lib/evaluation');
const { status } = require('../lib/diagnostics');
const { synchronizeSkills, prepareSkill, downloadSource, syncSource, runCli, installProjectPolicy, request } = require('../setup');

async function temporary(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-upgrade-'));
    try { return await run(root); }
    finally { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); }
}
function skill(root, name = 'review', extra = '') {
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: >-\n  Review the requested change.\n${extra}---\n# Review\n`);
    return directory;
}

test('정식 YAML 파싱, 필수 필드와 참조 탈출 검증', () => temporary((root) => {
    const directory = skill(root);
    assert.equal(validateSkill(directory).description, 'Review the requested change.');
    fs.appendFileSync(path.join(directory, 'SKILL.md'), '\n[escape](../secret.md)');
    assert.throws(() => validateSkill(directory), /폴더 밖/);
    fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: review\nname: other\ndescription: test\n---\n');
    assert.throws(() => validateSkill(directory), /YAML/);
}));

test('Antigravity frontmatter 보정은 사용자 본문과 기존 trigger를 보존한다', () => {
    const text = '사용자 규칙\n<!-- ai-init:jobkim:start -->\n본문\n';
    const repaired = antigravityRule(text);
    assert.equal(frontmatter(repaired).body, text);
    assert.equal(frontmatter(repaired).data.trigger, 'always_on');
    const manual = antigravityRule('---\ntrigger: manual\ncustom: retained\n---\n사용자 본문\n');
    assert.equal(frontmatter(manual).data.trigger, 'manual');
    assert.equal(frontmatter(manual).data.custom, 'retained');
    assert.throws(() => antigravityRule('---\ntrigger: alwaysOn\n---\n'), /trigger/);
    assert.throws(() => antigravityRule('---\ntrigger: glob\n---\n'), /globs/);
    assert.equal(frontmatter(antigravityRule('\uFEFF---\ntrigger: manual\n---\nbody')).data.trigger, 'manual');
});

test('제품별 경로와 Codex override 적용 계층', () => temporary((root) => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'base');
    fs.writeFileSync(path.join(root, 'AGENTS.override.md'), 'override');
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'AGENTS.md'), 'nested');
    assert.deepEqual(instructionChain(root, path.join(root, 'src')), ['AGENTS.override.md', 'src/AGENTS.md']);
    assert.deepEqual(policyPaths(root, ['codex']), ['AGENTS.override.md']);
    assert.deepEqual(policyPaths(root, ['gemini']), ['GEMINI.md']);
    assert.deepEqual(expandEngines(['1', '2', 'antigravity']), ['codex', 'gemini', 'antigravity']);
    installProjectPolicy(root, 'existing', ['codex'], {});
    assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'base');
}));

test('사용자 호출 전용 정책과 이름 prefix를 파생본에만 반영한다', () => temporary((root) => {
    const directory = skill(root, 'deploy', 'disable-model-invocation: true\n');
    const before = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8');
    const prepared = prepareSkill({ directory, name: 'team-deploy', sourceId: 'test' }, path.join(root, 'cache'));
    assert.equal(fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8'), before);
    assert.equal(validateSkill(prepared.directory).name, 'team-deploy');
    assert.equal(YAML.parse(fs.readFileSync(path.join(prepared.directory, 'agents', 'openai.yaml'), 'utf8')).policy.allow_implicit_invocation, false);
}));

test('외부 소스는 commit과 tree를 고정하고 라이선스도 blob 검증한다', () => temporary(async (root) => {
    const source = { id: 'demo', owner: 'example', repo: 'skills', ref: 'main', skillsPath: 'skills', legalFiles: ['LICENSE'] };
    const commit = 'a'.repeat(40), tree = 'b'.repeat(40);
    const contents = { 'skills/review/SKILL.md': Buffer.from('---\nname: review\ndescription: Review changes\n---\n'), LICENSE: Buffer.from('MIT license fixture') };
    const entries = Object.entries(contents).map(([file, bytes]) => ({ path: file, type: 'blob', mode: '100644', sha: crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex') }));
    const urls = [];
    const fetch = async (url) => {
        urls.push(url);
        if (url.includes('/commits/')) return { sha: commit, commit: { tree: { sha: tree } } };
        if (url.includes('/git/trees/')) { assert.ok(url.includes(tree)); return { sha: tree, tree: entries }; }
        assert.ok(url.includes(`/${commit}/`));
        return contents[url.split(`/${commit}/`)[1]];
    };
    const lock = await resolveLock([source], fetch);
    await downloadSource(source, root, lock.sources[0], fetch);
    assert.equal(verifyCachedSource(root, lock.sources[0]).resolvedCommitSha, commit);
    fs.writeFileSync(path.join(root, 'extra.js'), 'unexpected');
    assert.throws(() => verifyCachedSource(root, lock.sources[0]), /기록되지 않은/);
    fs.rmSync(path.join(root, 'extra.js'));
    fs.writeFileSync(path.join(root, 'review', 'SKILL.md'), 'tampered');
    assert.throws(() => verifyCachedSource(root, lock.sources[0]), /변경/);
    assert.throws(() => validateLock(lock, [{ ...source, ref: 'other' }]), /잠금/);
}));

test('안전하지 않은 다운로드 주소는 네트워크 요청 전에 거부한다', async () => {
    await assert.rejects(request('http://api.github.com/test'), /허용되지/);
    await assert.rejects(request('https://localhost/test'), /허용되지/);
});

test('오프라인에서는 같은 잠금의 온전한 캐시만 재사용한다', () => temporary(async (root) => {
    const sourcesRoot = path.join(root, 'sources');
    const cache = path.join(sourcesRoot, 'demo');
    const directory = skill(cache);
    const source = { id: 'demo', owner: 'example', repo: 'skills', ref: 'main', skillsPath: 'skills', legalFiles: [] };
    const locked = { ...source, commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
    fs.writeFileSync(path.join(cache, '_SOURCE.json'), JSON.stringify({ resolvedCommitSha: locked.commit, resolvedTreeSha: locked.tree, files: snapshotFiles(cache) }));
    const options = { request: async () => { throw new Error('offline'); }, log: () => {} };
    assert.equal((await syncSource(source, sourcesRoot, locked, options))[0].name, 'review');
    fs.appendFileSync(path.join(directory, 'SKILL.md'), 'changed');
    await assert.rejects(syncSource(source, sourcesRoot, locked, options), /변경/);
}));

test('번들 프로필 미리보기는 대상 폴더를 변경하지 않는다', () => temporary(async (root) => {
    fs.writeFileSync(path.join(root, 'README.md'), 'user');
    const before = fs.readdirSync(root);
    const result = await synchronizeSkills(root, ['codex', 'antigravity'], 'existing', { profile: 'bundled', dryRun: true, log: () => {} });
    assert.equal(result.dryRun, true);
    assert.equal(result.skillCount, 2);
    assert.ok(result.changes.some((item) => item.path === 'AGENTS.md' && item.action === 'add'));
    assert.deepEqual(fs.readdirSync(root), before);
}));

test('정책 갱신 실패는 스킬·사용자 파일·설치 정보를 원상 복구한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['1'], 'new', { profile: 'bundled', log: () => {} });
    const info = fs.readFileSync(path.join(root, '.ai-core', 'install-info.json'), 'utf8');
    const target = path.join(root, '.agents', 'skills', 'jobkim-project-intake', 'SKILL.md');
    fs.writeFileSync(target, 'previous modified bytes');
    fs.writeFileSync(path.join(root, 'GEMINI.md'), '<!-- ai-init:jobkim:start -->');
    await assert.rejects(synchronizeSkills(root, ['2'], 'existing', { profile: 'bundled', log: () => {} }), /관리 블록/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'previous modified bytes');
    assert.equal(fs.readFileSync(path.join(root, '.ai-core', 'install-info.json'), 'utf8'), info);
    assert.equal(fs.readFileSync(path.join(root, 'GEMINI.md'), 'utf8'), '<!-- ai-init:jobkim:start -->');
}));

test('status는 설치 후 변경과 잘못된 사용자 규칙을 구분해 보고한다', () => temporary(async (root) => {
    await synchronizeSkills(root, ['1'], 'new', { profile: 'bundled', log: () => {} });
    const info = status(root, require('../package.json'), require('../skill-sources.json'));
    assert.equal(info.healthy, true);
    fs.appendFileSync(path.join(root, 'AGENTS.md'), '\nuser change');
    fs.writeFileSync(path.join(root, '.agents', 'rules', 'local.md'), '# legacy');
    const changed = status(root, require('../package.json'), []);
    assert.ok(changed.issues.some((issue) => issue.path === 'AGENTS.md' && /변경/.test(issue.message)));
    assert.ok(changed.issues.some((issue) => issue.path === '.agents/rules/local.md'));
}));

test('JSON CLI 출력은 로그와 섞이지 않고 비대화형 설치된다', () => temporary(async (root) => {
    let text = '';
    const output = new Writable({ write(chunk, encoding, callback) { text += chunk; callback(); } });
    await runCli({ projectRoot: root, output, args: ['init', '--type', 'new', '--engine', 'codex', '--profile', 'bundled', '--json'] });
    assert.equal(JSON.parse(text).skillCount, 2);
    assert.throws(() => parseArguments(['--update']), /lock/);
    assert.throws(() => parseArguments(['--profile', 'unknown']), /profile/);
}));

test('frozen 설치는 프로젝트 잠금이 없으면 파일을 만들지 않는다', () => temporary(async (root) => {
    await assert.rejects(synchronizeSkills(root, ['1'], 'new', { profile: 'bundled', frozen: true, log: () => {} }), /frozen/);
    assert.deepEqual(fs.readdirSync(root), []);
}));

test('게시 상태는 조회 불가와 공개/latest를 구분하고 원인을 단정하지 않는다', () => {
    assert.equal(classifyRelease({}, '1.5.0').state, 'not-visible');
    assert.equal(classifyRelease({ versions: { '1.5.0': {} }, 'dist-tags': { latest: '1.4.0' } }, '1.5.0').state, 'available');
    assert.equal(classifyRelease({ versions: { '1.5.0': {} }, 'dist-tags': { latest: '1.5.0' } }, '1.5.0').state, 'available-latest');
});

test('평가기는 증거 없는 성공과 미실행을 통과로 처리하지 않는다', () => {
    const cases = [{ id: 'readonly', checks: ['workspace-unchanged', 'honesty'] }];
    assert.equal(evaluate(cases, []).state, 'incomplete');
    const run = { caseId: 'readonly', trial: 1, agent: 'fixture', model: 'fixture', policyVersion: 'fixture', evidence: 'captured trace', before: { a: 'hash' }, after: { a: 'hash' } };
    assert.equal(evaluate(cases, [run]).state, 'incomplete');
    run.reviews = { honesty: { result: 'pass', reviewer: 'human fixture', evidence: 'trace lines 1-3' } };
    assert.equal(evaluate(cases, [run]).state, 'pass');
    run.after.a = 'changed';
    assert.equal(evaluate(cases, [run]).state, 'fail');
});
