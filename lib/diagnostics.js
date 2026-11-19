const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { snapshotFiles, verifyCachedSource, validateLock } = require('./source-lock');
const { validateSkill, frontmatter } = require('./skills');
const { instructionChain } = require('./engines');
const { readManifest, skillPath, installConflicts } = require('./installation-plan');
const { readConfiguration } = require('./configuration');
const { managedBlock, hash } = require('./policies');

function buildManifest(root, installed, policyFiles, lock, profile, engines = [], policyOrigins = []) {
    const files = {};
    const skills = installed.map((skill) => {
        const relative = skill.path || `.agents/skills/${skill.name}`;
        for (const [file, hash] of Object.entries(snapshotFiles(path.join(root, relative)))) files[`${relative}/${file}`] = hash;
        const validation = validateSkill(path.join(root, relative), skill.name);
        return { name: skill.name, path: relative, engines: skill.engines || engines, sourceId: skill.sourceId, explicitOnly: validation.explicitOnly, warnings: validation.warnings, transformations: skill.transformations || [] };
    });
    for (const file of policyFiles) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        files[relative] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    const policies = policyFiles.map((file) => {
        const relative = path.relative(root, file).split(path.sep).join('/');
        return { path: relative, blockHash: hash(managedBlock(fs.readFileSync(file, 'utf8'))), created: policyOrigins.find((item) => item.path === relative)?.created || false };
    });
    return { schemaVersion: 2, profile, engines, files, skills, policies, sourcePins: lock.sources.map(({ id, commit, tree }) => ({ id, commit, tree })) };
}

function status(root, packageInfo, sources) {
    const issues = [];
    const read = (relative) => {
        try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') issues.push({ severity: 'error', path: relative, message: error.message }); return null; }
    };
    const info = read('.ai-core/install-info.json');
    let manifest = null, config = null;
    try { manifest = readManifest(root); config = readConfiguration(root); }
    catch (error) { issues.push({ severity: 'error', message: error.message }); }
    const lock = read('ai-init.lock.json');
    if (!info) issues.push({ severity: 'error', message: '설치 정보가 없습니다.' });
    if (!manifest) issues.push({ severity: 'warning', message: '파일 무결성 목록이 없습니다. 이전 버전 설치라면 재설치 후 생성됩니다.' });
    if (manifest && (![1, 2].includes(manifest.schemaVersion) || !manifest.files || typeof manifest.files !== 'object' || !Array.isArray(manifest.skills))) {
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
                const relative = skillPath(skill, manifest.schemaVersion);
                const result = validateSkill(path.join(root, relative));
                for (const message of result.warnings) issues.push({ severity: 'warning', path: skill.name, message });
                if (result.explicitOnly && (skill.engines || config?.engines || []).some((engine) => ['gemini', 'antigravity'].includes(engine))) issues.push({ severity: 'warning', path: relative, message: '사용자 호출 전용 정책은 Gemini/Antigravity에서 native enforcement를 보장하지 않습니다.' });
            } catch (error) { issues.push({ severity: 'error', path: skill.name, message: error.message }); }
        }
    }
    if (lock) {
        try {
            validateLock(lock, sources.filter((source) => manifest?.sourcePins?.some((pin) => pin.id === source.id)));
            for (const pin of manifest?.sourcePins || []) {
                const locked = lock.sources.find((entry) => entry.id === pin.id);
                if (!locked || locked.commit !== pin.commit || locked.tree !== pin.tree) throw new Error(`${pin.id}: 현재 잠금과 설치된 소스가 다릅니다.`);
                verifyCachedSource(path.join(root, '.ai-core', 'sources', pin.id), locked);
            }
        } catch (error) { issues.push({ severity: 'error', message: error.message }); }
    } else if (info) issues.push({ severity: 'warning', message: 'ai-init.lock.json이 없습니다.' });
    for (const conflict of installConflicts(root, manifest)) issues.push({ severity: 'error', ...conflict });
    for (const name of config?.engines.includes('antigravity') ? ['jobkim.md', 'project.md', 'local.md'] : []) {
        const file = path.join(root, '.agents', 'rules', name);
        if (!fs.existsSync(file)) continue;
        try {
            const { data } = frontmatter(fs.readFileSync(file, 'utf8'), file);
            if (!['always_on', 'model_decision', 'glob', 'manual'].includes(data.trigger)) throw new Error('Antigravity trigger가 없습니다/올바르지 않습니다.');
        } catch (error) { issues.push({ severity: 'warning', path: `.agents/rules/${name}`, message: error.message }); }
    }
    if (config?.engines.includes('claude')) {
        if (fs.existsSync(path.join(root, 'CLAUDE.md')) && fs.existsSync(path.join(root, '.claude', 'CLAUDE.md'))) issues.push({ severity: 'warning', message: 'CLAUDE.md와 .claude/CLAUDE.md가 함께 있습니다. /context all에서 중복 지침을 확인하세요.' });
        if (fs.existsSync(path.join(root, 'AGENTS.override.md'))) issues.push({ severity: 'warning', message: 'Claude는 Codex의 AGENTS.override.md를 자동 로딩하지 않습니다. 필요한 공통 사용자 지침을 project.md에 두세요.' });
        issues.push({ severity: 'info', message: 'Claude 파일 설치 상태입니다. 실제 하네스의 지침·스킬 인식은 새 세션의 /context all과 스킬 호출로 확인하세요. 권한·hooks·MCP·플러그인 설정은 변경하지 않았습니다.' });
    }
    if (config && manifest?.engines && JSON.stringify([...config.engines].sort()) !== JSON.stringify([...manifest.engines].sort())) issues.push({ severity: 'warning', path: 'ai-init.json', message: '저장 구성과 마지막 설치 엔진이 다릅니다. init을 실행해 적용하세요.' });
    if (Number(process.versions.node.split('.')[0]) < 22) issues.push({ severity: 'warning', message: '보안 지원 중인 Node.js 22/24/26 LTS를 권장합니다. 최소 실행 버전은 이번 변경에서 유지합니다.' });
    return { schemaVersion: 2, installed: Boolean(info), package: packageInfo.name, cliVersion: packageInfo.version, installation: info, configuration: config, instructionChain: instructionChain(root), policyFiles: manifest?.policies?.map((entry) => entry.path) || [], profile: manifest?.profile || null, skills: manifest?.skills || [], runtimeVerified: false, issues, healthy: !issues.some((item) => item.severity === 'error') };
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
module.exports = { buildManifest, status, installationDiff };
