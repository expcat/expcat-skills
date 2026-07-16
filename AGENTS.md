# expcat-skills Agent 指南

本文件是适用于所有编码代理的通用约束入口。

## 项目定位

本仓库提供跨平台 Agent skill 安装器和可复用 skills：

- `skills-installer/`：发布为 `@expcat/skills-installer` 的 Node.js CLI。
- `skills-installer/bin/expcat-skills.js`：`expcat-skills` 命令入口。
- `skills/<skill-name>/`：内置的独立 skill 目录。
- `README.md` 与 `skills-installer/README.md`：仓库入口及完整 CLI 用法。

安装器面向 Claude Code、GitHub Copilot、OpenCode、Codex 等工具，但本仓库的维护规则不绑定任何单一工具。默认安装到当前目录 `./.agents/skills`，`-g` 安装到全局 `~/.agents/skills`。

## 实现规则

- 运行时保持 Node.js 18+ 和 CommonJS 兼容；交互提示复用 `@inquirer/prompts`。
- GitHub 路径既要支持完整仓库，也要支持 `owner/repo/skills/name` 形式的子目录。
- 保持本地/全局目录语义一致；列出、安装、卸载、清理旧映射和清理空目录都要尊重 `-g`。
- 所有用户输入、GitHub 路径和目标路径都要验证，明确处理网络失败、路径不存在、冲突和权限错误。
- 保留 `--dry-run`、列表、交互式卸载、冲突覆盖/重命名、`--clean-mapping`、日志与清理能力。
- 每个 skill 应有清晰用途、适用工具标记，并尽量可以独立安装和使用。
- 修改 CLI、安装行为或支持矩阵时，同步更新两个 README、`package.json` 和需要变更的 lockfile。
- 只做当前任务所需的最小改动，保留用户已有修改，不声称未运行的检查已经通过。

## 验证

- 对 CLI 修改至少运行 `node --check skills-installer/bin/expcat-skills.js` 和仓库现有检查。
- 安装路径或复制逻辑变化时，用 `--dry-run` 覆盖完整仓库与子目录、本地与全局两类输入，并检查失败路径不会留下部分安装结果。
