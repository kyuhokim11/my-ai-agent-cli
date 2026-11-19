const fs = require('node:fs');
const path = require('node:path');
const { expandEngines } = require('./engines');

const CONFIG_NAME = 'ai-init.json';
const LEGACY_ENGINES = { Codex: 'codex', 'Gemini CLI': 'gemini', Antigravity: 'antigravity', 'Gemini/Antigravity': '2', 'Claude Code': 'claude' };

function readJson(root, relative) {
    try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`${relative}: ${error.message}`); }
}

function validateConfiguration(value) {
    if (!value || value.schemaVersion !== 1 || !['new', 'existing'].includes(value.projectType) ||
        !['full', 'bundled'].includes(value.profile) || !Array.isArray(value.skills) ||
        value.skills.some((name) => typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))) {
        throw new Error('ai-init.json: 지원하지 않거나 손상된 설치 구성입니다.');
    }
    return { schemaVersion: 1, projectType: value.projectType, engines: expandEngines(value.engines), profile: value.profile, skills: [...new Set(value.skills)] };
}

function readConfiguration(root) {
    const value = readJson(root, CONFIG_NAME);
    return value ? validateConfiguration(value) : null;
}

function resolveConfiguration(saved, options = {}) {
    if (options.engines && options.addEngines) throw new Error('--engine과 --add-engine은 함께 사용할 수 없습니다.');
    if (options.addEngines && !saved) throw new Error('--add-engine에는 기존 설치 구성이 필요합니다. 첫 설치는 --engine을 사용하세요.');
    return validateConfiguration({
        schemaVersion: 1,
        projectType: options.projectType || saved?.projectType,
        engines: options.addEngines ? [...saved.engines, ...options.addEngines] : options.engines || saved?.engines,
        profile: options.profile || saved?.profile || 'full',
        skills: options.skills?.length ? options.skills : options.profile === 'bundled' ? [] : saved?.skills || [],
    });
}

module.exports = { CONFIG_NAME, readJson, readConfiguration, validateConfiguration, resolveConfiguration };
