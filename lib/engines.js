const fs = require('node:fs');
const path = require('node:path');

const ENGINES = {
    codex: require('./adapters/codex'),
    gemini: require('./adapters/gemini'),
    antigravity: require('./adapters/antigravity'),
};

function expandEngines(selected) {
    const aliases = { '1': ['codex'], '2': ['gemini', 'antigravity'], 'gemini-antigravity': ['gemini', 'antigravity'] };
    const expanded = [...new Set(selected.flatMap((name) => aliases[name] || [name]))];
    if (!expanded.length || expanded.some((name) => !ENGINES[name])) throw new Error('지원 엔진: codex, gemini, antigravity (기존 선택: 1, 2 또는 1,2).');
    return expanded;
}

function instructionChain(projectRoot, currentDirectory = projectRoot) {
    const relative = path.relative(projectRoot, currentDirectory);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('현재 경로가 프로젝트 루트 밖입니다.');
    const directories = [projectRoot];
    let directory = projectRoot;
    for (const segment of relative.split(path.sep).filter(Boolean)) { directory = path.join(directory, segment); directories.push(directory); }
    return directories.flatMap((root) => {
        for (const name of ['AGENTS.override.md', 'AGENTS.md']) {
            const file = path.join(root, name);
            if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) return [path.relative(projectRoot, file).split(path.sep).join('/')];
        }
        return [];
    });
}

function policyPaths(projectRoot, selected) {
    return [...new Set(expandEngines(selected).flatMap((engine) => ENGINES[engine].policyPaths(projectRoot)))];
}

function skillTargets(selected) {
    const groups = new Map();
    for (const engine of expandEngines(selected)) {
        const directory = ENGINES[engine].skills;
        if (!groups.has(directory)) groups.set(directory, { directory, engines: [] });
        groups.get(directory).engines.push(engine);
    }
    return [...groups.values()];
}

module.exports = { ENGINES, expandEngines, instructionChain, policyPaths, skillTargets };
