const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { synchronizeSkills } = require('../setup');
const sources = require('../skill-sources.json');
const packageInfo = require('../package.json');

test('성공한 설치의 버전과 선택을 기록하고 실패 시 마지막 성공 기록을 보존한다', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-version-'));
    // 이 테스트 프로세스에서만 외부 다운로드를 제외한다. 번들·정책 설치는 실제 경로를 실행한다.
    const originalSources = sources.splice(0);
    const infoPath = path.join(root, '.ai-core', 'install-info.json');
    try {
        fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- ai-init:jobkim:start -->');
        await assert.rejects(synchronizeSkills(root, ['1'], 'new'), /관리 블록 마커/);
        assert.equal(fs.existsSync(infoPath), false);
        fs.writeFileSync(path.join(root, 'AGENTS.md'), '# user rules\n');
        for (const projectType of ['new', 'existing']) {
            for (const engines of [['1'], ['2'], ['1', '2']]) {
                const before = Date.now();
                await synchronizeSkills(root, engines, projectType);
                const managed = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'skills', '.ai-init-managed.json'), 'utf8'));
                for (const name of ['jobkim-project-context', 'jobkim-project-intake']) {
                    assert.ok(managed.skills.includes(name), `재설치 후 관리 목록에서 누락: ${name}`);
                    const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'skills', name, '.ai-init-source.json'), 'utf8'));
                    assert.equal(marker.managedBy, 'my-ai-agent-cli');
                    assert.equal(marker.sourceId, 'jobkim');
                }
                const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                assert.equal(info.package, packageInfo.name);
                assert.equal(info.version, packageInfo.version);
                assert.equal(info.projectType, projectType);
                assert.deepEqual(info.engines, engines.map((engine) => engine === '1' ? 'Codex' : 'Gemini/Antigravity'));
                assert.ok(Date.parse(info.appliedAt) >= before && Date.parse(info.appliedAt) <= Date.now());
                assert.match(info.appliedAt, /Z$/);
                const installed = path.join(root, '.agents', 'skills', 'jobkim-project-context');
                assert.equal(fs.readFileSync(path.join(installed, 'SKILL.md'), 'utf8'),
                    fs.readFileSync(path.join(__dirname, '..', 'bundled-skills', 'jobkim-project-context', 'SKILL.md'), 'utf8'));
                assert.ok(fs.existsSync(path.join(installed, '_UPSTREAM_LICENSE')));
                // 다음 재설치에서 이전 캐시 내용이 실제 번들로 갱신되는지도 확인한다.
                fs.writeFileSync(path.join(installed, 'SKILL.md'), '# stale cache');
            }
        }
        assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /\.ai-core\/install-info\.json/);
        const lastSuccess = fs.readFileSync(infoPath, 'utf8');
        fs.writeFileSync(path.join(root, 'GEMINI.md'), '<!-- ai-init:jobkim:start -->');
        await assert.rejects(synchronizeSkills(root, ['2'], 'existing'), /관리 블록 마커/);
        assert.equal(fs.readFileSync(infoPath, 'utf8'), lastSuccess);
        assert.equal(fs.readdirSync(path.dirname(infoPath)).some((file) => file.endsWith('.tmp')), false);
    } finally {
        sources.push(...originalSources);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('반복 동기화에서도 표식 없는 사용자 스킬은 보존한다', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-user-skill-'));
    const originalSources = sources.splice(0);
    try {
        const userSkill = path.join(root, '.agents', 'skills', 'jobkim-project-context');
        fs.mkdirSync(userSkill, { recursive: true });
        fs.writeFileSync(path.join(userSkill, 'SKILL.md'), '# 사용자 원본');
        for (let run = 0; run < 2; run += 1) {
            await synchronizeSkills(root, ['1'], 'new');
            assert.equal(fs.readFileSync(path.join(userSkill, 'SKILL.md'), 'utf8'), '# 사용자 원본');
            assert.equal(fs.existsSync(path.join(userSkill, '.ai-init-source.json')), false);
            const managed = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'skills', '.ai-init-managed.json'), 'utf8'));
            assert.deepEqual(managed.skills, ['jobkim-project-intake']);
        }
    } finally {
        sources.push(...originalSources);
        fs.rmSync(root, { recursive: true, force: true });
    }
});
