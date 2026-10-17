# uTools 插件应用开发 Skill

`utools-plugin-dev` 是 uTools 官方提供的 Agent Skill，用于辅助开发 uTools 插件应用。

安装后，AI 将基于 uTools 官方开发文档辅助开发，包括代码编写、功能实现、API 集成和问题排查。

技能面向 **uTools 8.0 及以上**版本。

## 技术依据

技能内置 uTools 官方开发文档，并作为开发能力判断与代码实现的主要依据：

| 目录 | 内容 |
| --- | --- |
| `references/api-reference/` | uTools API 参考，包括事件、窗口、系统能力、数据存储、AI、任务、自动化等 |
| `references/development/` | 插件应用开发规范，包括项目结构、配置、架构、窗口和扩展能力 |

`references/` 文档未定义的能力，AI 不会作为 uTools 官方能力使用。

AI 不会基于经验、推测或第三方资料补充未定义的 API、参数、返回值或兼容性信息；当所需能力未在文档中定义时，会明确说明当前文档范围内不提供该能力。

## 安装

1. 打开 [utools-plugin-dev-skill](https://github.com/uTools-Labs/utools-plugin-dev-skill)，克隆或下载仓库。

2. 将技能目录（包含 `SKILL.md` 与 `references/`）复制到下表对应位置。

| 工具 | 项目级目录 | 个人级目录 |
| --- | --- | --- |
| VS Code + GitHub Copilot | `.github/skills/` | `~/.copilot/skills/` |
| Cursor | `.cursor/skills/`（也支持 `.agents/skills/`） | `~/.cursor/skills/`（也支持 `~/.agents/skills/`） |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |

安装完成后的目录结构：

```text
.github/skills/
└── utools-plugin-dev/        # 目录名需与 SKILL.md 中的 name 一致
    ├── SKILL.md
    └── references/
        ├── api-reference/
        └── development/
```

::: warning 注意事项
- 技能目录名称必须为 `utools-plugin-dev`，并与 `SKILL.md` 中的 `name` 字段保持一致，否则技能不会被正确加载。
- 若下载的仓库根目录就是技能本体，将其复制并重命名为 `utools-plugin-dev` 即可。
- 表中的 `~` 表示用户主目录，Windows 下例如 `C:\Users\<用户名>`。
- 其他支持 Agent Skills 标准的 AI 工具同样可以加载该技能，具体目录以对应工具的官方文档为准。
:::

## 使用

### 自动加载

当用户需求涉及 uTools 插件应用开发时，AI 会根据 `SKILL.md` 中的 `description` 自动识别并加载本技能。

你只需要描述想实现的功能，例如：

```text
帮我给这个 uTools 插件应用集成 MCP 工具
```

### 手动唤起

在对话框中输入 `/`，选择 `utools-plugin-dev`，再补充具体需求：

```text
/utools-plugin-dev 进入插件应用后功能不触发，帮我排查一下
```

## 适用范围

| 范围 | 说明 |
| --- | --- |
| 版本要求 | uTools 8.0 及以上 |
| 适用 | 已存在的插件应用项目中的增量开发，包括代码编写、功能实现、API 集成、代码修改和问题排查 |
| 不适用 | 从零创建完整插件应用项目，包括项目初始化、模板选择、资源生成和完整交付 |


::: tip 使用建议

- 将插件应用项目放入工作区中，AI 需要读取项目文件，才能基于现有代码结构进行开发。
- 对已有项目进行修改时，应优先保持现有技术方案和项目结构，仅针对需求范围进行调整。
- AI 生成或修改代码后，请在实际 uTools 环境中运行验证。

:::
