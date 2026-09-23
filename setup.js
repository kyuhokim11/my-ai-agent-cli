#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

console.log('\n==================================================================');
console.log('Agnostic Multi-AI & Cross-Platform 프로젝트 초기화 엔진');
console.log('==================================================================');

// 1. 공용 마크다운 저장소 경로 정의
const coreSkillsDir = path.join(__dirname, '.ai-core', 'skills');
const baseRulesPath = path.join(__dirname, '.ai-core', 'base-rules.md');

console.log('\n[STEP 1. 프로젝트 단계를 선택하세요]');
console.log('1) 신규 프로젝트 (완전 처음 시작)');
console.log('2) 기존 프로젝트 클론 (이미 다른 컴퓨터에서 작업하던 저장소)');

rl.question('\n번호 입력 (1~2): ', (projectChoice) => {
    console.log('\n[STEP 2. 이 컴퓨터에서 현재 활성화할 AI 엔진을 골라주세요]');
    console.log('1) Codex (OpenAI Codex CLI 전용 폴더 빌드)');
    console.log('2) Gemini (Antigravity 환경 등 범용 마크다운 가이드 빌드)');

    rl.question('\n번호 입력 (1~2): ', (aiChoice) => {
        // AI 도구별 대상 가상 경로 매핑
        let targetAgentDir = '';
        let engineName = '';

        if (aiChoice === '1') {
            targetAgentDir = path.join(process.cwd(), '.agents', 'skills');
            engineName = 'Codex CLI';
        } else if (aiChoice === '2') {
            targetAgentDir = path.join(process.cwd(), '.antigravity', 'skills');
            engineName = 'Gemini (Antigravity)';
        }

        if (targetAgentDir) {
            const parentDir = path.dirname(targetAgentDir);

            // 타겟 부모 폴더 강제 생성
            fs.mkdirSync(parentDir, { recursive: true });

            // 기존에 연결되어 있던 가상 폴더나 깨진 링크 초기화
            if (fs.existsSync(targetAgentDir)) {
                fs.rmSync(targetAgentDir, { recursive: true, force: true });
            }

            try {
                // OS 환경 분기하여 가상 연결(심볼릭 링크) 생성
                const isWin = process.platform === 'win32';
                // 윈도우 관리자 권한 제한 대응을 위해 junction 옵션 사용, 맥북은 일반 dir 매핑
                fs.symlinkSync(coreSkillsDir, targetAgentDir, isWin ? 'junction' : 'dir');
                console.log(`\n[OS 동기화 완료] .ai-core/skills -> ${targetAgentDir} 링크 연결.`);
            } catch (symErr) {
                // 회사 PC 등 보안 문제로 심볼릭 링크 실패 시 안전하게 폴더 강제 복사(Fallback)
                console.log('\n[안내] 시스템 보안 권한 제한으로 인해 동적 파일 복사 방식으로 전환합니다.');
                fs.cpSync(coreSkillsDir, targetAgentDir, { recursive: true });
            }

            // 기본 공용 규칙(base-rules.md)도 AI가 상시 인지할 수 있도록 해당 에이전트 폴더에 배치
            if (fs.existsSync(baseRulesPath)) {
                fs.copyFileSync(baseRulesPath, path.join(parentDir, 'base-rules.md'));
            }
        }

        console.log('\n==================================================================');
        console.log(`세팅 완료! [${engineName}] 엔진이 프로젝트 규칙에 바인딩되었습니다.`);
        console.log('==================================================================\n');
        rl.close();
    });
});
