#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { checkbox, confirm } = require('@inquirer/prompts');

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

const args = process.argv.slice(2);
let dryRun = false;
let cleanLogs = false;
let uninstall = false;
let targetsRaw = '';
let githubInput = '';

function printVersion() {
  const pkg = require('../package.json');
  console.log(`expcat-skills v${pkg.version}`);
}

function printHelp() {
  console.log(`Usage: expcat-skills [options] <github_path_or_url>

Options:
  -t, --target <list>   Targets: copilot,claude,codex,opencode (comma-separated)
  -d, --dry-run         Preview only, no changes
  -ui, --uninstall      Interactively uninstall installed skills
  --clean-logs          Remove all installer logs
  -v, --version         Show version number
  -h, --help            Show this help

Examples:
  expcat-skills https://github.com/expcat/Tigercat/tree/main/skills/tigercat
  expcat-skills -t copilot,claude expcat/Tigercat/skills/tigercat
  expcat-skills -ui
  expcat-skills --uninstall --dry-run
`);
}

function parseArgs() {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '-t' || a === '--target') {
      targetsRaw = args[i + 1] || '';
      i += 1;
    } else if (a === '-d' || a === '--dry-run') {
      dryRun = true;
    } else if (a === '--clean-logs') {
      cleanLogs = true;
    } else if (a === '-ui' || a === '--uninstall') {
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

function logDirDefault() {
  return path.join(os.homedir(), '.expcat-skills', 'logs');
}

const LOG_DIR = logDirDefault();
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

function logInfo(msg) {
  console.log(`${COLORS.blue}[info]${COLORS.reset} ${msg}`);
  if (LOG_FILE) fs.appendFileSync(LOG_FILE, `[info] ${msg}\n`, 'utf8');
}

function logSuccess(msg) {
  console.log(`${COLORS.green}[success]${COLORS.reset} ${msg}`);
  if (LOG_FILE) fs.appendFileSync(LOG_FILE, `[success] ${msg}\n`, 'utf8');
}

function logWarn(msg) {
  console.log(`${COLORS.yellow}[warn]${COLORS.reset} ${msg}`);
  if (LOG_FILE) fs.appendFileSync(LOG_FILE, `[warn] ${msg}\n`, 'utf8');
}

function logError(msg) {
  console.error(`${COLORS.red}[error]${COLORS.reset} ${msg}`);
  if (LOG_FILE) fs.appendFileSync(LOG_FILE, `[error] ${msg}\n`, 'utf8');
}

// ============ Uninstall Functions ============

function isDirectoryEmpty(dirPath) {
  const entries = fs.readdirSync(dirPath);
  // Filter out hidden files like .DS_Store
  const realFiles = entries.filter((e) => !e.startsWith('.'));
  return realFiles.length === 0;
}

function scanInstalledSkills() {
  const tools = ['copilot', 'claude', 'codex', 'opencode'];
  const results = [];
  for (const tool of tools) {
    const root = getTargetRoot(tool, true);
    if (root && fs.existsSync(root)) {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.')) {
          const skillPath = path.join(root, e.name);
          // Filter out empty directories
          if (!isDirectoryEmpty(skillPath)) {
            results.push({
              tool,
              name: e.name,
              path: skillPath,
            });
          }
        }
      }
    }
  }
  return results;
}

async function runUninstall() {
  logInfo('Scanning installed skills...');
  const skills = scanInstalledSkills();

  if (skills.length === 0) {
    logWarn('No installed skills found.');
    process.exit(0);
  }

  const selected = await checkbox({
    message: 'Select skills to uninstall:',
    choices: skills.map((s) => ({
      name: `${s.tool} / ${s.name} (${s.path.replace(os.homedir(), '~')})`,
      value: s,
    })),
  });

  if (selected.length === 0) {
    logWarn('No skills selected.');
    process.exit(0);
  }

  console.log('\nSelected for removal:');
  for (const s of selected) {
    console.log(`  - ${s.path.replace(os.homedir(), '~')}`);
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
      logSuccess(`Deleted: ${s.path.replace(os.homedir(), '~')}`);
    }
  }

  logInfo('Uninstall complete.');
}

function requireGit() {
  const result = spawnSync('git', ['--version'], { stdio: 'ignore' });
  if (result.status !== 0) {
    logError('Missing required command: git');
    process.exit(1);
  }
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

function cloneRepo(owner, repo, ref, dest) {
  const res = spawnSync(
    'git',
    [
      'clone',
      '--depth',
      '1',
      '--filter=blob:none',
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
      .filter((e) => e.isDirectory())
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

async function selectTargets() {
  const choices = ['copilot', 'claude', 'codex', 'opencode'];
  if (targetsRaw) return targetsRaw;

  const selected = await checkbox({
    message: 'Select install targets:',
    choices: choices.map((t) => ({ name: t, value: t })),
    required: true,
  });

  if (!selected.length) {
    logError('No targets selected');
    process.exit(1);
  }
  return selected.join(',');
}

function getTargetRoot(tool, silent = false) {
  const home = os.homedir();
  switch (tool) {
    case 'claude':
      return path.join(home, '.claude', 'skills');
    case 'copilot':
      return path.join(home, '.copilot', 'skills');
    case 'codex':
      return path.join(home, '.codex', 'skills');
    case 'opencode':
      return path.join(home, '.opencode', 'skills');
    default:
      if (!silent) {
        logError(`Unknown target: ${tool}`);
        process.exit(1);
      }
      return null;
  }
}

async function confirmPreview(preview) {
  console.log('\nPreview:');
  console.log(preview);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rlPrompt(rl, 'Proceed? [y/N] ');
  rl.close();
  return /^y$/i.test(answer);
}

async function handleConflict(dest) {
  if (!fs.existsSync(dest)) return '';

  console.log(`Target exists: ${dest}`);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const action = await rlPrompt(rl, 'Overwrite (o) / Rename (r) ? [r] ');
  if (!action || /^r$/i.test(action)) {
    const newName = await rlPrompt(rl, 'New name: ');
    rl.close();
    if (!newName) {
      logError('Name cannot be empty');
      process.exit(1);
    }
    return newName;
  }
  if (/^o$/i.test(action)) {
    rl.close();
    return '__overwrite__';
  }
  rl.close();
  logWarn('Invalid choice');
  return handleConflict(dest);
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

  if (uninstall) {
    await runUninstall();
    process.exit(0);
  }

  if (!githubInput) {
    printHelp();
    process.exit(1);
  }

  requireGit();
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
  cloneRepo(owner, repo, ref, tmpDir);

  let basePath = tmpDir;
  if (subpath) basePath = path.join(tmpDir, subpath);

  const selectedDir = await selectDirectoryStepwise(basePath);
  if (!fs.existsSync(selectedDir) || !fs.statSync(selectedDir).isDirectory()) {
    logError(`Selected path not found: ${selectedDir}`);
    process.exit(1);
  }

  const skillName = path.basename(selectedDir);
  const targets = await selectTargets();

  let preview = '';
  const tList = targets.split(',');
  for (const t of tList) {
    const root = getTargetRoot(t);
    const dest = path.join(root, skillName);
    preview += `- ${t} -> ${dest}${fs.existsSync(dest) ? ' (conflict)' : ''}\n`;
  }

  const ok = await confirmPreview(preview);
  if (!ok) {
    logWarn('Cancelled by user');
    process.exit(1);
  }

  for (const t of tList) {
    const root = getTargetRoot(t);
    await copySkill(selectedDir, root, skillName);
  }

  logInfo(`Done. Log saved: ${LOG_FILE}`);
}

main().catch((err) => {
  logError(err?.message || String(err));
  process.exit(1);
});
