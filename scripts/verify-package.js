const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-package-check-'));
const npmCli = process.env.npm_execpath;
function run(script, args, cwd) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
    return result.stdout;
}
try {
    if (!npmCli) throw new Error('npm run verify:package로 실행하세요.');
    const repository = path.join(__dirname, '..');
    const packed = JSON.parse(run(npmCli, ['pack', '--json', '--ignore-scripts', '--pack-destination', root], repository))[0];
    assert.ok(packed.files.some((file) => file.path === 'lib/skills.js'));
    assert.ok(packed.files.some((file) => file.path === 'lib/adapters/claude.js'));
    assert.ok(packed.files.some((file) => file.path === 'lib/installation-plan.js'));
    assert.ok(packed.files.some((file) => file.path === 'skill-sources.lock.json'));
    const tarball = path.join(root, path.basename(packed.filename));
    run(npmCli, ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/', '--fetch-retries=0', '--fetch-timeout=15000'], root);
    const cli = path.join(root, 'node_modules', '@jobbykim', 'ai-init', 'setup.js');
    const project = path.join(root, 'project');
    fs.mkdirSync(project);
    const args = ['init', '--root', project, '--type', 'existing', '--engine', 'all', '--profile', 'bundled', '--json'];
    const first = JSON.parse(run(cli, args, root));
    fs.appendFileSync(path.join(project, 'AGENTS.md'), '\nuser-preserved\n');
    fs.appendFileSync(path.join(project, 'CLAUDE.md'), '\nclaude-user-preserved\n');
    fs.writeFileSync(path.join(project, 'notes.txt'), 'user record');
    JSON.parse(run(cli, ['init', '--root', project, '--json'], root));
    assert.match(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8'), /user-preserved/);
    assert.match(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8'), /claude-user-preserved/);
    assert.equal(fs.lstatSync(path.join(project, '.claude', 'skills', 'jobkim-project-context')).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(path.join(project, 'notes.txt'), 'utf8'), 'user record');
    const status = JSON.parse(run(cli, ['doctor', '--root', project, '--json'], root));
    assert.equal(status.healthy, true);
    assert.equal(status.installation.version, require('../package.json').version);
    console.log(JSON.stringify({ version: packed.version, fileCount: packed.entryCount, skillCount: first.skillCount, installAndReinstall: 'pass', doctor: 'pass', userFilesPreserved: true }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ai-init-package-check-')) throw new Error('임시 폴더 경계 오류');
    fs.rmSync(root, { recursive: true, force: true });
}
