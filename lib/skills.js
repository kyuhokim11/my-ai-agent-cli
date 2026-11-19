const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function frontmatter(text, file = 'SKILL.md') {
    const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) throw new Error(`${file}: YAML frontmatter가 필요합니다.`);
    const document = YAML.parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length || document.warnings.length) {
        throw new Error(`${file}: 올바르지 않은 YAML: ${[...document.errors, ...document.warnings][0].message}`);
    }
    const data = document.toJS({ maxAliasCount: 20 });
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file}: YAML 객체가 필요합니다.`);
    return { data, document, body: text.replace(/^\uFEFF/, '').slice(match[0].length) };
}

function validSkillName(name) {
    return typeof name === 'string' && name.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function validateSkill(directory, expectedName = path.basename(directory), engines = []) {
    const file = path.join(directory, 'SKILL.md');
    const text = fs.readFileSync(file, 'utf8');
    const { data, body } = frontmatter(text, file);
    if (!validSkillName(data.name) || data.name !== expectedName) {
        throw new Error(`${file}: name은 폴더명(${expectedName})과 같은 1~64자 소문자·숫자·하이픈 이름이어야 합니다.`);
    }
    if (typeof data.description !== 'string' || !data.description.trim() || data.description.length > 1024) {
        throw new Error(`${file}: description은 비어 있지 않은 1024자 이하 문자열이어야 합니다.`);
    }
    if (data.compatibility !== undefined && (typeof data.compatibility !== 'string' || !data.compatibility.trim() || data.compatibility.length > 500)) {
        throw new Error(`${file}: compatibility는 비어 있지 않은 500자 이하 문자열이어야 합니다.`);
    }
    if (data.metadata !== undefined && (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata) || Object.values(data.metadata).some((value) => typeof value !== 'string'))) {
        throw new Error(`${file}: metadata는 문자열 값의 객체여야 합니다.`);
    }
    const warnings = [];
    if (engines.includes('claude')) validateClaudeFields(data, file);
    if (text.split('\n').length > 500) warnings.push('SKILL.md가 권장 500줄을 초과합니다.');
    if (/[\u202a-\u202e\u2066-\u2069]/u.test(text)) throw new Error(`${file}: 방향 제어 Unicode 문자를 검토하고 제거하세요.`);
    if (/[\u200b\u200c\u200d\ufeff]/u.test(text.replace(/^\uFEFF/, ''))) warnings.push('보이지 않는 Unicode 문자를 확인하세요.');
    if (data['allowed-tools']) warnings.push('allowed-tools의 권한 의미는 제품마다 다릅니다.');
    // Markdown links are checked; URLs and heading-only links are not local resources.
    for (const match of body.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) {
        const reference = match[1];
        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(reference)) continue;
        let relative;
        try { relative = decodeURIComponent(reference.split('#')[0]); } catch { throw new Error(`${file}: 참조 경로 인코딩 오류: ${reference}`); }
        if (!relative) continue;
        const target = path.resolve(directory, relative);
        const relation = path.relative(directory, target);
        if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
            throw new Error(`${file}: 스킬 폴더 밖 참조: ${reference}`);
        }
        if (!fs.existsSync(target)) throw new Error(`${file}: 없는 참조 파일: ${reference}`);
        const actual = path.relative(fs.realpathSync(directory), fs.realpathSync(target));
        if (actual === '..' || actual.startsWith(`..${path.sep}`) || path.isAbsolute(actual)) throw new Error(`${file}: 참조 링크가 스킬 폴더 밖을 가리킵니다: ${reference}`);
    }
    const openai = path.join(directory, 'agents', 'openai.yaml');
    let explicitOnly = data['disable-model-invocation'] === undefined ? false : skillBoolean(data['disable-model-invocation'], 'disable-model-invocation', file);
    if (fs.existsSync(openai)) {
        const metadata = YAML.parse(fs.readFileSync(openai, 'utf8'), { maxAliasCount: 20, uniqueKeys: true });
        if (metadata?.policy?.allow_implicit_invocation !== undefined && typeof metadata.policy.allow_implicit_invocation !== 'boolean') throw new Error(`${openai}: allow_implicit_invocation은 boolean이어야 합니다.`);
        if (metadata?.policy?.allow_implicit_invocation === false) explicitOnly = true;
    }
    return { name: data.name, description: data.description, explicitOnly, warnings };
}

function skillBoolean(value, field, file) {
    if (typeof value === 'boolean') return value;
    const word = String(value).toLowerCase();
    if (['true', 'yes', 'on', '1'].includes(word)) return true;
    if (['false', 'no', 'off', '0'].includes(word)) return false;
    throw new Error(`${file}: ${field}는 boolean 또는 지원하는 boolean 표기여야 합니다.`);
}

function validateClaudeFields(data, file) {
    for (const field of ['disable-model-invocation', 'user-invocable', 'background']) {
        if (data[field] !== undefined) skillBoolean(data[field], field, file);
    }
    if (data.context !== undefined && data.context !== 'fork') throw new Error(`${file}: Claude context는 fork만 지원합니다.`);
    for (const field of ['allowed-tools', 'disallowed-tools']) {
        if (data[field] !== undefined && !(typeof data[field] === 'string' && data[field].trim()) && !(Array.isArray(data[field]) && data[field].every((item) => typeof item === 'string' && item.trim()))) throw new Error(`${file}: ${field}는 도구 문자열 또는 문자열 배열이어야 합니다.`);
    }
    if (data.hooks !== undefined && (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks))) throw new Error(`${file}: hooks는 객체여야 합니다.`);
    for (const field of ['agent', 'model', 'argument-hint']) if (data[field] !== undefined && (typeof data[field] !== 'string' || !data[field].trim())) throw new Error(`${file}: ${field}는 비어 있지 않은 문자열이어야 합니다.`);
}

function antigravityRule(text) {
    text = text.replace(/^\uFEFF/, '');
    if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return `---\ntrigger: always_on\n---\n${text}`;
    const { data, document, body } = frontmatter(text, 'Antigravity rule');
    if (data.trigger !== undefined && !['always_on', 'model_decision', 'glob', 'manual'].includes(data.trigger)) {
        throw new Error('Antigravity rule: 기존 trigger가 올바르지 않습니다. 사용자 규칙을 확인하세요.');
    }
    if (data.trigger === 'model_decision' && (typeof data.description !== 'string' || !data.description.trim())) throw new Error('Antigravity rule: model_decision에는 description이 필요합니다.');
    if (data.trigger === 'glob' && (typeof (data.globs || data.glob) !== 'string' || !(data.globs || data.glob).trim())) throw new Error('Antigravity rule: glob에는 globs가 필요합니다.');
    if (data.trigger === undefined) document.set('trigger', 'always_on');
    return `---\n${document.toString()}---\n${body}`;
}

module.exports = { frontmatter, validSkillName, validateSkill, validateClaudeFields, antigravityRule };
