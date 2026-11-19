const path = require('node:path');
const { expandEngines } = require('./engines');
function parseArguments(args) {
    const result = { command: 'init', profile: 'full', skills: [], json: false, dryRun: false, frozen: false, update: false };
    const commands = ['init', 'status', 'doctor', 'lock', 'validate', 'release-status'];
    let index = 0;
    if (args[0] && !args[0].startsWith('-')) {
        if (!commands.includes(args[0])) throw new Error(`알 수 없는 명령: ${args[0]}`);
        result.command = args[0]; index = 1;
    }
    const values = { '--root': 'root', '--engine': 'engines', '--type': 'projectType', '--profile': 'profile', '--skill': 'skills' };
    for (; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--json') result.json = true;
        else if (arg === '--dry-run') result.dryRun = true;
        else if (arg === '--frozen') result.frozen = true;
        else if (arg === '--update') result.update = true;
        else if (arg === '--help' || arg === '-h') result.help = true;
        else if (arg === '--version' || arg === '-v') result.version = true;
        else if (values[arg]) {
            const value = args[++index];
            if (!value || value.startsWith('-')) throw new Error(`${arg} 값이 필요합니다.`);
            const key = values[arg];
            if (key === 'skills') result.skills.push(value);
            else if (key === 'engines') result.engines = value.split(',');
            else result[key] = value;
        } else throw new Error(`알 수 없는 옵션: ${arg}`);
    }
    if (result.root) result.root = path.resolve(result.root);
    if (!['full', 'bundled'].includes(result.profile)) throw new Error('--profile: full 또는 bundled');
    if (result.projectType && !['new', 'existing'].includes(result.projectType)) throw new Error('--type: new 또는 existing');
    if (result.engines) expandEngines(result.engines);
    if (result.update && result.command !== 'lock') throw new Error('--update는 lock 명령에서만 사용합니다.');
    if (result.frozen && result.update) throw new Error('--frozen과 --update는 함께 사용할 수 없습니다.');
    return result;
}
const HELP = `ai-init [init|status|doctor|lock|validate|release-status] [options]
  --root PATH                 대상 프로젝트 (기본: 현재 폴더)
  --type new|existing         프로젝트 유형, 생략하면 질문
  --engine codex,gemini,antigravity  사용할 제품 (기존 1,2도 허용)
  --profile full|bundled      전체 또는 자체 스킬만 설치
  --skill NAME               추가 외부 스킬 선택 (반복 가능, 자체 스킬은 유지)
  --frozen                   기존 프로젝트 잠금 필수
  --dry-run                  대상 변경 없이 임시 사본에서 설치 검증
  --json                     기계가 읽을 수 있는 결과
  lock --update              외부 ref를 새 commit에 고정 (게시/설치 없음)
  validate --root PATH       스킬 또는 스킬 모음 검사
  release-status             npm 게시 상태 조회 (게시하지 않음)
  --help / --version
`;
module.exports = { parseArguments, HELP };
