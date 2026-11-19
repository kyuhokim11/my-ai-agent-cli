const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OWNED_PATHS = ['.ai-core/sources', '.ai-core/install-info.json', '.ai-core/install-manifest.json', '.ai-core/project-profile.json', '.agents/skills', '.agents/rules/jobkim.md', '.agents/rules/project.md', '.agents/rules/local.md', 'AGENTS.md', 'AGENTS.override.md', 'GEMINI.md', '.gitignore', 'ai-init.lock.json'];
function exists(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function copyEntry(source, destination) {
    const info = fs.lstatSync(source);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (info.isSymbolicLink()) {
        let type;
        try { type = fs.statSync(source).isDirectory() ? 'junction' : 'file'; } catch { type = 'junction'; }
        fs.symlinkSync(fs.readlinkSync(source), destination, process.platform === 'win32' ? type : undefined);
    }
    else if (info.isDirectory()) {
        fs.mkdirSync(destination, { recursive: true });
        for (const name of fs.readdirSync(source)) copyEntry(path.join(source, name), path.join(destination, name));
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
async function transactionalInstall(root, operation) {
    assertInstallPaths(root);
    const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-backup-'));
    const present = OWNED_PATHS.filter((relative) => exists(path.join(root, relative)));
    const parentPaths = ['.ai-core', '.agents', '.agents/rules'];
    const missingParents = parentPaths.filter((relative) => !exists(path.join(root, relative)));
    let keepBackup = false;
    try {
        for (const relative of present) copyEntry(path.join(root, relative), path.join(backup, relative));
        try { return await operation(); }
        catch (error) {
            const failures = [];
            for (const relative of [...OWNED_PATHS].reverse()) {
                try {
                    const target = path.resolve(root, relative);
                    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('복구 대상이 루트 밖입니다.');
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
    for (const relative of OWNED_PATHS) if (exists(path.join(root, relative))) copyEntry(path.join(root, relative), path.join(destination, relative));
}
module.exports = { OWNED_PATHS, exists, copyEntry, assertInstallPaths, transactionalInstall, cloneInstallState };
