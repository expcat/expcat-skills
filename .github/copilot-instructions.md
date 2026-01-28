# Copilot Instructions for expcat-skills

## Project Overview

Agent skill 安装辅助工具库，提供：

1. **Shell 安装脚本** - 从 GitHub 路径安装 agent skills 到本地
2. **Skills 仓库** - 存放可复用的 agent skill 文件

支持的 AI 编码工具：

- Claude Code (CLAUDE.md / .claude/ 目录)
- GitHub Copilot (.github/copilot-instructions.md)
- OpenCode
- Codex
- 其他兼容工具

## Tech Stack

- **Language**: Shell (Bash/Zsh)
- **依赖**: curl/wget, git (用于从 GitHub 获取文件)

## Project Structure

```
expcat-skills/
├── install.sh          # 主安装脚本
├── skills/             # 内置 agent skills 集合
│   └── <skill-name>/   # 目录名即为 skill 名
│       └── ...         # skill 相关文件
└── README.md           # 使用文档
```

## 核心功能

### 安装脚本设计要点

1. **GitHub 路径解析** - 支持完整仓库或子目录路径

   ```bash
   # 示例: owner/repo/skills/my-skill
   # 将 my-skill 目录下所有内容复制到目标安装目录
   ```

2. **目标位置检测** - 根据用户选择或自动检测安装位置
   | 工具 | macOS/Linux | Windows |
   |------|-------------|---------|
   | Claude Code | `~/.claude/skills/` | `C:\Users\{user}\.claude\skills\` |
   | Copilot | `~/.copilot/skills/` | `C:\Users\{user}\.copilot\skills\` |
   | OpenCode | `~/.opencode/skills/` | `C:\Users\{user}\.opencode\skills\` |
   | Codex | `~/.codex/skills/` | `C:\Users\{user}\.codex\skills\` |

3. **安装逻辑** - 将指定 GitHub 路径下的 skill 目录内容完整复制到目标位置

4. **错误处理** - 网络失败、路径不存在、权限问题

## Shell 脚本约定

- 使用 `set -euo pipefail` 启用严格模式
- 所有用户输入需验证和转义
- 提供 `--dry-run` 选项预览操作
- 输出使用颜色区分状态（成功/警告/错误）
- 支持 `--help` 显示用法

## Skills 文件格式

每个 skill 文件应包含：

- 清晰的用途说明（文件头注释）
- 适用的工具类型标记
- 可独立使用，无外部依赖
