# expcat-skills 安装器

跨平台安装器，支持从 GitHub 路径安装 skill，功能包括：

- GitHub 路径解析（支持仓库与子目录）
- 逐级目录选择与一次确认
- 默认安装到当前目录 `./.agents/skills`，加 `-g` 安装到全局 `~/.agents/skills`
- 冲突提示（覆盖或重命名）
- 交互式卸载已安装 skills（支持多选，受 `-g` 影响）
- `--clean-mapping` 清理旧版工具目录符号链接
- `--dry-run` 预览
- 日志保留最近一次（用户目录）与清理

## npm CLI（全局安装）

```
npm i -g @expcat/skills-installer
expcat-skills <github_path_or_url>
expcat-skills -g <github_path_or_url>   # 安装到 ~/.agents/skills
expcat-skills --dry-run https://github.com/expcat/Tigercat/tree/main/skills/tigercat
expcat-skills -l                 # 列出当前目录 ./.agents/skills 下的 skills
expcat-skills -l -g              # 列出全局 ~/.agents/skills 下的 skills
expcat-skills -u                 # 交互式卸载当前目录 skills
expcat-skills -u -g              # 交互式卸载全局 skills
expcat-skills --clean-mapping    # 清理旧版工具目录符号链接
expcat-skills --clean-mapping --dry-run
expcat-skills --clean-logs
expcat-skills --clean-skills     # 删除空的 skills 目录
```
