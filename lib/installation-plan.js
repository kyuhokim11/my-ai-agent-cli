const fs = require('node:fs');
const path = require('node:path');
const { snapshotFiles } = require('./source-lock');
const { readJson } = require('./configuration');
const { POLICY_PATHS, managedBlock, hash } = require('./policies');

const SKILL_ROOTS = ['.agents/skills', '.claude/skills'];
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MARKER = '.ai-init-source.json';
const OWNER = 'my-ai-agent-cli';

function safePath(root, relative) {
    if (typeof relative !== 'string' || relative.includes('\\') || relative.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error(`안전하지 않은 설치 경로: ${relative}`);
    const file = path.resolve(root, relative);
    const relation = path.relative(path.resolve(root), file);
    if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error('설치 경로가 프로젝트 밖입니다.');
    return file;
}

function skillPath(skill, schemaVersion = 2) {
    const relative = schemaVersion === 1 ? `.agents/skills/${skill.name}` : skill.path;
    if (!NAME.test(skill.name || '') || !SKILL_ROOTS.some((root) => relative === `${root}/${skill.name}`)) throw new Error('manifest의 스킬 경로가 올바르지 않습니다.');
    return relative;
}

function readManifest(root) {
    const value = readJson(root, '.ai-core/install-manifest.json');
    if (!value) return null;
    if (![1, 2].includes(value.schemaVersion) || !value.files || typeof value.files !== 'object' || Array.isArray(value.files) || !Array.isArray(value.skills)) throw new Error('지원하지 않거나 손상된 설치 manifest입니다.');
    for (const skill of value.skills) skillPath(skill, value.schemaVersion);
    for (const [relative, digest] of Object.entries(value.files)) {
        safePath(root, relative);
        if (!DIGEST.test(digest)) throw new Error('manifest 파일 해시가 올바르지 않습니다.');
        if (!POLICY_PATHS.includes(relative) && !value.skills.some((skill) => relative.startsWith(`${skillPath(skill, value.schemaVersion)}/`))) throw new Error(`manifest의 관리 범위 밖 경로: ${relative}`);
    }
    if (value.schemaVersion === 2) {
        if (!Array.isArray(value.policies) || !Array.isArray(value.engines)) throw new Error('manifest의 정책·엔진 정보가 없습니다.');
        for (const record of value.policies) if (!POLICY_PATHS.includes(record.path) || !DIGEST.test(record.blockHash) || typeof record.created !== 'boolean') throw new Error('manifest의 관리 정책 정보가 올바르지 않습니다.');
    }
    const paths = value.skills.map((skill) => skillPath(skill, value.schemaVersion));
    if (new Set(paths).size !== paths.length) throw new Error('manifest에 중복 스킬 경로가 있습니다.');
    return value;
}

function exists(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

function managedSkill(root, relative, sourceId) {
    const file = safePath(root, relative);
    if (!exists(file)) return false;
    const actual = fs.realpathSync(file);
    const relation = path.relative(fs.realpathSync(root), actual);
    if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error(`관리 스킬 링크가 프로젝트 밖입니다: ${relative}`);
    const marker = readJson(root, `${relative}/${MARKER}`);
    return marker?.managedBy === OWNER && (!sourceId || marker.sourceId === sourceId);
}

function installConflicts(root, previous) {
    const conflicts = [];
    if (!previous) return conflicts;
    for (const skill of previous.skills) {
        const relative = skillPath(skill, previous.schemaVersion);
        try {
            if (!managedSkill(root, relative, skill.sourceId)) throw new Error('관리 스킬이 없거나 소유권이 변경됐습니다.');
            const expected = Object.fromEntries(Object.entries(previous.files).filter(([file]) => file.startsWith(`${relative}/`)).map(([file, digest]) => [file.slice(relative.length + 1), digest]));
            const actual = snapshotFiles(path.join(root, relative));
            if (!Object.keys(expected).length || JSON.stringify(Object.entries(expected).sort()) !== JSON.stringify(Object.entries(actual).sort())) throw new Error('설치 후 수정된 관리 스킬입니다. 사용자 변경을 별도 스킬로 옮기거나 이전 설치본을 복구하세요.');
        } catch (error) { conflicts.push({ path: relative, message: error.message }); }
    }
    for (const record of previous.policies || []) {
        try {
            const block = managedBlock(fs.readFileSync(safePath(root, record.path), 'utf8'));
            if (!block || hash(block) !== record.blockHash) throw new Error('설치 후 수정된 관리 구간입니다. 사용자 지침을 관리 구간 밖으로 옮기거나 이전 구간을 복구하세요.');
        } catch (error) { conflicts.push({ path: record.path, message: error.message }); }
    }
    return conflicts;
}

function fingerprint(root, relative) {
    const file = safePath(root, relative);
    if (!exists(file)) return null;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
        if (!SKILL_ROOTS.some((directory) => relative.startsWith(`${directory}/`)) || !managedSkill(root, relative)) return hash(`link:${fs.readlinkSync(file)}`);
    }
    if (fs.statSync(file).isDirectory()) return hash(JSON.stringify(Object.entries(snapshotFiles(file)).sort()));
    return hash(fs.readFileSync(file));
}

function createInstallationPlan(root, staged, candidates, originalRoot = root) {
    const changes = [];
    for (const relative of [...new Set(candidates)].sort()) {
        const before = fingerprint(root, relative), after = fingerprint(staged, relative);
        const source = safePath(originalRoot, relative), target = safePath(staged, relative);
        const materialized = exists(source) && exists(target) && fs.lstatSync(source).isSymbolicLink() && !fs.lstatSync(target).isSymbolicLink();
        if (before === after && !materialized) continue;
        changes.push({ path: relative, action: after === null ? 'remove' : before === null ? 'add' : 'change', before, after });
    }
    return { schemaVersion: 1, changes, conflicts: [] };
}

function conflictError(conflicts) {
    const error = new Error(`설치 충돌로 적용하지 않았습니다:\n${conflicts.map((item) => `${item.path}: ${item.message}`).join('\n')}`);
    error.conflicts = conflicts;
    return error;
}

module.exports = { SKILL_ROOTS, safePath, skillPath, readManifest, managedSkill, installConflicts, fingerprint, createInstallationPlan, conflictError };
