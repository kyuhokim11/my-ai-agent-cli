const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ENGINES, expandEngines } = require('./engines');
const { antigravityRule } = require('./skills');

const START = '<!-- ai-init:jobkim:start -->';
const END = '<!-- ai-init:jobkim:end -->';
const IGNORE_START = '# ai-init:managed:start';
const IGNORE_END = '# ai-init:managed:end';
const POLICY_PATHS = ['AGENTS.md', 'AGENTS.override.md', 'GEMINI.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.agents/rules/jobkim.md'];

function hash(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function managedBlock(text, start = START, end = END) {
    const begins = text.split(start).length - 1;
    const ends = text.split(end).length - 1;
    if (!begins && !ends) return null;
    const first = text.indexOf(start), last = text.indexOf(end);
    if (begins !== 1 || ends !== 1 || first >= last) throw new Error('관리 블록 마커가 손상되어 안전하게 갱신할 수 없습니다.');
    return text.slice(first, last + end.length);
}

function upsertDelimitedBlock(file, block, start = START, end = END) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const previous = managedBlock(current, start, end);
    const separator = current && !current.endsWith('\n') ? '\n\n' : current ? '\n' : '';
    let next = previous ? current.replace(previous, () => block) : `${current}${separator}${block}`;
    if (!next.endsWith('\n')) next += '\n';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, 'utf8');
}

function renderProjectPolicy(projectType, engines = [], relative = 'AGENTS.md') {
    const root = path.join(__dirname, '..', 'rules');
    const core = fs.readFileSync(path.join(root, 'core.md'), 'utf8').trim();
    const mode = fs.readFileSync(path.join(root, projectType === 'existing' ? 'existing-project.md' : 'new-project.md'), 'utf8').trim();
    const native = engines.map((engine) => ENGINES[engine].instructions).join('\n\n');
    let imports = '';
    if (engines.includes('claude')) {
        imports = ['project.md', 'local.md'].map((name) => `@${path.posix.relative(path.posix.dirname(relative), `.agents/rules/${name}`)}`).join('\n');
    }
    return [START, core, mode, native, imports,
        '마지막으로 성공한 ai-init 적용 정보는 `.ai-core/install-info.json`에서 확인한다. 실패한 재실행의 부분 변경이나 외부 스킬 버전까지 보증하는 정보는 아니다.', END].filter(Boolean).join('\n\n');
}

function installPolicies(root, type, selected) {
    const targets = new Map();
    for (const engine of expandEngines(selected)) {
        for (const file of ENGINES[engine].policyPaths(root)) {
            if (!targets.has(file)) targets.set(file, []);
            targets.get(file).push(engine);
        }
    }
    for (const [relative, engines] of targets) {
        const file = path.join(root, relative);
        upsertDelimitedBlock(file, renderProjectPolicy(type, engines, relative));
        if (relative === '.agents/rules/jobkim.md') fs.writeFileSync(file, antigravityRule(fs.readFileSync(file, 'utf8')), 'utf8');
    }
    return [...targets.keys()].map((relative) => path.join(root, relative));
}

function removePolicyBlock(root, record) {
    const file = path.join(root, record.path);
    if (!fs.existsSync(file)) return;
    const current = fs.readFileSync(file, 'utf8');
    const block = managedBlock(current);
    if (!block) throw new Error(`관리 구간이 사라졌습니다: ${record.path}`);
    const next = current.replace(block, '');
    // The Antigravity frontmatter was generated along with a newly created file.
    const emptyBody = next.replace(/^---\r?\ntrigger: always_on\r?\n---\r?\n/, '').trim() === '';
    if (record.created && emptyBody) fs.unlinkSync(file);
    else fs.writeFileSync(file, next, 'utf8');
}

module.exports = { START, END, IGNORE_START, IGNORE_END, POLICY_PATHS, hash, managedBlock, upsertDelimitedBlock, renderProjectPolicy, installPolicies, removePolicyBlock };
