#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { checkbox, confirm, select, input } = require('@inquirer/prompts');

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function tildify(p) {
  return p.replace(os.homedir(), '~');
}

function makeLogger(level, color, stream = console.log) {
  return (msg) => {
    stream(`${color}[${level}]${COLORS.reset} ${msg}`);
    if (LOG_FILE) fs.appendFileSync(LOG_FILE, `[${level}] ${msg}\n`, 'utf8');
  };
}

const args = process.argv.slice(2);
let dryRun = false;
let cleanLogs = false;
let cleanSkills = false;
let cleanMapping = false;
let uninstall = false;
let listSkills = false;
let globalInstall = false;
let githubInput = '';

function printVersion() {
  const pkg = require('../package.json');
  console.log(`expcat-skills v${pkg.version}`);
}

function printHelp() {
  console.log(`Usage: expcat-skills [options] <github_path_or_url>

Options:
  -g, --global          Install/uninstall to ~/.agents/skills (default: ./.agents/skills)
  -d, --dry-run         Preview only, no changes
  -l, --list            List installed skills
  -u, --uninstall       Interactively uninstall installed skills
  --clean-mapping       Remove tool directory symlinks (copilot/claude/codex/opencode/gemini)
  --clean-logs          Remove all installer logs
  --clean-skills        Remove empty skills directories
  -v, --version         Show version number
  -h, --help            Show this help

Examples:
  expcat-skills https://github.com/expcat/Tigercat/tree/main/skills/tigercat
  expcat-skills -g https://github.com/expcat/Tigercat/tree/main/skills/tigercat
  expcat-skills -l                 # list skills in ./.agents/skills
  expcat-skills -l -g              # list skills in ~/.agents/skills
  expcat-skills -u                 # uninstall from ./.agents/skills
  expcat-skills -u -g              # uninstall from ~/.agents/skills
  expcat-skills --clean-mapping    # remove tool directory symlinks
  expcat-skills --clean-mapping --dry-run
`);
}

function parseArgs() {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '-d' || a === '--dry-run') {
      dryRun = true;
    } else if (a === '--clean-logs') {
      cleanLogs = true;
    } else if (a === '--clean-skills') {
      cleanSkills = true;
    } else if (a === '--clean-mapping') {
      cleanMapping = true;
    } else if (a === '-g' || a === '--global') {
      globalInstall = true;
    } else if (a === '-l' || a === '--list') {
      listSkills = true;
    } else if (a === '-u' || a === '--uninstall') {
      uninstall = true;
    } else if (a === '-v' || a === '--version') {
      printVersion();
      process.exit(0);
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (!githubInput) {
      githubInput = a;
    } else {
      logError(`Unexpected argument: ${a}`);
      process.exit(1);
    }
  }
}

const LOG_DIR = path.join(os.homedir(), '.expcat-skills', 'logs');
let LOG_FILE = '';

function initLog() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date();
  const stamp = ts
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '-');
  LOG_FILE = path.join(LOG_DIR, `install-${stamp}.log`);
  fs.writeFileSync(LOG_FILE, '', 'utf8');

  for (const f of fs.readdirSync(LOG_DIR)) {
    if (
      f.startsWith('install-') &&
      f.endsWith('.log') &&
      f !== path.basename(LOG_FILE)
    ) {
      fs.rmSync(path.join(LOG_DIR, f), { force: true });
    }
  }
}

function purgeLogs() {
  if (fs.existsSync(LOG_DIR)) {
    for (const f of fs.readdirSync(LOG_DIR)) {
      if (f.startsWith('install-') && f.endsWith('.log')) {
        fs.rmSync(path.join(LOG_DIR, f), { force: true });
      }
    }
  }
  console.log(`Logs cleaned: ${LOG_DIR}`);
}

function cleanEmptySkillsDirs() {
  const agentsRoot = getAgentsSkillsRoot(globalInstall);
  if (!fs.existsSync(agentsRoot)) {
    logInfo('Skills directory not found. Nothing to clean.');
    return;
  }

  const emptyDirs = listSkillDirs(agentsRoot, { includeEmpty: true })
    .filter((s) => isDirectoryEmpty(s.path));

  if (emptyDirs.length === 0) {
    logInfo('No empty skills directories found.');
    return;
  }

  for (const s of emptyDirs) {
    if (dryRun) {
      logInfo(`[dry-run] Would remove empty dir: ${s.path}`);
    } else {
      fs.rmSync(s.path, { recursive: true, force: true });
      logSuccess(`Removed empty dir: ${tildify(s.path)}`);
    }
  }
}

const logInfo = makeLogger('info', COLORS.blue);
const logSuccess = makeLogger('success', COLORS.green);
const logWarn = makeLogger('warn', COLORS.yellow);
const logError = makeLogger('error', COLORS.red, console.error);

// ============ Directory Helpers ============

function isDirectoryEmpty(dirPath) {
  const entries = fs.readdirSync(dirPath);
  return entries.filter((e) => !e.startsWith('.')).length === 0;
}

function listSkillDirs(agentsRoot, { includeEmpty = false } = {}) {
  if (!fs.existsSync(agentsRoot)) return [];
  return fs.readdirSync(agentsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, path: path.join(agentsRoot, e.name) }))
    .filter((s) => includeEmpty || !isDirectoryEmpty(s.path))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ============ List / Uninstall ============

function runListSkills() {
  const agentsRoot = getAgentsSkillsRoot(globalInstall);
  const skills = listSkillDirs(agentsRoot);

  if (skills.length === 0) {
    logInfo('No skills installed yet.');
    return;
  }

  const maxLen = Math.max(...skills.map((s) => s.name.length));
  console.log('\nInstalled skills:');
  for (const s of skills) {
    console.log(`  ${s.name.padEnd(maxLen + 2)}${tildify(s.path)}`);
  }
  console.log('');
}

async function runUninstall() {
  logInfo(`Scanning installed skills (${globalInstall ? 'global' : 'local'})...`);
  const skills = listSkillDirs(getAgentsSkillsRoot(globalInstall));

  if (skills.length === 0) {
    logWarn('No installed skills found.');
    process.exit(0);
  }

  const selected = await checkbox({
    message: 'Select skills to uninstall:',
    choices: skills.map((s) => ({
      name: `${s.name} (${tildify(s.path)})`,
      value: s,
    })),
  });

  if (selected.length === 0) {
    logWarn('No skills selected.');
    process.exit(0);
  }

  console.log('\nSelected for removal:');
  for (const s of selected) {
    console.log(`  - ${tildify(s.path)}`);
  }
  console.log('');

  const confirmed = await confirm({
    message: `Confirm deletion of ${selected.length} skill(s)?`,
    default: false,
  });

  if (!confirmed) {
    logWarn('Cancelled by user.');
    process.exit(0);
  }

  for (const s of selected) {
    if (dryRun) {
      logInfo(`[dry-run] Would delete: ${s.path}`);
    } else {
      fs.rmSync(s.path, { recursive: true, force: true });
      logSuccess(`Deleted: ${tildify(s.path)}`);
    }
  }

  logInfo('Uninstall complete.');
}

function requireGit() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    logError('Missing required command: git');
    process.exit(1);
  }
  const match = result.stdout.match(/git version (\d+)\.(\d+)/);
  return match
    ? { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) }
    : { major: 0, minor: 0 };
}

function supportsSparseCheckout(gitVersion) {
  // sparse-checkout command available since Git 2.25
  return gitVersion.major > 2 || (gitVersion.major === 2 && gitVersion.minor >= 25);
}

function normalizeGithubInput(input) {
  return input
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '');
}

function getDefaultBranch(owner, repo) {
  const res = spawnSync(
    'git',
    [
      'ls-remote',
      '--symref',
      `https://github.com/${owner}/${repo}.git`,
      'HEAD',
    ],
    {
      encoding: 'utf8',
    },
  );
  if (res.status === 0) {
    const match = res.stdout.match(/ref: refs\/heads\/([^\s]+)/);
    if (match) return match[1];
  }
  return 'main';
}

function parseGithubParts(input) {
  const normalized = normalizeGithubInput(input);
  const pieces = normalized.split('/');
  const owner = pieces[0];
  const repo = pieces[1];
  if (!owner || !repo) {
    logError(`Invalid GitHub path: ${input}`);
    process.exit(1);
  }

  let ref = '';
  let subpath = '';

  const treeIdx = pieces.indexOf('tree');
  if (treeIdx >= 0 && pieces.length > treeIdx + 1) {
    ref = pieces[treeIdx + 1];
    subpath = pieces.slice(treeIdx + 2).join('/');
  } else {
    subpath = pieces.slice(2).join('/');
  }

  if (!ref) {
    ref = getDefaultBranch(owner, repo);
  }

  return { owner, repo, ref, subpath };
}

function cloneRepoFull(owner, repo, ref, dest) {
  const res = spawnSync(
    'git',
    [
      'clone',
      '--depth',
      '1',
      '--filter=blob:none',
      '--single-branch',
      '--branch',
      ref,
      `https://github.com/${owner}/${repo}.git`,
      dest,
    ],
    {
      stdio: 'ignore',
    },
  );
  if (res.status !== 0) {
    logError('Failed to clone repository');
    process.exit(1);
  }
}

function cloneRepoSparse(owner, repo, ref, subpath, dest) {
  // Initialize empty repo
  let res = spawnSync('git', ['init', dest], { stdio: 'ignore' });
  if (res.status !== 0) return false;

  // Add remote
  res = spawnSync(
    'git',
    ['remote', 'add', 'origin', `https://github.com/${owner}/${repo}.git`],
    { cwd: dest, stdio: 'ignore' },
  );
  if (res.status !== 0) return false;

  // Enable sparse-checkout
  res = spawnSync('git', ['sparse-checkout', 'init', '--cone'], {
    cwd: dest,
    stdio: 'ignore',
  });
  if (res.status !== 0) return false;

  // Set sparse-checkout path
  res = spawnSync('git', ['sparse-checkout', 'set', subpath], {
    cwd: dest,
    stdio: 'ignore',
  });
  if (res.status !== 0) return false;

  // Shallow pull
  res = spawnSync('git', ['pull', '--depth=1', 'origin', ref], {
    cwd: dest,
    stdio: 'ignore',
  });
  if (res.status !== 0) return false;

  return true;
}

function cloneRepo(owner, repo, ref, subpath, dest, gitVersion) {
  // Try sparse-checkout if subpath exists and Git supports it
  if (subpath && supportsSparseCheckout(gitVersion)) {
    logInfo('Using sparse-checkout to minimize download...');
    const success = cloneRepoSparse(owner, repo, ref, subpath, dest);
    if (success) {
      return;
    }
    // Fallback: clean up failed sparse checkout and try full clone
    logWarn('Sparse-checkout failed, falling back to full clone...');
    try {
      fs.rmSync(dest, { recursive: true, force: true });
    } catch {}
  }

  // Full clone (original method with --single-branch)
  cloneRepoFull(owner, repo, ref, dest);
}

function rlPrompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function selectDirectoryStepwise(basePath) {
  let current = basePath;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
      rl.close();
      logError(`Path not found: ${current}`);
      process.exit(1);
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    logInfo(`Current: ${current}`);

    if (dirs.length === 0) {
      rl.close();
      logInfo('No subdirectories. Use this directory.');
      return current;
    }

    console.log('Select a directory to enter:');
    dirs.forEach((d, i) => console.log(`  [${i + 1}] ${d}`));
    console.log('  [.] select current');
    console.log('  [..] up');
    console.log('  [s] skip level (auto-enter if only one)');
    console.log('  [q] quit');

    const choice = await rlPrompt(rl, '> ');
    if (choice === '.' || choice === '') {
      rl.close();
      return current;
    }
    if (choice === '..') {
      if (path.resolve(current) === path.resolve(basePath)) {
        logWarn('Already at base');
      } else {
        current = path.dirname(current);
      }
      continue;
    }
    if (choice.toLowerCase() === 's') {
      if (dirs.length === 1) {
        current = path.join(current, dirs[0]);
      } else {
        logWarn('Cannot skip: multiple directories');
      }
      continue;
    }
    if (choice.toLowerCase() === 'q') {
      rl.close();
      logWarn('Cancelled by user');
      process.exit(1);
    }

    const idx = Number(choice);
    if (Number.isInteger(idx) && idx >= 1 && idx <= dirs.length) {
      current = path.join(current, dirs[idx - 1]);
    } else {
      logWarn('Invalid choice');
    }
  }
}

function getAgentsSkillsRoot(isGlobal) {
  if (isGlobal) {
    return path.join(os.homedir(), '.agents', 'skills');
  }
  return path.resolve('.agents', 'skills');
}

function runCleanMapping() {
  const toolNames = ['copilot', 'claude', 'codex', 'opencode', 'gemini'];
  const home = os.homedir();
  const globalRoot = path.join(home, '.agents', 'skills');
  const removed = [];

  for (const tool of toolNames) {
    const toolSkillsPath = path.join(home, `.${tool}`, 'skills');
    if (!fs.existsSync(toolSkillsPath)) continue;
    try {
      const stat = fs.lstatSync(toolSkillsPath);
      if (!stat.isSymbolicLink()) continue;
      const linkTarget = fs.readlinkSync(toolSkillsPath);
      const resolved = path.isAbsolute(linkTarget)
        ? path.resolve(linkTarget)
        : path.resolve(path.dirname(toolSkillsPath), linkTarget);
      if (path.resolve(resolved) !== path.resolve(globalRoot)) continue;

      if (dryRun) {
        logInfo(`[dry-run] Would remove symlink: ${tildify(toolSkillsPath)}`);
      } else {
        fs.unlinkSync(toolSkillsPath);
        removed.push(toolSkillsPath);
      }
    } catch (err) {
      logWarn(`Failed to check ${toolSkillsPath}: ${err?.message || err}`);
    }
  }

  if (!dryRun) {
    if (removed.length === 0) {
      logInfo('No tool directory symlinks found.');
    } else {
      for (const p of removed) {
        logSuccess(`Removed symlink: ${tildify(p)}`);
      }
    }
  }
}

async function confirmPreview(preview) {
  console.log('\nPreview:');
  console.log(preview);
  return confirm({ message: 'Proceed?', default: false });
}

async function handleConflict(dest) {
  if (!fs.existsSync(dest)) return '';

  logWarn(`Target exists: ${tildify(dest)}`);
  const action = await select({
    message: 'How to resolve?',
    choices: [
      { name: 'Rename', value: 'rename' },
      { name: 'Overwrite', value: 'overwrite' },
    ],
  });
  if (action === 'overwrite') return '__overwrite__';

  const newName = await input({
    message: 'New name:',
    validate: (v) => (v.trim() ? true : 'Name cannot be empty'),
  });
  return newName.trim();
}

async function copySkill(src, destRoot, skillName) {
  fs.mkdirSync(destRoot, { recursive: true });
  let dest = path.join(destRoot, skillName);
  const conflict = await handleConflict(dest);
  if (conflict === '__overwrite__') {
    if (!dryRun) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  } else if (conflict) {
    dest = path.join(destRoot, conflict);
  }

  if (dryRun) {
    logInfo(`[dry-run] Copy ${src} -> ${dest}`);
  } else {
    fs.cpSync(src, dest, { recursive: true });
    logInfo(`Installed: ${dest}`);
  }
}

async function main() {
  parseArgs();

  if (cleanLogs) {
    purgeLogs();
    process.exit(0);
  }

  if (cleanMapping) {
    runCleanMapping();
    process.exit(0);
  }

  if (cleanSkills) {
    cleanEmptySkillsDirs();
    process.exit(0);
  }

  if (listSkills) {
    runListSkills();
    process.exit(0);
  }

  if (uninstall) {
    await runUninstall();
    process.exit(0);
  }

  if (!githubInput) {
    printHelp();
    process.exit(1);
  }

  const gitVersion = requireGit();
  initLog();

  const { owner, repo, ref, subpath } = parseGithubParts(githubInput);
  logInfo(`Repo: ${owner}/${repo} (ref: ${ref})`);
  if (subpath) logInfo(`Path: ${subpath}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expcat-skills-'));
  process.on('exit', () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  logInfo('Downloading repository...');
  cloneRepo(owner, repo, ref, subpath, tmpDir, gitVersion);

  let basePath = tmpDir;
  if (subpath) basePath = path.join(tmpDir, subpath);

  const selectedDir = await selectDirectoryStepwise(basePath);
  if (!fs.existsSync(selectedDir) || !fs.statSync(selectedDir).isDirectory()) {
    logError(`Selected path not found: ${selectedDir}`);
    process.exit(1);
  }

  const skillName = path.basename(selectedDir);
  const agentsRoot = getAgentsSkillsRoot(globalInstall);
  const agentsDest = path.join(agentsRoot, skillName);

  let preview = '';
  const scope = globalInstall ? 'global' : 'local';
  preview += `- scope: ${scope}\n`;
  preview += `- ${skillName} -> ${tildify(agentsDest)}${fs.existsSync(agentsDest) ? ' (conflict)' : ''}\n`;

  const ok = await confirmPreview(preview);
  if (!ok) {
    logWarn('Cancelled by user');
    process.exit(1);
  }

  await copySkill(selectedDir, agentsRoot, skillName);

  // Clean up temporary directory immediately after copying
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    logInfo('Temporary files cleaned up.');
  } catch {}

  logInfo(`Done. Log saved: ${LOG_FILE}`);
  process.exit(0);
}

main().catch((err) => {
  logError(err?.message || String(err));
  process.exit(1);
});
