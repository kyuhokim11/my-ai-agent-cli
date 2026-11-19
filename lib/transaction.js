const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { safePath, managedSkill, SKILL_ROOTS, fingerprint } = require('./installation-plan');
const { POLICY_PATHS } = require('./policies');
const OWNED_PATHS = ['.ai-core/sources', '.ai-core/install-info.json', '.ai-core/install-manifest.json', '.ai-core/project-profile.json', ...SKILL_ROOTS, '.agents/rules/project.md', '.agents/rules/local.md', ...POLICY_PATHS, '.gitignore', 'ai-init.lock.json', 'ai-init.json'];
function exists(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function copyEntry(source, destination, materializeRoot) {
    const info = fs.lstatSync(source);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (info.isSymbolicLink()) {
        const relative = materializeRoot && path.relative(materializeRoot, source).split(path.sep).join('/');
        if (relative && SKILL_ROOTS.some((root) => relative.startsWith(`${root}/`) && relative.slice(root.length + 1).indexOf('/') === -1) && managedSkill(materializeRoot, relative)) {
            copyEntry(fs.realpathSync(source), destination);
            return;
        }
        let type;
        try { type = fs.statSync(source).isDirectory() ? 'junction' : 'file'; } catch { type = 'junction'; }
        fs.symlinkSync(fs.readlinkSync(source), destination, process.platform === 'win32' ? type : undefined);
    }
    else if (info.isDirectory()) {
        fs.mkdirSync(destination, { recursive: true });
        for (const name of fs.readdirSync(source)) copyEntry(path.join(source, name), path.join(destination, name), materializeRoot);
    } else if (info.isFile()) fs.copyFileSync(source, destination);
    else throw new Error(`지원하지 않는 설치 파일: ${source}`);
}
function assertInstallPaths(root) {
    for (const relative of OWNED_PATHS) {
        const parts = relative.split('/');
        for (let index = 1; index <= parts.length; index += 1) {
            const file = path.join(root, ...parts.slice(0, index));
            if (exists(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error(`설치 경로가 심볼릭 링크입니다. 대상 확인 후 실행하세요: ${file}`);
        }
    }
}
async function transactionalInstall(root, operation, ownedPaths = OWNED_PATHS) {
    assertInstallPaths(root);
    const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-backup-'));
    const present = ownedPaths.filter((relative) => exists(safePath(root, relative)));
    const parentPaths = ['.ai-core', '.agents', '.agents/rules', '.agents/skills', '.claude', '.claude/skills'];
    const missingParents = parentPaths.filter((relative) => !exists(path.join(root, relative)));
    let keepBackup = false;
    try {
        for (const relative of present) copyEntry(path.join(root, relative), path.join(backup, relative));
        try { return await operation(); }
        catch (error) {
            const failures = [];
            for (const relative of [...ownedPaths].reverse()) {
                try {
                    const target = safePath(root, relative);
                    fs.rmSync(target, { recursive: true, force: true });
                    if (present.includes(relative)) copyEntry(path.join(backup, relative), target);
                } catch (failure) { failures.push(`${relative}: ${failure.message}`); }
            }
            for (const relative of missingParents.reverse()) {
                const directory = path.join(root, relative);
                if (exists(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
            }
            if (failures.length) {
                error.message += `\n일부 복구 실패. 백업 유지: ${backup}\n${failures.join('\n')}`;
                keepBackup = true;
            }
            throw error;
        }
    } finally {
        if (!keepBackup) fs.rmSync(backup, { recursive: true, force: true });
    }
}
function cloneInstallState(root, destination) {
    assertInstallPaths(root);
    for (const relative of OWNED_PATHS) if (exists(path.join(root, relative))) copyEntry(path.join(root, relative), path.join(destination, relative), root);
}

async function applyInstallationPlan(root, staged, plan) {
    assertInstallPaths(root);
    // Recheck every preimage before touching the target, including generated copies.
    for (const entry of plan.changes) if (fingerprint(root, entry.path) !== entry.before) throw new Error(`미리보기 후 파일이 변경됐습니다. 다시 실행하세요: ${entry.path}`);
    return transactionalInstall(root, async () => {
        for (const entry of plan.changes) {
            const target = safePath(root, entry.path);
            fs.rmSync(target, { recursive: true, force: true });
            if (entry.action !== 'remove') copyEntry(safePath(staged, entry.path), target);
        }
    }, plan.changes.map((entry) => entry.path));
}
module.exports = { OWNED_PATHS, exists, copyEntry, assertInstallPaths, transactionalInstall, cloneInstallState, applyInstallationPlan };
