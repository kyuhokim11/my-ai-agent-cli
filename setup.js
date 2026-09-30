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
const GITIGNORE_BLOCK_START = '# ai-init:managed:start';
const GITIGNORE_BLOCK_END = '# ai-init:managed:end';
const REQUEST_TIMEOUT_MS = 30_000;

const PROJECT_RULE_TEMPLATE = `# Project Custom Rules
<!--
  [용도 및 목적]
  이 파일은 이 프로젝트에 참여하는 팀원과 AI 에이전트가 공통으로 준수해야 할 프로젝트 전용 프롬프트 공간입니다.

  [특징]
  1. Git에 커밋되어 팀원들과 공유되므로, 프로젝트의 기술 스택, 코딩 컨벤션, 아키텍처 원칙을 기록합니다.
  2. ai-init 재실행이나 버전 업데이트 시에도 기존 내용이 절대 덮어써지지 않고 안전하게 보존됩니다.
  3. AI 에이전트는 이 파일의 지침을 기본 가드레일보다 우선하여 적용합니다.
-->

## 1. 기술 스택 및 아키텍처
- 언어 및 런타임: (예: Node.js 20+, TypeScript 등)
- 주요 프레임워크/라이브러리: (예: React, Next.js, Express, Spring Boot 등)

## 2. 프로젝트 공통 코딩 컨벤션
- 네이밍 및 코드 스타일: (예: 함수형 컴포넌트 선호, 디렉터리 구조 등)
- 라이브러리 추가 정책: 새로운 외부 패키지 설치 시 반드시 사유와 대안을 설명하고 승인 대기

## 3. 테스트 및 품질 기준
- 핵심 비즈니스 로직에는 단위 테스트를 필수 작성한다.
`;

const LOCAL_RULE_TEMPLATE = `# Local / Personal Rules
<!--
  [용도 및 목적]
  이 파일은 개발자 개인의 취향, 작업 스타일 및 AI 답변 방식을 정의하는 개인 전용 프롬프트 공간입니다.

  [특징]
  1. .gitignore에 자동 등록되어 Git에 커밋되지 않으므로 팀원에게 영향을 주지 않고 내 로컬 PC에서만 유지됩니다.
  2. ai-init 재실행이나 버전 업데이트 시에도 기존 내용이 절대 덮어써지지 않고 안전하게 보존됩니다.
  3. AI 에이전트는 이 파일의 지침을 기본 규칙보다 우선하여 따릅니다.
-->

## 1. 개인 작업 및 답변 스타일
- 답변은 불필요한 미사여구를 생략하고 간결한 한국어로 핵심 위주로 보고할 것.
- 수정 계획을 제시할 때 변경 이유와 영향 범위를 명확하게 요약할 것.

## 2. 개인 선호 작업 방식
- 터미널 명령어 제안 시 선호하는 셸(예: PowerShell, bash 등) 환경에 맞출 것.
- 커밋 메시지나 PR 설명 초안을 제안할 때는 간결한 컨벤셔널 커밋 형식을 따를 것.
`;

function request(url, responseType = 'text', redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            headers: {
                Accept: responseType === 'json' ? 'application/vnd.github+json' : 'text/plain',
                'User-Agent': USER_AGENT,
            },
        };

        const clientRequest = https.get(url, requestOptions, (response) => {
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
            });
        clientRequest.setTimeout(REQUEST_TIMEOUT_MS, () => {
            clientRequest.destroy(new Error(`30초 동안 응답이 없어 요청을 중단했습니다: ${url}`));
        });
        clientRequest.on('error', reject);
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
    // 설치 대상 링크도 이 캐시를 가리키므로 교체 전에 관리 소유권을 보존한다.
    if (fs.existsSync(sourceRoot)) {
        for (const previousDirectory of findSkillDirectories(sourceRoot)) {
            const marker = readManagedMarker(previousDirectory);
            const nextDirectory = path.join(stagingRoot, path.relative(sourceRoot, previousDirectory));
            if (marker?.managedBy === USER_AGENT &&
                typeof marker.sourceId === 'string' &&
                fs.existsSync(path.join(nextDirectory, 'SKILL.md'))) {
                fs.writeFileSync(path.join(nextDirectory, MANAGED_MARKER), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
            }
        }
    }
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

function copyDirectory(sourceRoot, destinationRoot) {
    fs.mkdirSync(destinationRoot, { recursive: true });
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
        const source = path.join(sourceRoot, entry.name);
        const destination = path.join(destinationRoot, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(source, destination);
        } else if (entry.isFile()) {
            fs.copyFileSync(source, destination);
        } else {
            throw new Error(`지원하지 않는 번들 파일 형식입니다: ${source}`);
        }
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
    copyDirectory(path.join(__dirname, 'bundled-skills'), stagingRoot);
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

    console.log(`[동기화 중] ${source.owner}/${source.repo}`);
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
        copyDirectory(skill.directory, destination);
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

function parseSelectedEngines(answer) {
    const selectedEngines = [...new Set(answer.split(',').map((item) => item.trim()))];
    if (selectedEngines.length === 0 || selectedEngines.some((engine) => engine !== '1' && engine !== '2')) {
        throw new Error('활성화할 AI 엔진 번호로 1, 2 또는 1,2를 입력하세요.');
    }
    return selectedEngines;
}

function parseProjectType(answer) {
    if (answer.trim() === '1') {
        return 'new';
    }
    if (answer.trim() === '2') {
        return 'existing';
    }
    throw new Error('프로젝트 유형으로 1 또는 2를 입력하세요.');
}

function renderProjectPolicy(projectType) {
    const coreRules = fs.readFileSync(path.join(__dirname, 'rules', 'core.md'), 'utf8').trim();
    const modeFile = projectType === 'existing' ? 'existing-project.md' : 'new-project.md';
    const modeRules = fs.readFileSync(path.join(__dirname, 'rules', modeFile), 'utf8').trim();
    const installationNote = '마지막으로 성공한 ai-init 적용 정보는 `.ai-core/install-info.json`에서 확인한다. 실패한 재실행의 부분 변경이나 외부 스킬 버전까지 보증하는 정보는 아니다.';
    return `${MANAGED_BLOCK_START}\n${coreRules}\n\n${modeRules}\n\n${installationNote}\n${MANAGED_BLOCK_END}`;
}

function upsertDelimitedBlock(filePath, block, startMarker, endMarker) {
    let currentContent = '';
    if (fs.existsSync(filePath)) {
        currentContent = fs.readFileSync(filePath, 'utf8');
    }

    const startIndex = currentContent.indexOf(startMarker);
    const endIndex = currentContent.indexOf(endMarker);
    let nextContent;

    if (startIndex === -1 && endIndex === -1) {
        const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : currentContent.length > 0 ? '\n' : '';
        nextContent = `${currentContent}${separator}${block}\n`;
    } else if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        nextContent = `${currentContent.slice(0, startIndex)}${block}${currentContent.slice(
            endIndex + endMarker.length,
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

function upsertManagedBlock(filePath, block) {
    upsertDelimitedBlock(filePath, block, MANAGED_BLOCK_START, MANAGED_BLOCK_END);
}

function updateGitignore(projectRoot) {
    const entries = [
        '/.ai-core/',
        '/.agents/rules/jobkim.md',
        '/.agents/rules/local.md',
        '/.agents/skills/',
    ];
    const block = `${GITIGNORE_BLOCK_START}\n${entries.join('\n')}\n${GITIGNORE_BLOCK_END}`;
    upsertDelimitedBlock(
        path.join(projectRoot, '.gitignore'),
        block,
        GITIGNORE_BLOCK_START,
        GITIGNORE_BLOCK_END,
    );
}

function ensureCustomRuleTemplates(projectRoot) {
    const rulesDirectory = path.join(projectRoot, '.agents', 'rules');
    fs.mkdirSync(rulesDirectory, { recursive: true });

    const targets = [
        { filePath: path.join(rulesDirectory, 'project.md'), template: PROJECT_RULE_TEMPLATE },
        { filePath: path.join(rulesDirectory, 'local.md'), template: LOCAL_RULE_TEMPLATE },
    ];

    for (const { filePath, template } of targets) {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, template, 'utf8');
        }
    }
}

function inspectExistingProject(projectRoot) {
    const instructionCandidates = [
        '.codex/Codex.md',
        'AGENTS.md',
        'AGENTS.override.md',
        '.agents/rules/project.md',
        '.agents/rules/local.md',
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

function writeInstallInfo(projectRoot, projectType, selectedEngines) {
    const destination = path.join(projectRoot, '.ai-core', 'install-info.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporaryPath = `${destination}.${crypto.randomUUID()}.tmp`;
    const information = {
        package: PACKAGE.name,
        version: PACKAGE.version,
        appliedAt: new Date().toISOString(),
        projectType,
        engines: selectedEngines.map((engine) => engine === '1' ? 'Codex' : 'Gemini/Antigravity'),
    };
    try {
        fs.writeFileSync(temporaryPath, `${JSON.stringify(information, null, 2)}\n`, 'utf8');
        fs.renameSync(temporaryPath, destination);
    } finally {
        fs.rmSync(temporaryPath, { force: true });
    }
}

async function synchronizeSkills(projectRoot, selectedEngines, projectType = 'existing') {
    selectedEngines = parseSelectedEngines(selectedEngines.join(','));
    const sourcesRoot = path.join(projectRoot, '.ai-core', 'sources');
    fs.mkdirSync(sourcesRoot, { recursive: true });

    const skillGroups = [syncBundledSkills(sourcesRoot)];
    for (const source of SKILL_SOURCES) {
        skillGroups.push(await syncSource(source, sourcesRoot));
    }
    const skills = skillGroups.flat();
    validateUniqueSkillNames(skills);

    const existingProfile = projectType === 'existing' ? inspectExistingProject(projectRoot) : null;
    const targetDirectory = path.join(projectRoot, '.agents', 'skills');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const installedSkills = skills.filter((skill) => installSkill(skill, targetDirectory));
    removeStaleManagedSkills(targetDirectory, new Set(installedSkills.map((skill) => skill.name)));
    ensureCustomRuleTemplates(projectRoot);
    updateGitignore(projectRoot);
    const policyTargets = installProjectPolicy(
        projectRoot,
        projectType,
        selectedEngines,
        existingProfile,
    );
    writeInstallInfo(projectRoot, projectType, selectedEngines);
    console.log(`[설치 완료] ${PACKAGE.name} v${PACKAGE.version} 적용 완료 · 공통 Agent Skills: ${installedSkills.length}개`);
    console.log('       사용자 커스텀 규칙: .agents/rules/project.md (팀 공통) · .agents/rules/local.md (개인 로컬/Git제외)');

    return {
        skillCount: skills.length,
        targetCount: 1,
        policyFiles: policyTargets.length,
    };
}

function createQuestionReader(rl) {
    const answers = rl[Symbol.asyncIterator]();
    return async (question) => {
        rl.output.write(question);
        const { value, done } = await answers.next();
        if (done) {
            throw new Error('입력이 완료되기 전에 종료되었습니다.');
        }
        return value;
    };
}

async function runCli({
    input = process.stdin,
    output = process.stdout,
    projectRoot = process.cwd(),
    synchronize = synchronizeSkills,
} = {}) {
    const rl = readline.createInterface({ input, output });
    const ask = createQuestionReader(rl);
    try {
        console.log('\n==================================================================');
        console.log('Universal AI-Agent Dev Initializer');
        console.log('==================================================================');
        console.log('\n프로젝트 유형을 선택하세요.');
        console.log('1) 신규 프로젝트');
        console.log('2) 기존 프로젝트');

        const projectAnswer = await ask('\n번호 입력 (1 또는 2): ');
        const projectType = parseProjectType(projectAnswer);

        console.log('\n활성화할 AI 엔진을 선택하세요 (복수 선택 가능).');
        console.log('1) Codex');
        console.log('2) Gemini/Antigravity');

        const answer = await ask('\n번호 입력 (1, 2 또는 1,2): ');
        const selectedEngines = parseSelectedEngines(answer);
        const result = await synchronize(projectRoot, selectedEngines, projectType);
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
    copyDirectory,
    createQuestionReader,
    ensureCustomRuleTemplates,
    findSkillDirectories,
    inspectExistingProject,
    installSkill,
    installProjectPolicy,
    parseProjectType,
    parseSelectedEngines,
    removeStaleManagedSkills,
    renderProjectPolicy,
    runCli,
    synchronizeSkills,
    updateGitignore,
    upsertManagedBlock,
    validateUniqueSkillNames,
};
