const fs = require('node:fs');
const cases = require('../evals/cases.json');
const { evaluate } = require('../lib/evaluation');
try {
    const file = process.argv[2];
    if (!file) {
        console.log(JSON.stringify({ state: 'not-run', cases, usage: 'node scripts/evaluate.js <captured-runs.json>' }, null, 2));
    } else {
        const result = evaluate(cases, JSON.parse(fs.readFileSync(file, 'utf8')));
        console.log(JSON.stringify(result, null, 2));
        if (result.state !== 'pass') process.exitCode = result.state === 'incomplete' ? 2 : 1;
    }
} catch (error) { console.error(error.message); process.exitCode = 1; }
