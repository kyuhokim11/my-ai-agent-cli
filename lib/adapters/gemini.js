module.exports = {
    label: 'Gemini CLI',
    skills: '.agents/skills',
    explicitPolicy: 'host-dependent',
    policyPaths: () => ['GEMINI.md'],
    instructions: 'Gemini CLI의 GEMINI.md 지침 계층과 현재 세션에서 사용 가능한 스킬을 확인한다. 다른 제품 전용 메타데이터의 권한 의미를 가정하지 않는다.',
};
