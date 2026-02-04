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
let cleanSkills = false;
let uninstall = false;
let githubInput = '';
const TOOLS = ['copilot', 'claude', 'codex', 'opencode', 'gemini'];

function printVersion() {
  const pkg = require('../package.json');
  console.log(`expcat-skills v${pkg.version}`);
}

function printHelp() {
  console.log(`Usage: expcat-skills [options] <github_path_or_url>

Options:
  -d, --dry-run         Preview only, no changes
  -ui, --uninstall      Interactively uninstall installed skills
  --clean-logs          Remove all installer logs
  --clean-skills        Remove empty tool skills directories
  -v, --version         Show version number
  -h, --help            Show this help

Examples:
  expcat-skills https://github.com/expcat/Tigercat/tree/main/skills/tigercat
  expcat-skills -ui
  expcat-skills --uninstall --dry-run
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
    } else if (a === '-ui' || a === '--uninstall') {
      uninstall = true;
    } else if (a === '--elevated') {
      process.env.EXPCAT_SKILLS_ELEVATED = '1';
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

function cleanEmptyToolSkillsDirs() {
  const removed = [];
  for (const tool of TOOLS) {
    const skillsPath = getToolSkillsPath(tool, true);
    if (!skillsPath || !fs.existsSync(skillsPath)) continue;
    try {
      if (isDirectoryEmpty(skillsPath)) {
        if (dryRun) {
          logInfo(`[dry-run] Would remove empty dir: ${skillsPath}`);
        } else {
          fs.rmSync(skillsPath, { recursive: true, force: true });
          removed.push(skillsPath);
        }
      }
    } catch (err) {
      logWarn(`Failed to check ${skillsPath}: ${err?.message || err}`);
    }
  }

  if (!dryRun) {
    if (removed.length === 0) {
      logInfo('No empty tool skills directories found.');
    } else {
      for (const p of removed) {
        logSuccess(`Removed empty dir: ${p.replace(os.homedir(), '~')}`);
      }
    }
  }
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
  const tools = TOOLS;
  const results = [];
  for (const tool of tools) {
    const root = getToolSkillsPath(tool, true);
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

function getGitVersion() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (result.status === 0) {
    const match = result.stdout.match(/git version (\d+)\.(\d+)/);
    if (match) {
      return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) };
    }
  }
  return { major: 0, minor: 0 };
}

function supportsSparseCheckout() {
  const version = getGitVersion();
  // sparse-checkout command available since Git 2.25
  return version.major > 2 || (version.major === 2 && version.minor >= 25);
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

function cloneRepo(owner, repo, ref, subpath, dest) {
  // Try sparse-checkout if subpath exists and Git supports it
  if (subpath && supportsSparseCheckout()) {
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
  const choices = getAvailableTargets();
  if (choices.length === 0) {
    logInfo('All targets already mapped. Skip target selection.');
    return [];
  }
  const selected = await checkbox({
    message: 'Select install targets:',
    choices: choices.map((t) => ({ name: t, value: t })),
  });

  return selected;
}

function getAgentsSkillsRoot() {
  return path.join(os.homedir(), '.agents', 'skills');
}

function getToolSkillsPath(tool, silent = false) {
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
    case 'gemini':
      return path.join(home, '.gemini', 'skills');
    default:
      if (!silent) {
        logError(`Unknown target: ${tool}`);
        process.exit(1);
      }
      return null;
  }
}

function getAvailableTargets() {
  return TOOLS.filter((t) => !isSkillsLinked(t));
}

function resolveLinkTarget(linkPath, linkTarget) {
  if (path.isAbsolute(linkTarget)) return path.resolve(linkTarget);
  return path.resolve(path.dirname(linkPath), linkTarget);
}

function isSkillsLinked(tool) {
  const toolSkillsPath = getToolSkillsPath(tool, true);
  if (!toolSkillsPath || !fs.existsSync(toolSkillsPath)) return false;
  try {
    const stat = fs.lstatSync(toolSkillsPath);
    if (!stat.isSymbolicLink()) return false;
    const linkTarget = fs.readlinkSync(toolSkillsPath);
    const resolved = resolveLinkTarget(toolSkillsPath, linkTarget);
    return path.resolve(resolved) === path.resolve(getAgentsSkillsRoot());
  } catch {
    return false;
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psArray(values) {
  return `@(${values.map(psQuote).join(',')})`;
}

function relaunchAsAdmin() {
  const argv = process.argv.slice(1);
  if (!argv.includes('--elevated')) argv.push('--elevated');
  const command = `Start-Process -FilePath ${psQuote(
    process.execPath,
  )} -ArgumentList ${psArray(argv)} -WorkingDirectory ${psQuote(
    process.cwd(),
  )} -Verb RunAs`;

  const res = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    stdio: 'inherit',
  });
  return res.status === 0;
}

function canCreateSymlink() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expcat-skills-link-'));
  const targetDir = path.join(tmpDir, 'target');
  const linkPath = path.join(tmpDir, 'link');
  fs.mkdirSync(targetDir, { recursive: true });
  try {
    fs.symlinkSync(
      targetDir,
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    return true;
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) return false;
    throw err;
  } finally {
    try {
      if (fs.existsSync(linkPath))
        fs.rmSync(linkPath, { recursive: true, force: true });
      if (fs.existsSync(targetDir))
        fs.rmSync(targetDir, { recursive: true, force: true });
      if (fs.existsSync(tmpDir))
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

function ensureSymlinkPrivilegeOrRelaunch() {
  if (process.platform !== 'win32') return;
  if (canCreateSymlink()) return;

  if (process.env.EXPCAT_SKILLS_ELEVATED === '1') {
    logError(
      'Unable to create symlink. Please enable Developer Mode or run as Administrator and retry.',
    );
    process.exit(1);
  }

  logWarn('Symlink permission required. Requesting elevation...');
  const ok = relaunchAsAdmin();
  if (!ok) {
    logError(
      'Elevation was cancelled or failed. Please run as Administrator and retry.',
    );
    process.exit(1);
  }

  process.exit(0);
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

async function linkSkillsDir(agentsRoot, tool) {
  const toolSkillsPath = getToolSkillsPath(tool);
  if (isSkillsLinked(tool)) {
    logInfo(
      `${tool} already mapped to ${agentsRoot.replace(os.homedir(), '~')}`,
    );
    return;
  }

  if (fs.existsSync(toolSkillsPath)) {
    const overwrite = await confirm({
      message: `${tool} skills directory exists. Replace with symlink?`,
      default: false,
    });
    if (!overwrite) {
      logWarn(`Skipped mapping for ${tool}.`);
      return;
    }
    if (!dryRun) fs.rmSync(toolSkillsPath, { recursive: true, force: true });
  }

  if (dryRun) {
    logInfo(`[dry-run] Link ${toolSkillsPath} -> ${agentsRoot}`);
    return;
  }

  fs.mkdirSync(path.dirname(toolSkillsPath), { recursive: true });
  fs.symlinkSync(
    agentsRoot,
    toolSkillsPath,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  logInfo(
    `Mapped: ${toolSkillsPath.replace(os.homedir(), '~')} -> ${agentsRoot.replace(os.homedir(), '~')}`,
  );
}

async function main() {
  parseArgs();

  if (cleanLogs) {
    purgeLogs();
    process.exit(0);
  }

  if (cleanSkills) {
    cleanEmptyToolSkillsDirs();
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
  cloneRepo(owner, repo, ref, subpath, tmpDir);

  let basePath = tmpDir;
  if (subpath) basePath = path.join(tmpDir, subpath);

  const selectedDir = await selectDirectoryStepwise(basePath);
  if (!fs.existsSync(selectedDir) || !fs.statSync(selectedDir).isDirectory()) {
    logError(`Selected path not found: ${selectedDir}`);
    process.exit(1);
  }

  const skillName = path.basename(selectedDir);
  const targets = await selectTargets();

  if (targets.length > 0 && !dryRun) {
    ensureSymlinkPrivilegeOrRelaunch();
  }

  let preview = '';
  const agentsRoot = getAgentsSkillsRoot();
  const agentsDest = path.join(agentsRoot, skillName);
  preview += `- agents -> ${agentsDest}${fs.existsSync(agentsDest) ? ' (conflict)' : ''}\n`;

  if (targets.length === 0) {
    preview += `- mapping -> (none)\n`;
  } else {
    for (const t of targets) {
      const toolSkillsPath = getToolSkillsPath(t);
      const conflict = fs.existsSync(toolSkillsPath) && !isSkillsLinked(t);
      preview += `- ${t} -> ${toolSkillsPath} -> ${agentsRoot}${conflict ? ' (conflict)' : ''}\n`;
    }
  }

  const ok = await confirmPreview(preview);
  if (!ok) {
    logWarn('Cancelled by user');
    process.exit(1);
  }

  await copySkill(selectedDir, agentsRoot, skillName);

  for (const t of targets) {
    await linkSkillsDir(agentsRoot, t);
  }

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
