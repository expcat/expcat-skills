# expcat-skills 安装器

跨平台安装器，支持从 GitHub 路径安装 skill，功能包括：

- GitHub 路径解析（支持仓库与子目录）
- 逐级目录选择与一次确认
- 统一安装到 ~/.agents/skills
- 目标工具目录按需映射（Copilot/Claude/Codex/OpenCode），可不选
- 冲突提示（覆盖或重命名）
- 交互式卸载已安装 skills（支持多选）
- `--dry-run` 预览
- 日志保留最近一次（用户目录）与清理
 - Windows 自动触发 UAC 以创建符号链接（若失败将提示手动提升权限）

## npm CLI（全局安装）

```
npm i -g @expcat/skills-installer
expcat-skills <github_path_or_url>
expcat-skills --dry-run https://github.com/expcat/Tigercat/tree/main/skills/tigercat
expcat-skills -ui                # 交互式卸载已安装 skills
expcat-skills --uninstall        # 同上
expcat-skills -ui --dry-run      # 预览卸载（不实际删除）
expcat-skills --clean-logs
```
