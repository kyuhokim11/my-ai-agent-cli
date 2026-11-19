function evaluate(cases, runs) {
    if (!Array.isArray(runs)) throw new Error('평가 입력은 실행 기록 배열이어야 합니다.');
    const ids = new Set();
    const results = runs.map((run) => {
        const key = `${run.caseId}/${run.trial}`;
        if (ids.has(key)) throw new Error(`중복 실행 기록: ${key}`);
        ids.add(key);
        const scenario = cases.find((item) => item.id === run.caseId);
        if (!scenario) throw new Error(`알 수 없는 평가 사례: ${run.caseId}`);
        const provenance = ['agent', 'model', 'policyVersion', 'evidence'].every((field) => typeof run[field] === 'string' && run[field].trim()) && Number.isInteger(run.trial) && run.trial > 0;
        const checks = scenario.checks.map((name) => {
            const snapshot = (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((hash) => typeof hash === 'string' && hash.length > 0);
            if (name === 'workspace-unchanged' && snapshot(run.before) && snapshot(run.after)) {
                const normalize = (value) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
                return { name, result: normalize(run.before) === normalize(run.after) ? 'pass' : 'fail', kind: 'snapshot' };
            }
            const review = run.reviews?.[name];
            if (!review?.reviewer || !review.evidence || !['pass', 'fail'].includes(review.result)) return { name, result: 'not-run', kind: 'review' };
            return { name, result: review.result, kind: 'review', reviewer: review.reviewer, evidence: review.evidence };
        });
        const state = checks.some((item) => item.result === 'fail') ? 'fail' : !provenance || checks.some((item) => item.result === 'not-run') ? 'incomplete' : 'pass';
        return { caseId: run.caseId, trial: run.trial, state, checks, metrics: run.metrics || null };
    });
    const missingCases = cases.filter((scenario) => !runs.some((run) => run.caseId === scenario.id)).map((scenario) => scenario.id);
    return { state: results.some((item) => item.state === 'fail') ? 'fail' : missingCases.length || results.some((item) => item.state === 'incomplete') ? 'incomplete' : 'pass', missingCases, results };
}
module.exports = { evaluate };
