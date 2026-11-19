module.exports = {
    label: 'Antigravity',
    skills: '.agents/skills',
    explicitPolicy: 'host-dependent',
    policyPaths: () => ['GEMINI.md', '.agents/rules/jobkim.md'],
    instructions: 'Antigravity에서는 GEMINI.md와 .agents/rules/의 활성 규칙을 확인한다. trigger가 없는 사용자 규칙은 자동 적용된다고 가정하지 않는다.',
};
