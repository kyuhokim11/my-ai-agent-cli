#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const path = require('path');
const readline = require('readline');

const SKILL_SOURCES = require('./skill-sources.json');
const PACKAGE = require('./package.json');

const USER_AGENT = 'my-ai-agent-cli';
const MANAGED_MARKER = '.ai-init-source.json';
const MANAGED_BLOCK_START = '<!-- ai-init:jobkim:start -->';
const MANAGED_BLOCK_END = '<!-- ai-init:jobkim:end -->';

function request(url, responseType = 'text', redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            headers: {
                Accept: responseType === 'json' ? 'application/vnd.github+json' : 'text/plain',
                'User-Agent': USER_AGENT,
            },
        };

        https
            .get(url, requestOptions, (response) => {
                if (
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location
                ) {
                    response.resume();
                    if (redirectCount >= 5) {
                        reject(new Error(`리다이렉트 한도를 초과했습니다: ${url}`));
                        return;
                    }
                    resolve(request(new URL(response.headers.location, url).toString(), responseType, redirectCount + 1));
                    return;
                }

                if (response.statusCode !== 200) {
                    response.resume();
                    reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                    return;
                }

                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    const body = Buffer.concat(chunks);
                    if (responseType === 'buffer') {
                        resolve(body);
                        return;
                    }

                    const text = body.toString('utf8');
                    if (responseType === 'json') {
                        try {
                            resolve(JSON.parse(text));
                        } catch (error) {
                            reject(new Error(`JSON 응답을 해석하지 못했습니다: ${url}`));
                        }
                        return;
                    }
                    resolve(text);
                });
            })
            .on('error', reject);
    });
}

function assertSafeRelativePath(relativePath) {
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
        throw new Error(`안전하지 않은 원격 파일 경로입니다: ${relativePath}`);
    }
    return normalized;
}

async function mapWithConcurrency(items, limit, worker) {
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await worker(items[currentIndex], currentIndex);
        }
    });
    await Promise.all(workers);
}

async function downloadSource(source, stagingRoot) {
    const treeUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${encodeURIComponent(source.ref)}?recursive=1`;
    const treeResponse = await request(treeUrl, 'json');

    if (treeResponse.truncated) {
        throw new Error(`${source.id} 저장소 파일 목록이 잘려 안전하게 동기화할 수 없습니다.`);
    }

    const prefix = `${source.skillsPath.replace(/\/$/, '')}/`;
    const files = treeResponse.tree.filter(
        (entry) => entry.type === 'blob' && entry.path.startsWith(prefix),
    );

    if (!files.some((entry) => path.posix.basename(entry.path) === 'SKILL.md')) {
        throw new Error(`${source.id}의 ${source.skillsPath}에서 SKILL.md를 찾지 못했습니다.`);
    }

    await mapWithConcurrency(files, 6, async (entry) => {
        const relativePath = assertSafeRelativePath(entry.path.slice(prefix.length));
        const destination = path.join(stagingRoot, relativePath);
        const rawPath = entry.path.split('/').map(encodeURIComponent).join('/');
        const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${encodeURIComponent(source.ref)}/${rawPath}`;
        const content = await request(rawUrl, 'buffer');
        const gitBlob = Buffer.concat([
            Buffer.from(`blob ${content.length}\0`, 'utf8'),
            content,
        ]);
        const downloadedSha = crypto.createHash('sha1').update(gitBlob).digest('hex');
        if (downloadedSha !== entry.sha) {
            throw new Error(`다운로드한 파일의 Git blob SHA가 일치하지 않습니다: ${entry.path}`);
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, content);
    });

    for (const legalFile of source.legalFiles || []) {
        const safeLegalFile = assertSafeRelativePath(legalFile);
        const legalUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${encodeURIComponent(source.ref)}/${legalFile}`;
        const content = await request(legalUrl, 'buffer');
        fs.writeFileSync(path.join(stagingRoot, `_UPSTREAM_${path.basename(safeLegalFile)}`), content);
    }

    fs.writeFileSync(
        path.join(stagingRoot, '_SOURCE.json'),
        `${JSON.stringify(
            {
                repository: `https://github.com/${source.owner}/${source.repo}`,
                requestedRef: source.ref,
                resolvedTreeSha: treeResponse.sha,
                synchronizedAt: new Date().toISOString(),
            },
            null,
            2,
        )}\n`,
        'utf8',
    );
}

function replaceDirectory(stagingRoot, sourceRoot) {
    const backupRoot = `${sourceRoot}.backup`;
    fs.rmSync(backupRoot, { recursive: true, force: true });

    if (fs.existsSync(sourceRoot)) {
        fs.renameSync(sourceRoot, backupRoot);
    }

    try {
        fs.renameSync(stagingRoot, sourceRoot);
        fs.rmSync(backupRoot, { recursive: true, force: true });
    } catch (error) {
        fs.rmSync(sourceRoot, { recursive: true, force: true });
        if (fs.existsSync(backupRoot)) {
            fs.renameSync(backupRoot, sourceRoot);
        }
        throw error;
    }
}

function findSkillDirectories(sourceRoot) {
    const skillDirectories = [];

    function walk(currentDirectory) {
        for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const directory = path.join(currentDirectory, entry.name);
            if (fs.existsSync(path.join(directory, 'SKILL.md'))) {
                skillDirectories.push(directory);
            } else {
                walk(directory);
            }
        }
    }

    walk(sourceRoot);
    return skillDirectories;
}

function syncBundledSkills(sourcesRoot) {
    const sourceRoot = path.join(sourcesRoot, 'jobkim');
    const stagingRoot = `${sourceRoot}.staging-${process.pid}`;
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.cpSync(path.join(__dirname, 'bundled-skills'), stagingRoot, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'LICENSE'), path.join(stagingRoot, '_UPSTREAM_LICENSE'));
    fs.writeFileSync(
        path.join(stagingRoot, '_SOURCE.json'),
        `${JSON.stringify(
            {
                package: PACKAGE.name,
                version: PACKAGE.version,
                synchronizedAt: new Date().toISOString(),
            },
            null,
            2,
        )}\n`,
        'utf8',
    );
    replaceDirectory(stagingRoot, sourceRoot);

    return findSkillDirectories(sourceRoot).map((directory) => ({
        directory,
        legalFiles: [
            { fileName: '_UPSTREAM_LICENSE', path: path.join(sourceRoot, '_UPSTREAM_LICENSE') },
        ],
        name: path.basename(directory),
        sourceId: 'jobkim',
        repository: PACKAGE.repository?.url || PACKAGE.name,
    }));
}

async function syncSource(source, sourcesRoot) {
    const sourceRoot = path.join(sourcesRoot, source.id);
    const stagingRoot = `${sourceRoot}.staging-${process.pid}`;
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.mkdirSync(stagingRoot, { recursive: true });

    try {
        await downloadSource(source, stagingRoot);
        replaceDirectory(stagingRoot, sourceRoot);
        console.log(`[동기화 완료] ${source.owner}/${source.repo}`);
    } catch (error) {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        if (!fs.existsSync(sourceRoot)) {
            throw error;
        }
        console.log(`[경고] ${source.id} 최신 버전 동기화 실패: ${error.message}`);
        console.log('       마지막으로 정상 동기화된 로컬 버전을 사용합니다.');
    }

    const legalFiles = (source.legalFiles || []).map((legalFile) => {
        const fileName = `_UPSTREAM_${path.basename(legalFile)}`;
        return { fileName, path: path.join(sourceRoot, fileName) };
    });

    return findSkillDirectories(sourceRoot).map((directory) => ({
        directory,
        legalFiles,
        name: `${source.installPrefix || ''}${path.basename(directory)}`,
        sourceId: source.id,
        repository: `https://github.com/${source.owner}/${source.repo}`,
    }));
}

function readManagedMarker(skillDirectory) {
    try {
        return JSON.parse(fs.readFileSync(path.join(skillDirectory, MANAGED_MARKER), 'utf8'));
    } catch (error) {
        return null;
    }
}

function installSkill(skill, targetRoot) {
    const destination = path.join(targetRoot, skill.name);
    const existingMarker = fs.existsSync(destination) ? readManagedMarker(destination) : null;

    if (fs.existsSync(destination) && existingMarker?.sourceId !== skill.sourceId) {
        console.log(`[보존] 기존 사용자 스킬과 이름이 겹쳐 건너뜁니다: ${destination}`);
        return false;
    }

    const marker = {
        managedBy: USER_AGENT,
        sourceId: skill.sourceId,
        repository: skill.repository,
    };
    fs.writeFileSync(path.join(skill.directory, MANAGED_MARKER), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    for (const legalFile of skill.legalFiles || []) {
        fs.copyFileSync(legalFile.path, path.join(skill.directory, legalFile.fileName));
    }
    fs.rmSync(destination, { recursive: true, force: true });

    try {
        fs.symlinkSync(skill.directory, destination, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        fs.cpSync(skill.directory, destination, { recursive: true });
    }
    return true;
}

function removeStaleManagedSkills(targetRoot, activeSkillNames) {
    const indexPath = path.join(targetRoot, '.ai-init-managed.json');
    let previousSkillNames = [];
    try {
        previousSkillNames = JSON.parse(fs.readFileSync(indexPath, 'utf8')).skills || [];
    } catch (error) {
        previousSkillNames = [];
    }

    for (const skillName of previousSkillNames) {
        if (activeSkillNames.has(skillName)) {
            continue;
        }
        const destination = path.join(targetRoot, skillName);
        const marker = fs.existsSync(destination) ? readManagedMarker(destination) : null;
        if (marker?.managedBy === USER_AGENT) {
            fs.rmSync(destination, { recursive: true, force: true });
            console.log(`[정리] upstream에서 제거된 관리 스킬: ${destination}`);
        }
    }

    fs.writeFileSync(
        indexPath,
        `${JSON.stringify({ managedBy: USER_AGENT, skills: [...activeSkillNames].sort() }, null, 2)}\n`,
        'utf8',
    );
}

function validateUniqueSkillNames(skills) {
    const names = new Map();
    for (const skill of skills) {
        const previousSource = names.get(skill.name);
        if (previousSource) {
            throw new Error(
                `스킬 이름 충돌: ${skill.name} (${previousSource}, ${skill.sourceId}). ` +
                    'skill-sources.json에서 installPrefix를 지정하세요.',
            );
        }
        names.set(skill.name, skill.sourceId);
    }
}

function renderProjectPolicy(projectType) {
    const coreRules = fs.readFileSync(path.join(__dirname, 'rules', 'core.md'), 'utf8').trim();
    const modeFile = projectType === 'existing' ? 'existing-project.md' : 'new-project.md';
    const modeRules = fs.readFileSync(path.join(__dirname, 'rules', modeFile), 'utf8').trim();
    return `${MANAGED_BLOCK_START}\n${coreRules}\n\n${modeRules}\n${MANAGED_BLOCK_END}`;
}

function upsertManagedBlock(filePath, block) {
    let currentContent = '';
    if (fs.existsSync(filePath)) {
        currentContent = fs.readFileSync(filePath, 'utf8');
    }

    const startIndex = currentContent.indexOf(MANAGED_BLOCK_START);
    const endIndex = currentContent.indexOf(MANAGED_BLOCK_END);
    let nextContent;

    if (startIndex === -1 && endIndex === -1) {
        const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : currentContent.length > 0 ? '\n' : '';
        nextContent = `${currentContent}${separator}${block}\n`;
    } else if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        nextContent = `${currentContent.slice(0, startIndex)}${block}${currentContent.slice(
            endIndex + MANAGED_BLOCK_END.length,
        )}`;
        if (!nextContent.endsWith('\n')) {
            nextContent += '\n';
        }
    } else {
        throw new Error(`관리 블록 마커가 손상되어 파일을 안전하게 갱신할 수 없습니다: ${filePath}`);
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, nextContent, 'utf8');
}

function inspectExistingProject(projectRoot) {
    const instructionCandidates = [
        '.codex/Codex.md',
        'AGENTS.md',
        'AGENTS.override.md',
        'GEMINI.md',
        'CLAUDE.md',
        'README.md',
        'README',
    ];
    const configurationCandidates = [
        'package.json',
        'pnpm-workspace.yaml',
        'yarn.lock',
        'package-lock.json',
        'pnpm-lock.yaml',
        'pyproject.toml',
        'requirements.txt',
        'Cargo.toml',
        'go.mod',
        'pom.xml',
        'build.gradle',
        'docker-compose.yml',
        'compose.yml',
    ];
    const existingFiles = (candidates) =>
        candidates.filter((candidate) => fs.existsSync(path.join(projectRoot, candidate)));
    const topLevelDirectories = fs
        .readdirSync(projectRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map((entry) => entry.name)
        .sort();

    return {
        generatedAt: new Date().toISOString(),
        instructionsToRead: existingFiles(instructionCandidates),
        configurationFiles: existingFiles(configurationCandidates),
        topLevelDirectories,
    };
}

function installProjectPolicy(projectRoot, projectType, selectedEngines, existingProfile) {
    const block = renderProjectPolicy(projectType);
    const policyTargets = [];

    if (selectedEngines.includes('1')) {
        policyTargets.push(path.join(projectRoot, 'AGENTS.md'));
    }
    if (selectedEngines.includes('2')) {
        policyTargets.push(path.join(projectRoot, 'GEMINI.md'));
        policyTargets.push(path.join(projectRoot, '.agents', 'rules', 'jobkim.md'));
    }
    for (const target of policyTargets) {
        upsertManagedBlock(target, block);
    }

    if (projectType === 'existing') {
        const profilePath = path.join(projectRoot, '.ai-core', 'project-profile.json');
        fs.mkdirSync(path.dirname(profilePath), { recursive: true });
        fs.writeFileSync(profilePath, `${JSON.stringify(existingProfile, null, 2)}\n`, 'utf8');
    }
    return policyTargets;
}

async function synchronizeSkills(projectRoot, selectedEngines, projectType = 'existing') {
    const sourcesRoot = path.join(projectRoot, '.ai-core', 'sources');
    fs.mkdirSync(sourcesRoot, { recursive: true });

    const skillGroups = [syncBundledSkills(sourcesRoot)];
    for (const source of SKILL_SOURCES) {
        skillGroups.push(await syncSource(source, sourcesRoot));
    }
    const skills = skillGroups.flat();
    validateUniqueSkillNames(skills);

    if (!selectedEngines.includes('1') && !selectedEngines.includes('2')) {
        throw new Error('활성화할 AI 엔진 번호로 1, 2 또는 1,2를 입력하세요.');
    }

    const existingProfile = projectType === 'existing' ? inspectExistingProject(projectRoot) : null;
    const targetDirectory = path.join(projectRoot, '.agents', 'skills');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const installedSkills = skills.filter((skill) => installSkill(skill, targetDirectory));
    removeStaleManagedSkills(targetDirectory, new Set(installedSkills.map((skill) => skill.name)));
    const policyTargets = installProjectPolicy(
        projectRoot,
        projectType,
        selectedEngines,
        existingProfile,
    );
    console.log(`[설치 완료] 공통 Agent Skills: ${installedSkills.length}개`);

    return {
        skillCount: skills.length,
        targetCount: 1,
        policyFiles: policyTargets.length,
    };
}

function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function runCli() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        console.log('\n==================================================================');
        console.log('Universal AI-Agent Dev Initializer');
        console.log('==================================================================');
        console.log('\n프로젝트 유형을 선택하세요.');
        console.log('1) 신규 프로젝트');
        console.log('2) 기존 프로젝트');

        const projectAnswer = await ask(rl, '\n번호 입력 (1 또는 2): ');
        const projectType =
            projectAnswer.trim() === '1' ? 'new' : projectAnswer.trim() === '2' ? 'existing' : null;
        if (!projectType) {
            throw new Error('프로젝트 유형으로 1 또는 2를 입력하세요.');
        }

        console.log('\n활성화할 AI 엔진을 선택하세요 (복수 선택 가능).');
        console.log('1) Codex');
        console.log('2) Gemini/Antigravity');

        const answer = await ask(rl, '\n번호 입력 (1, 2 또는 1,2): ');
        const selectedEngines = [...new Set(answer.split(',').map((item) => item.trim()))];
        const result = await synchronizeSkills(process.cwd(), selectedEngines, projectType);
        console.log(
            `\n최신 스킬 ${result.skillCount}개와 프로젝트 정책 ${result.policyFiles}개를 적용했습니다.\n`,
        );
    } catch (error) {
        console.error(`\n[오류] ${error.message}\n`);
        process.exitCode = 1;
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    runCli();
}

module.exports = {
    assertSafeRelativePath,
    findSkillDirectories,
    inspectExistingProject,
    installSkill,
    installProjectPolicy,
    removeStaleManagedSkills,
    renderProjectPolicy,
    synchronizeSkills,
    upsertManagedBlock,
    validateUniqueSkillNames,
};
