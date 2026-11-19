const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LOCK_NAME = 'ai-init.lock.json';
const SHA = /^[a-f0-9]{40}$/;
function validateSource(source) {
    if (!source || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id || '') || !/^[\w.-]+$/.test(source.owner || '') || !/^[\w.-]+$/.test(source.repo || '')) throw new Error('외부 소스 id/owner/repo가 올바르지 않습니다.');
    if (typeof source.ref !== 'string' || !source.ref.trim() || source.ref.length > 256) throw new Error(`${source.id}: ref가 필요합니다.`);
    const paths = [source.skillsPath, ...(source.legalFiles || [])];
    if (paths.some((file) => typeof file !== 'string' || !file || file.startsWith('/') || file.includes('\\') || file.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':')))) throw new Error(`${source.id}: 안전하지 않은 소스 경로입니다.`);
    if (source.installPrefix && !/^[a-z0-9-]+$/.test(source.installPrefix)) throw new Error(`${source.id}: installPrefix가 올바르지 않습니다.`);
}
function identity(source) {
    validateSource(source);
    return { id: source.id, owner: source.owner, repo: source.repo, ref: source.ref, skillsPath: source.skillsPath, legalFiles: source.legalFiles || [], installPrefix: source.installPrefix || '' };
}
function validateLock(lock, sources) {
    if (lock?.schemaVersion !== 1 || !Array.isArray(lock.sources)) throw new Error('지원하지 않거나 손상된 ai-init 잠금 파일입니다.');
    const ids = new Set();
    for (const entry of lock.sources) {
        validateSource(entry);
        if (ids.has(entry.id) || !SHA.test(entry.commit || '') || !SHA.test(entry.tree || '')) throw new Error('소스 잠금 파일의 중복 id 또는 SHA 오류입니다.');
        ids.add(entry.id);
    }
    for (const source of sources) {
        const entry = lock.sources.find((item) => item.id === source.id);
        if (!entry || JSON.stringify(identity(source)) !== JSON.stringify(identity(entry))) throw new Error(`${source.id}: 잠금과 소스 설정이 다릅니다. ai-init lock --update로 검토할 새 잠금을 생성하세요.`);
    }
    return lock;
}
async function resolveLock(sources, request) {
    const records = [];
    for (const source of sources) {
        validateSource(source);
        const commit = await request(`https://api.github.com/repos/${source.owner}/${source.repo}/commits/${encodeURIComponent(source.ref)}`, 'json');
        if (!SHA.test(commit.sha || '') || !SHA.test(commit.commit?.tree?.sha || '')) throw new Error(`${source.id}: GitHub commit/tree SHA를 확인하지 못했습니다.`);
        records.push({ ...identity(source), commit: commit.sha, tree: commit.commit.tree.sha });
    }
    return { schemaVersion: 1, sources: records };
}
function readLock(projectRoot, packageRoot, sources, frozen = false) {
    const local = path.join(projectRoot, LOCK_NAME);
    if (fs.existsSync(local)) return validateLock(JSON.parse(fs.readFileSync(local, 'utf8')), sources);
    if (frozen) throw new Error('--frozen에는 기존 ai-init.lock.json이 필요합니다.');
    const bundled = path.join(packageRoot, 'skill-sources.lock.json');
    if (!sources.length && !fs.existsSync(bundled)) return { schemaVersion: 1, sources: [] };
    return validateLock(JSON.parse(fs.readFileSync(bundled, 'utf8')), sources);
}
function writeJsonAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); fs.renameSync(temporary, file); }
    finally { fs.rmSync(temporary, { force: true }); }
}
function snapshotFiles(root, excluded = () => false) {
    const files = {};
    const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (excluded(entry.name)) continue;
            const file = path.join(directory, entry.name);
            const relative = path.relative(root, file).split(path.sep).join('/');
            if (entry.isSymbolicLink()) throw new Error(`소스 내부 심볼릭 링크는 지원하지 않습니다: ${relative}`);
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) files[relative] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
            else throw new Error(`지원하지 않는 파일: ${relative}`);
        }
    };
    walk(root);
    return files;
}
function verifyCachedSource(root, locked) {
    const info = JSON.parse(fs.readFileSync(path.join(root, '_SOURCE.json'), 'utf8'));
    if (info.resolvedCommitSha !== locked.commit || info.resolvedTreeSha !== locked.tree || !info.files || typeof info.files !== 'object') throw new Error(`${locked.id}: 캐시가 잠금 SHA와 일치하지 않습니다.`);
    for (const [relative, digest] of Object.entries(info.files)) {
        const file = path.resolve(root, relative);
        const relation = path.relative(root, file);
        if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('안전하지 않은 캐시 무결성 기록입니다.');
        const actualRelation = path.relative(fs.realpathSync(root), fs.realpathSync(file));
        if (actualRelation === '..' || actualRelation.startsWith(`..${path.sep}`) || path.isAbsolute(actualRelation)) throw new Error('캐시 링크가 소스 밖을 가리킵니다.');
        if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== digest) throw new Error(`${locked.id}: 캐시 파일이 변경됐습니다: ${relative}`);
    }
    const actual = snapshotFiles(root, (name) => name === '_SOURCE.json' || name === '.ai-init-source.json');
    const generatedLegal = (locked.legalFiles || []).map((file) => `_UPSTREAM_${path.basename(file)}`);
    for (const [relative, digest] of Object.entries(actual)) {
        if (Object.hasOwn(info.files, relative)) continue;
        const name = path.basename(relative);
        if (generatedLegal.includes(name) && digest === info.files[name]) continue;
        throw new Error(`${locked.id}: 잠금 캐시에 기록되지 않은 파일: ${relative}`);
    }
    return info;
}
module.exports = { LOCK_NAME, validateSource, validateLock, resolveLock, readLock, writeJsonAtomic, snapshotFiles, verifyCachedSource };
