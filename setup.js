#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const path = require('path');
const readline = require('readline');
const os = require('os');
const { validateSkill, antigravityRule, validSkillName } = require('./lib/skills');
const { ENGINES, expandEngines, instructionChain, policyPaths, skillTargets } = require('./lib/engines');
const { LOCK_NAME, validateSource, resolveLock, readLock, writeJsonAtomic, snapshotFiles, verifyCachedSource } = require('./lib/source-lock');
const { cloneInstallState, applyInstallationPlan, exists: pathExists } = require('./lib/transaction');
const { buildManifest, status } = require('./lib/diagnostics');
const { CONFIG_NAME, readJson, resolveConfiguration } = require('./lib/configuration');
const { SKILL_ROOTS, readManifest, skillPath, managedSkill, installConflicts, createInstallationPlan, conflictError } = require('./lib/installation-plan');
const policies = require('./lib/policies');
const { parseArguments, HELP } = require('./lib/cli');
const { releaseStatus } = require('./lib/release-status');

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
  3. 확인된 프로젝트 정책으로 공통 기본값을 구체화합니다. 충돌하는 규칙은 출처·영향·권장안을 공유하고 사용자 피드백을 받아 해소합니다. 실행 환경의 상위 지침과 권한은 우회할 수 없습니다.
-->

확인된 항목만 작성하고, 상세 내용은 기존 문서 원본을 링크합니다. 미정 항목이나 관련 없는 분야는 생략합니다. 인증 정보와 비공개 원문은 넣지 않습니다.

## 1. 목적 및 설계 맥락
- 목적·사용자·성공 조건·제외 범위: (승인된 요구사항 원본 링크)
- 주요 모듈의 책임·의존 경계: (기존 구조 문서 링크)
- 유지할 API·데이터·UI 계약: (실제 코드와 계약 문서 링크)
- 중요한 아키텍처 결정: (기존 Markdown ADR 위치와 링크)

## 2. 기술 스택 및 아키텍처
- 언어 및 런타임: (예: Node.js 20+, TypeScript 등)
- 주요 프레임워크/라이브러리: (예: React, Next.js, Express, Spring Boot 등)
- 공통 코어·납품 프로젝트 관계: (해당하는 경우 패키지 경계·호환 버전)
- 개발 연결·납품 버전 정책: (해당하는 경우 로컬 링크·고정 버전과 실제 절차)
- 분야별 기준: (3D 자원 수명·성능 측정·씬별 모드, 디자인 토큰·테마 등 해당 항목의 원본 링크)

## 3. 프로젝트 공통 코딩 컨벤션
- 네이밍 및 코드 스타일: (예: 함수형 컴포넌트 선호, 디렉터리 구조 등)
- 라이브러리 추가 정책: 필요성·대안·영향을 계획에 포함하고, 설치는 승인된 계획이나 명시적 위임 범위에서 수행한다. 합의한 의존성을 바꾸면 먼저 피드백을 받는다.

## 4. 테스트 및 품질 기준
- 변경의 영향·위험에 맞는 실제 검증을 수행한다. 기존 테스트를 활용하고 동작·회귀 위험을 확인할 가치가 있을 때 테스트를 추가한다.
- 실제 타입체크·테스트·빌드·린트 명령: (패키지 설정에서 확인한 명령만 작성)
- 동작·성능 확인 방법과 완료 기준: (실행 환경·측정 조건·요구사항별 기준)
- 미실행·실패한 검증은 사유와 남은 확인을 보고하며, 자가 검토로 대체하지 않는다.
`;

const LOCAL_RULE_TEMPLATE = `# Local / Personal Rules
<!--
  [용도 및 목적]
  이 파일은 개발자 개인의 취향, 작업 스타일 및 AI 답변 방식을 정의하는 개인 전용 프롬프트 공간입니다.

  [특징]
  1. .gitignore에 자동 등록되어 Git에 커밋되지 않으므로 팀원에게 영향을 주지 않고 내 로컬 PC에서만 유지됩니다.
  2. ai-init 재실행이나 버전 업데이트 시에도 기존 내용이 절대 덮어써지지 않고 안전하게 보존됩니다.
  3. 개인 선호로 공통 기본값을 구체화합니다. 프로젝트 정책 등 다른 규칙과 충돌하면 임의로 선택하지 않고 사용자 피드백을 받습니다. 실행 환경의 상위 지침과 권한은 우회할 수 없습니다.
-->

## 1. 개인 작업 및 답변 스타일
- 답변은 불필요한 미사여구를 생략하고 간결한 한국어로 핵심 위주로 보고할 것.
- 복잡한 작업은 목표·영향·대안·검증 방법을 구체화하고, 계획을 바꾸는 판단이나 다른 의견은 먼저 공유해 피드백을 받은 뒤 진행할 것.

## 2. 개인 선호 작업 방식
- 터미널 명령어 제안 시 선호하는 셸(예: PowerShell, bash 등) 환경에 맞출 것.
- 커밋 메시지나 PR 설명 초안을 제안할 때는 간결한 컨벤셔널 커밋 형식을 따를 것.

## 3. 실제 로컬 환경
- OS·셸·실행 위치: (현재 환경에서 확인한 값)
- 소스·외부 에셋·업무 문서 경로: (존재를 확인한 경로만 작성하고 자동 이동하지 않음)
- Windows 네이티브·WSL2 사용 조건: (개인 환경에 해당하는 경우만 작성)
- 환경 문제 기록: (증상·재현 조건·확인 방법·해결 결과의 원본 링크, 인증 정보 제외)
`;

function request(url, responseType = 'text', redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:' || !['api.github.com', 'raw.githubusercontent.com', 'registry.npmjs.org'].includes(parsedUrl.hostname) || parsedUrl.username || parsedUrl.password || (parsedUrl.port && parsedUrl.port !== '443')) {
            reject(new Error('허용되지 않은 다운로드 주소입니다.')); return;
        }
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
                let received = 0;
                response.on('data', (chunk) => {
                    received += chunk.length;
                    if (received > 16 * 1024 * 1024) { response.destroy(new Error('다운로드 파일의 16 MiB 한도를 초과했습니다.')); return; }
                    chunks.push(chunk);
                });
                response.on('error', reject);
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
    if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.includes(':') || /[\x00-\x1f]/.test(relativePath) || path.win32.isAbsolute(relativePath)) throw new Error(`안전하지 않은 원격 파일 경로입니다: ${relativePath}`);
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
    const results = await Promise.allSettled(workers);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
}

async function downloadSource(source, stagingRoot, locked, fetch = request) {
    validateSource(source);
    const treeUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${locked.tree}?recursive=1`;
    const treeResponse = await fetch(treeUrl, 'json');
    if (treeResponse.sha !== locked.tree) throw new Error(`${source.id}: 잠금 tree SHA가 다릅니다 (${locked.tree} / ${treeResponse.sha}).`);

    if (treeResponse.truncated) {
        throw new Error(`${source.id} 저장소 파일 목록이 잘려 안전하게 동기화할 수 없습니다.`);
    }

    const prefix = `${source.skillsPath.replace(/\/$/, '')}/`;
    const files = treeResponse.tree.filter(
        (entry) => entry.type === 'blob' && entry.path.startsWith(prefix),
    );
    const destinations = new Set();
    for (const entry of files) {
        const relative = assertSafeRelativePath(entry.path.slice(prefix.length));
        const key = process.platform === 'win32' ? relative.toLowerCase() : relative;
        if (destinations.has(key)) throw new Error(`중복 다운로드 경로: ${entry.path}`);
        destinations.add(key);
    }
    if (files.length > 2500) throw new Error(`${source.id}: 소스 파일 2500개 한도를 초과했습니다.`);
    if (files.reduce((total, entry) => total + (Number(entry.size) || 0), 0) > 128 * 1024 * 1024) throw new Error(`${source.id}: 소스의 128 MiB 한도를 초과했습니다.`);
    let totalBytes = 0;
    const accountBytes = (content) => {
        totalBytes += content.length;
        if (totalBytes > 128 * 1024 * 1024) throw new Error(`${source.id}: 소스의 128 MiB 한도를 초과했습니다.`);
    };

    if (!files.some((entry) => path.posix.basename(entry.path) === 'SKILL.md')) {
        throw new Error(`${source.id}의 ${source.skillsPath}에서 SKILL.md를 찾지 못했습니다.`);
    }

    await mapWithConcurrency(files, 6, async (entry) => {
        const relativePath = assertSafeRelativePath(entry.path.slice(prefix.length));
        const destination = path.join(stagingRoot, relativePath);
        const rawPath = entry.path.split('/').map(encodeURIComponent).join('/');
        if (entry.mode === '120000') throw new Error(`외부 소스의 심볼릭 링크는 지원하지 않습니다: ${entry.path}`);
        const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${locked.commit}/${rawPath}`;
        const content = await fetch(rawUrl, 'buffer');
        accountBytes(content);
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
        const legalEntry = treeResponse.tree.find((entry) => entry.path === legalFile && entry.type === 'blob' && entry.mode !== '120000');
        if (!legalEntry) throw new Error(`${source.id}: 잠금 소스에 라이선스 파일이 없습니다: ${legalFile}`);
        const legalUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${locked.commit}/${legalFile}`;
        const content = await fetch(legalUrl, 'buffer');
        accountBytes(content);
        const hash = crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content])).digest('hex');
        if (hash !== legalEntry.sha) throw new Error(`라이선스 Git blob SHA가 다릅니다: ${legalFile}`);
        fs.writeFileSync(path.join(stagingRoot, `_UPSTREAM_${path.basename(safeLegalFile)}`), content);
    }

    fs.writeFileSync(
        path.join(stagingRoot, '_SOURCE.json'),
        `${JSON.stringify(
            {
                repository: `https://github.com/${source.owner}/${source.repo}`,
                requestedRef: source.ref,
                resolvedCommitSha: locked.commit,
                resolvedTreeSha: treeResponse.sha,
                files: snapshotFiles(stagingRoot),
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

async function syncSource(source, sourcesRoot, locked, options = {}) {
    const log = options.log || console.log;
    const sourceRoot = path.join(sourcesRoot, source.id);
    const stagingRoot = `${sourceRoot}.staging-${process.pid}`;
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.mkdirSync(stagingRoot, { recursive: true });

    log(`[동기화 중] ${source.owner}/${source.repo}`);
    try {
        await downloadSource(source, stagingRoot, locked, options.request || request);
        for (const directory of findSkillDirectories(stagingRoot)) validateSkill(directory);
        replaceDirectory(stagingRoot, sourceRoot);
        log(`[동기화 완료] ${source.owner}/${source.repo}`);
    } catch (error) {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        if (!fs.existsSync(sourceRoot)) {
            throw error;
        }
        verifyCachedSource(sourceRoot, locked);
        log(`[경고] ${source.id} 동기화 실패: ${error.message}`);
        log('       잠금 SHA와 무결성이 일치하는 마지막 로컬 버전을 사용합니다.');
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

function installSkill(skill, targetRoot, log = console.log) {
    if (!validSkillName(skill.name)) throw new Error(`안전하지 않은 스킬 이름: ${skill.name}`);
    const destination = path.join(targetRoot, skill.name);
    const existingMarker = fs.existsSync(destination) ? readManagedMarker(destination) : null;

    if (pathExists(destination) && (existingMarker?.managedBy !== USER_AGENT || existingMarker?.sourceId !== skill.sourceId)) {
        log(`[보존] 기존 사용자 스킬과 이름이 겹쳐 건너뜁니다: ${destination}`);
        return false;
    }

    const marker = {
        managedBy: USER_AGENT,
        sourceId: skill.sourceId,
        repository: skill.repository,
    };
    const resolvedTarget = path.resolve(targetRoot), resolvedDestination = path.resolve(destination);
    if (path.dirname(resolvedDestination) !== resolvedTarget) throw new Error('스킬 설치 경로가 대상 밖입니다.');
    fs.rmSync(resolvedDestination, { recursive: true, force: true });
    copyDirectory(skill.directory, destination);
    fs.writeFileSync(path.join(destination, MANAGED_MARKER), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    for (const legalFile of skill.legalFiles || []) fs.copyFileSync(legalFile.path, path.join(destination, legalFile.fileName));
    return true;
}

function removeStaleManagedSkills(targetRoot, activeSkillNames, log = console.log) {
    const indexPath = path.join(targetRoot, '.ai-init-managed.json');
    let previousSkillNames = [];
    try {
        previousSkillNames = JSON.parse(fs.readFileSync(indexPath, 'utf8')).skills || [];
    } catch (error) {
        previousSkillNames = [];
    }

    for (const skillName of previousSkillNames) {
        if (!validSkillName(skillName)) throw new Error('관리 목록에 안전하지 않은 스킬 이름이 있습니다.');
        if (activeSkillNames.has(skillName)) {
            continue;
        }
        const destination = path.join(targetRoot, skillName);
        const marker = fs.existsSync(destination) ? readManagedMarker(destination) : null;
        if (marker?.managedBy === USER_AGENT) {
            fs.rmSync(destination, { recursive: true, force: true });
            log(`[정리] upstream에서 제거된 관리 스킬: ${destination}`);
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
    if (selectedEngines.length === 0 || selectedEngines.some((engine) => !['1', '2', '3', '4'].includes(engine))) {
        throw new Error('활성화할 AI 엔진 번호로 1, 2, 3, 4 또는 쉼표로 복수 선택을 입력하세요.');
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
    return policies.renderProjectPolicy(projectType);
}

function upsertDelimitedBlock(filePath, block, startMarker, endMarker) {
    policies.upsertDelimitedBlock(filePath, block, startMarker, endMarker);
}

function upsertManagedBlock(filePath, block) {
    upsertDelimitedBlock(filePath, block, MANAGED_BLOCK_START, MANAGED_BLOCK_END);
}

function updateGitignore(projectRoot, installedSkills = []) {
    const entries = [
        '/.ai-core/',
        '/.agents/rules/jobkim.md',
        '/.agents/rules/local.md',
        '/CLAUDE.local.md',
        '/.claude/settings.local.json',
        ...[...new Set(installedSkills.map((skill) => path.posix.dirname(skill.path)))].map((directory) => `/${directory}/.ai-init-managed.json`),
        ...installedSkills.map((skill) => `/${skill.path}/`),
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
            fs.writeFileSync(filePath, antigravityRule(template), 'utf8');
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
        '.claude/CLAUDE.md',
        'CLAUDE.local.md',
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
        instructionChain: instructionChain(projectRoot),
        customInstructions: existingFiles(['.codex/Codex.md']),
        instructionsToRead: existingFiles(instructionCandidates),
        configurationFiles: existingFiles(configurationCandidates),
        topLevelDirectories,
    };
}

function installProjectPolicy(projectRoot, projectType, selectedEngines, existingProfile) {
    const policyTargets = policies.installPolicies(projectRoot, projectType, selectedEngines);

    if (projectType === 'existing') {
        const profilePath = path.join(projectRoot, '.ai-core', 'project-profile.json');
        fs.mkdirSync(path.dirname(profilePath), { recursive: true });
        fs.writeFileSync(profilePath, `${JSON.stringify(existingProfile, null, 2)}\n`, 'utf8');
    }
    return policyTargets;
}

function writeInstallInfo(projectRoot, projectType, selectedEngines, options = {}) {
    const destination = path.join(projectRoot, '.ai-core', 'install-info.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporaryPath = `${destination}.${crypto.randomUUID()}.tmp`;
    const information = {
        package: PACKAGE.name,
        version: PACKAGE.version,
        appliedAt: new Date().toISOString(),
        projectType,
        engines: selectedEngines.map((engine) => engine === '1' ? 'Codex' : engine === '2' ? 'Gemini/Antigravity' : ENGINES[engine]?.label || engine),
        engineIds: expandEngines(selectedEngines),
        skills: options.skills || [],
        profile: options.profile || 'full',
    };
    try {
        fs.writeFileSync(temporaryPath, `${JSON.stringify(information, null, 2)}\n`, 'utf8');
        fs.renameSync(temporaryPath, destination);
    } finally {
        fs.rmSync(temporaryPath, { force: true });
    }
}

async function synchronizeSkills(projectRoot, selectedEngines, projectType = 'existing', options = {}) {
    expandEngines(selectedEngines);
    if (!['new', 'existing'].includes(projectType)) throw new Error('프로젝트 유형: new 또는 existing');
    if (!['full', 'bundled'].includes(options.profile || 'full')) throw new Error('설치 프로필: full 또는 bundled');
    projectRoot = path.resolve(projectRoot);
    const previous = readManifest(projectRoot);
    const conflicts = installConflicts(projectRoot, previous);
    if (conflicts.length) {
        if (options.dryRun) return { dryRun: true, ready: false, skillCount: 0, policyFiles: 0, changes: [], conflicts };
        throw conflictError(conflicts);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-stage-'));
    try {
        const baseline = path.join(temporary, 'baseline'), staged = path.join(temporary, 'prepared');
        fs.mkdirSync(baseline);
        fs.mkdirSync(staged);
        cloneInstallState(projectRoot, baseline);
        cloneInstallState(baseline, staged);
        const existingProfile = projectType === 'existing' ? inspectExistingProject(projectRoot) : null;
        const result = await install(staged, selectedEngines, projectType, { ...options, previous, existingProfile });
        const plan = createInstallationPlan(baseline, staged, result.resources, projectRoot);
        const response = { ...result, resources: undefined, dryRun: Boolean(options.dryRun), ready: true, changes: plan.changes, conflicts: [], runtimeVerified: false };
        if (!options.dryRun) {
            await applyInstallationPlan(projectRoot, staged, plan);
            (options.log || console.log)(`[설치 완료] ${PACKAGE.name} v${PACKAGE.version} · 스킬 ${result.skillCount}개 / 설치본 ${result.installedCopies}개 · 정책 ${result.policyFiles}개`);
        } else response.note = '임시 사본에서 준비·검증했습니다. 변경 목록에는 구성·잠금·캐시·템플릿·설치 기록도 포함합니다. 대상 프로젝트와 스킬 코드는 실행·변경하지 않았습니다.';
        return response;
    } catch (error) {
        if (options.dryRun && error.conflicts) return { dryRun: true, ready: false, skillCount: 0, policyFiles: 0, changes: [], conflicts: error.conflicts };
        throw error;
    } finally {
        if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('ai-init-stage-')) throw new Error('임시 설치 폴더 경계 오류');
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}

function prepareSkill(skill, sourcesRoot, engines = ['codex']) {
    const validation = validateSkill(skill.directory, path.basename(skill.directory), engines);
    if (!validSkillName(skill.name)) throw new Error(`올바르지 않은 설치 스킬 이름: ${skill.name}`);
    if (skill.name === validation.name && !(validation.explicitOnly && engines.some((engine) => ['codex', 'claude'].includes(engine)))) return { ...skill, validation, transformations: [] };
    const derived = path.join(sourcesRoot, '.derived', engines.join('-'), skill.sourceId, skill.name);
    fs.rmSync(derived, { recursive: true, force: true });
    copyDirectory(skill.directory, derived);
    const file = path.join(derived, 'SKILL.md');
    const { document, body } = require('./lib/skills').frontmatter(fs.readFileSync(file, 'utf8'), file);
    document.set('name', skill.name);
    const transformations = [];
    if (skill.name !== validation.name) transformations.push('name');
    for (const engine of engines) {
        const transformation = ENGINES[engine].adaptSkill?.({ directory: derived, document, explicitOnly: validation.explicitOnly });
        if (transformation) transformations.push(transformation);
    }
    fs.writeFileSync(file, `---\n${document.toString()}---\n${body}`, 'utf8');
    return { ...skill, directory: derived, validation: validateSkill(derived, skill.name, engines), transformations };
}

async function install(projectRoot, selectedEngines, projectType, options) {
    const log = options.log || console.log;
    const externalSources = options.profile === 'bundled' ? [] : SKILL_SOURCES;
    const lock = readLock(projectRoot, __dirname, externalSources, options.frozen);
    const sourcesRoot = path.join(projectRoot, '.ai-core', 'sources');
    fs.mkdirSync(sourcesRoot, { recursive: true });

    const skillGroups = [syncBundledSkills(sourcesRoot)];
    for (const source of externalSources) {
        skillGroups.push(await syncSource(source, sourcesRoot, lock.sources.find((entry) => entry.id === source.id), options));
    }
    const requested = options.skills || [];
    const available = skillGroups.flat();
    for (const name of requested) if (!available.some((skill) => skill.name === name)) throw new Error(`존재하지 않는 선택 스킬: ${name}`);
    const skills = available.filter((skill) => skill.sourceId === 'jobkim' || !requested.length || requested.includes(skill.name));
    validateUniqueSkillNames(skills);
    const installedSkills = [];
    const resources = ['.ai-core/sources', '.ai-core/install-info.json', '.ai-core/install-manifest.json', '.ai-core/project-profile.json', CONFIG_NAME, LOCK_NAME, '.gitignore', '.agents/rules/project.md', '.agents/rules/local.md'];
    const conflicts = [];
    const derivedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-init-derived-'));
    try {
        for (const target of skillTargets(selectedEngines)) {
            const targetDirectory = path.join(projectRoot, target.directory);
            fs.mkdirSync(targetDirectory, { recursive: true });
            for (const source of skills) {
                const relative = `${target.directory}/${source.name}`;
                if (pathExists(path.join(projectRoot, relative)) && !managedSkill(projectRoot, relative, source.sourceId)) {
                    conflicts.push({ path: relative, message: '같은 이름의 사용자 스킬이 있습니다. 사용자 스킬을 보존하며 적용을 보류합니다.' });
                    continue;
                }
                if (pathExists(path.join(projectRoot, relative)) && !options.previous?.skills.some((old) => skillPath(old, options.previous.schemaVersion) === relative)) {
                    conflicts.push({ path: relative, message: '기존 관리 스킬의 무결성 기록이 없습니다. 원본을 별도 보관하고 해당 설치 경로를 비운 뒤 재설치하세요.' });
                    continue;
                }
                const skill = prepareSkill(source, derivedRoot, target.engines);
                for (const warning of skill.validation.warnings) log(`[검토] ${skill.name}: ${warning}`);
                installSkill(skill, targetDirectory, log);
                installedSkills.push({ ...skill, path: relative, engines: target.engines });
                resources.push(relative);
            }
            const index = `${target.directory}/.ai-init-managed.json`;
            const existingIndex = readJson(projectRoot, index);
            if (existingIndex && existingIndex.managedBy !== USER_AGENT) conflicts.push({ path: index, message: '다른 소유자의 스킬 인덱스입니다. 기존 파일을 보존하며 적용을 보류합니다.' });
            else writeJsonAtomic(path.join(projectRoot, index), { managedBy: USER_AGENT, skills: skills.map((skill) => skill.name).sort() });
            resources.push(index);
        }
    } finally {
        if (path.dirname(derivedRoot) !== path.resolve(os.tmpdir())) throw new Error('파생본 폴더 경계 오류');
        fs.rmSync(derivedRoot, { recursive: true, force: true });
    }
    if (conflicts.length) throw conflictError(conflicts);
    for (const old of options.previous?.skills || []) {
        const relative = skillPath(old, options.previous.schemaVersion);
        if (installedSkills.some((skill) => skill.path === relative)) continue;
        const destination = path.resolve(projectRoot, relative);
        if (path.relative(projectRoot, destination).startsWith('..')) throw new Error('스킬 정리 경로 오류');
        fs.rmSync(destination, { recursive: true, force: true });
        resources.push(relative);
    }
    for (const directory of SKILL_ROOTS) {
        if (installedSkills.some((skill) => skill.path.startsWith(`${directory}/`))) continue;
        const index = `${directory}/.ai-init-managed.json`;
        let previousIndex;
        try { previousIndex = readJson(projectRoot, index); } catch { continue; }
        if (previousIndex?.managedBy === USER_AGENT) { fs.unlinkSync(path.join(projectRoot, index)); resources.push(index); }
    }
    ensureCustomRuleTemplates(projectRoot);
    updateGitignore(projectRoot, installedSkills);
    const priorPolicies = options.previous?.policies || Object.keys(options.previous?.files || {}).filter((file) => policies.POLICY_PATHS.includes(file)).map((file) => ({ path: file, created: false }));
    const desiredPolicies = policyPaths(projectRoot, selectedEngines);
    const policyOrigins = desiredPolicies.map((file) => ({ path: file, created: priorPolicies.find((entry) => entry.path === file)?.created ?? !fs.existsSync(path.join(projectRoot, file)) }));
    for (const record of priorPolicies) {
        if (desiredPolicies.includes(record.path)) continue;
        policies.removePolicyBlock(projectRoot, record);
        resources.push(record.path);
    }
    const policyTargets = installProjectPolicy(
        projectRoot,
        projectType,
        selectedEngines,
        options.existingProfile,
    );
    resources.push(...desiredPolicies);
    if (projectType === 'new' && pathExists(path.join(projectRoot, '.ai-core/project-profile.json'))) fs.unlinkSync(path.join(projectRoot, '.ai-core/project-profile.json'));
    writeJsonAtomic(path.join(projectRoot, LOCK_NAME), lock);
    writeJsonAtomic(path.join(projectRoot, CONFIG_NAME), resolveConfiguration(null, { engines: selectedEngines, projectType, profile: options.profile, skills: options.skills }));
    const manifest = buildManifest(projectRoot, installedSkills, policyTargets, { sources: lock.sources.filter((entry) => externalSources.some((source) => source.id === entry.id)) }, options.profile || 'full', expandEngines(selectedEngines), policyOrigins);
    writeJsonAtomic(path.join(projectRoot, '.ai-core', 'install-manifest.json'), manifest);
    writeInstallInfo(projectRoot, projectType, selectedEngines, options);
    return {
        skillCount: skills.length,
        installedCopies: installedSkills.length,
        targetCount: skillTargets(selectedEngines).length,
        policyFiles: policyTargets.length,
        engines: expandEngines(selectedEngines),
        resources,
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
    args = process.argv.slice(2),
    fetch = request,
} = {}) {
    let rl;
    try {
        const options = parseArguments(args);
        if (options.help) { output.write(HELP); return; }
        if (options.version) { output.write(`${PACKAGE.version}\n`); return; }
        projectRoot = options.root || projectRoot;
        const emit = (value) => output.write(`${JSON.stringify(value, null, 2)}\n`);
        if (options.command === 'status' || options.command === 'doctor') {
            const result = status(projectRoot, PACKAGE, SKILL_SOURCES);
            if (options.json) emit(result);
            else {
                output.write(`${result.package}: 설치 ${result.installation?.version || '없음'} / CLI ${result.cliVersion}\n`);
                for (const issue of result.issues) output.write(`[${issue.severity}] ${issue.path || ''} ${issue.message}\n`);
            }
            if (options.command === 'doctor' && !result.healthy) process.exitCode = 1;
            return result;
        }
        if (options.command === 'release-status') { const result = await releaseStatus(PACKAGE, fetch); emit(result); return result; }
        if (options.command === 'lock') {
            const lock = options.update ? await resolveLock(SKILL_SOURCES, fetch) : readLock(projectRoot, __dirname, SKILL_SOURCES, options.frozen);
            if (!options.dryRun) writeJsonAtomic(path.join(projectRoot, LOCK_NAME), lock);
            emit({ dryRun: options.dryRun, lock }); return lock;
        }
        if (options.command === 'validate') {
            const root = options.root || path.join(__dirname, 'bundled-skills');
            const directories = fs.existsSync(path.join(root, 'SKILL.md')) ? [root] : findSkillDirectories(root);
            const results = directories.map((directory) => {
                try { return { directory, valid: true, ...validateSkill(directory, path.basename(directory), options.engines ? expandEngines(options.engines) : []) }; }
                catch (error) { return { directory, valid: false, error: error.message }; }
            });
            const valid = results.length > 0 && results.every((item) => item.valid);
            emit({ valid, skills: results });
            if (!valid) process.exitCode = 1;
            return results;
        }
        const saved = null;
        const interactive = args.length === 0 || (!options.json && !options.projectType && !saved) || (!options.json && !options.engines && !options.addEngines && !saved);
        if (interactive) {
            rl = readline.createInterface({ input, output });
            const ask = createQuestionReader(rl);
            if (!options.projectType && !saved) {
                output.write('\n프로젝트 유형\n1) 신규 프로젝트\n2) 기존 프로젝트\n');
                options.projectType = parseProjectType(await ask('번호 입력: '));
            }
            if (!options.engines && !options.addEngines) {
                const current = saved ? saved.engines.map((engine) => ENGINES[engine].label).join(', ') : null;
                output.write(`\n사용할 AI — 복수 선택 가능${current ? `\n현재 선택: ${current} (Enter로 유지)` : ''}\n1) Codex\n2) Gemini CLI / Antigravity\n3) Claude Code\n4) 전체 선택\n`);
                const answer = await ask('번호 입력: ');
                if (answer.trim() || !saved) options.engines = parseSelectedEngines(answer);
            }
        }
        if ((!options.projectType && !saved) || (!options.engines && !options.addEngines && !saved)) throw new Error('첫 비대화형 설치에는 --type과 --engine을 지정하세요.');
        const config = resolveConfiguration(saved, options);
        const installOptions = { ...options, ...config, request: fetch, log: (message) => (options.json ? process.stderr : output).write(`${message}\n`) };
        const result = await synchronize(projectRoot, config.engines, config.projectType, installOptions);
        if (options.json) emit(result);
        else {
            output.write(`\n${options.dryRun ? '미리보기' : '적용'}: 스킬 ${result.skillCount}개, 정책 ${result.policyFiles}개\n`);
            for (const change of result.changes || []) output.write(`[${change.action}] ${change.path}\n`);
            for (const conflict of result.conflicts || []) output.write(`[충돌] ${conflict.path}: ${conflict.message}\n`);
            if (result.ready !== false) output.write(`다음 단계: 새 에이전트 세션을 시작하세요.${config.engines.includes('claude') ? ' Claude Code: claude (미설치 시 README의 설치 안내 참고)' : ''}\n`);
        }
        if (result.ready === false) process.exitCode = 1;
        return result;
    } catch (error) {
        if (args.includes('--json')) output.write(`${JSON.stringify({ error: error.message, ...(error.conflicts ? { conflicts: error.conflicts } : {}) })}\n`);
        else console.error(`\n[오류] ${error.message}\n`);
        process.exitCode = 1;
    } finally {
        rl?.close();
    }
}

if (require.main === module) {
    runCli();
}

module.exports = {
    request,
    downloadSource,
    syncSource,
    prepareSkill,
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
