const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { synchronizeSkills } = require('../setup');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-network-smoke-'));
synchronizeSkills(root, ['4'], 'existing', { dryRun: true, log: () => {} })
    .then((result) => console.log(JSON.stringify({ skillCount: result.skillCount, policyFiles: result.policyFiles, dryRun: result.dryRun, changeCount: result.changes.length, targetUnchanged: fs.readdirSync(root).length === 0 }, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => {
        if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ai-init-network-smoke-')) throw new Error('임시 폴더 경계 오류');
        fs.rmSync(root, { recursive: true, force: true });
    });
