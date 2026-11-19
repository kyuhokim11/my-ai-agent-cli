const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { snapshotFiles, verifyCachedSource, validateLock } = require('./source-lock');
const { validateSkill, frontmatter } = require('./skills');
const { instructionChain, expandEngines } = require('./engines');

function buildManifest(root, installed, policyFiles, lock, profile) {
    const files = {};
    const skills = installed.map((skill) => {
        const relative = `.agents/skills/${skill.name}`;
        for (const [file, hash] of Object.entries(snapshotFiles(path.join(root, relative)))) files[`${relative}/${file}`] = hash;
        const validation = validateSkill(path.join(root, relative), skill.name);
        return { name: skill.name, sourceId: skill.sourceId, explicitOnly: validation.explicitOnly, warnings: validation.warnings };
    });
    for (const file of policyFiles) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        files[relative] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    return { schemaVersion: 1, profile, files, skills, sourcePins: lock.sources.map(({ id, commit, tree }) => ({ id, commit, tree })) };
}

function status(root, packageInfo, sources) {
    const issues = [];
    const read = (relative) => {
        try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') issues.push({ severity: 'error', path: relative, message: error.message }); return null; }
    };
    const info = read('.ai-core/install-info.json');
    const manifest = read('.ai-core/install-manifest.json');
    const lock = read('ai-init.lock.json');
    if (!info) issues.push({ severity: 'error', message: '설치 정보가 없습니다.' });
    if (!manifest) issues.push({ severity: 'warning', message: '파일 무결성 목록이 없습니다. 이전 버전 설치라면 재설치 후 생성됩니다.' });
    if (manifest && (manifest.schemaVersion !== 1 || !manifest.files || typeof manifest.files !== 'object' || !Array.isArray(manifest.skills))) {
        issues.push({ severity: 'error', message: '지원하지 않거나 손상된 설치 manifest입니다.' });
    } else if (manifest) {
        const actualRoot = fs.realpathSync(root);
        for (const [relative, expected] of Object.entries(manifest.files)) {
            try {
                const file = path.resolve(root, relative);
                const relation = path.relative(root, file);
                if (!relation || relation.startsWith('..') || path.isAbsolute(relation) || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('안전하지 않은 manifest 경로/해시입니다.');
                const real = fs.realpathSync(file);
                const actualRelation = path.relative(actualRoot, real);
                if (actualRelation.startsWith('..') || path.isAbsolute(actualRelation)) throw new Error('관리 파일 링크가 프로젝트 밖을 가리킵니다.');
                const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
                if (hash !== expected) issues.push({ severity: 'warning', path: relative, message: '설치 후 내용이 변경됐습니다.' });
            } catch (error) { issues.push({ severity: 'error', path: relative, message: error.message }); }
        }
        for (const skill of manifest.skills) {
            try {
                if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name || '')) throw new Error('manifest의 스킬 이름이 올바르지 않습니다.');
                const result = validateSkill(path.join(root, '.agents', 'skills', skill.name));
                for (const message of result.warnings) issues.push({ severity: 'warning', path: skill.name, message });
                if (result.explicitOnly && info?.engines?.some((engine) => /Gemini|Antigravity/.test(engine))) issues.push({ severity: 'warning', path: skill.name, message: '사용자 호출 전용 정책은 Gemini/Antigravity에서 native enforcement를 보장하지 않습니다.' });
            } catch (error) { issues.push({ severity: 'error', path: skill.name, message: error.message }); }
        }
    }
    if (lock) {
        try {
            validateLock(lock, sources);
            for (const pin of manifest?.sourcePins || []) {
                const locked = lock.sources.find((entry) => entry.id === pin.id);
                if (!locked || locked.commit !== pin.commit || locked.tree !== pin.tree) throw new Error(`${pin.id}: 현재 잠금과 설치된 소스가 다릅니다.`);
                verifyCachedSource(path.join(root, '.ai-core', 'sources', pin.id), locked);
            }
        } catch (error) { issues.push({ severity: 'error', message: error.message }); }
    } else if (info) issues.push({ severity: 'warning', message: 'ai-init.lock.json이 없습니다.' });
    for (const name of ['jobkim.md', 'project.md', 'local.md']) {
        const file = path.join(root, '.agents', 'rules', name);
        if (!fs.existsSync(file)) continue;
        try {
            const { data } = frontmatter(fs.readFileSync(file, 'utf8'), file);
            if (!['always_on', 'model_decision', 'glob', 'manual'].includes(data.trigger)) throw new Error('Antigravity trigger가 없습니다/올바르지 않습니다.');
        } catch (error) { issues.push({ severity: 'warning', path: `.agents/rules/${name}`, message: error.message }); }
    }
    if (Number(process.versions.node.split('.')[0]) < 22) issues.push({ severity: 'warning', message: '보안 지원 중인 Node.js 22/24/26 LTS를 권장합니다. 최소 실행 버전은 이번 변경에서 유지합니다.' });
    return { schemaVersion: 1, installed: Boolean(info), package: packageInfo.name, cliVersion: packageInfo.version, installation: info, instructionChain: instructionChain(root), profile: manifest?.profile || null, skills: manifest?.skills || [], issues, healthy: !issues.some((item) => item.severity === 'error') };
}

function installationDiff(before, after) {
    const oldFiles = before?.files || {};
    const nextFiles = after.files;
    const result = [];
    for (const file of [...new Set([...Object.keys(oldFiles), ...Object.keys(nextFiles)])].sort()) {
        if (!(file in nextFiles)) result.push({ path: file, action: 'remove' });
        else if (!(file in oldFiles)) result.push({ path: file, action: 'add' });
        else if (oldFiles[file] !== nextFiles[file]) result.push({ path: file, action: 'change' });
    }
    return result;
}
function previewDiff(root, staged, nextManifest) {
    const candidates = new Set(['AGENTS.md', 'AGENTS.override.md', 'GEMINI.md', '.agents/rules/jobkim.md']);
    for (const file of Object.keys(nextManifest.files)) candidates.add(file);
    try {
        const previous = JSON.parse(fs.readFileSync(path.join(root, '.ai-core', 'install-manifest.json'), 'utf8'));
        for (const file of Object.keys(previous.files || {})) candidates.add(file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try {
        const index = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'skills', '.ai-init-managed.json'), 'utf8'));
        if (!Array.isArray(index.skills)) throw new Error('올바르지 않은 관리 스킬 목록');
        for (const name of index.skills) {
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error('안전하지 않은 관리 스킬 이름');
            const directory = path.join(root, '.agents', 'skills', name);
            if (!fs.existsSync(directory)) continue;
            const relative = path.relative(fs.realpathSync(root), fs.realpathSync(directory));
            if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('미리보기 관리 스킬 링크가 루트 밖입니다.');
            const marker = JSON.parse(fs.readFileSync(path.join(directory, '.ai-init-source.json'), 'utf8'));
            if (marker.managedBy !== 'my-ai-agent-cli') continue;
            for (const file of Object.keys(snapshotFiles(directory))) candidates.add(`.agents/skills/${name}/${file}`);
        }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const digest = (directory, relative) => {
        const file = path.resolve(directory, relative);
        if (!file.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('미리보기 경로가 루트 밖입니다.');
        try {
            const actual = fs.realpathSync(file);
            const inside = [root, staged].some((base) => {
                const relation = path.relative(fs.realpathSync(base), actual);
                return relation !== '..' && !relation.startsWith(`..${path.sep}`) && !path.isAbsolute(relation);
            });
            if (!inside) throw new Error('미리보기 파일 링크가 루트 밖입니다.');
            return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    const before = { files: {} }, after = { files: {} };
    for (const relative of candidates) {
        const previous = digest(root, relative), next = digest(staged, relative);
        if (previous !== null) before.files[relative] = previous;
        if (next !== null) after.files[relative] = next;
    }
    return installationDiff(before, after);
}
module.exports = { buildManifest, status, installationDiff, previewDiff };
