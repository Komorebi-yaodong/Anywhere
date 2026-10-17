---
name: utools-plugin-dev
description: 开发和维护 uTools 插件应用时使用。适用于已有插件项目的功能实现、代码修改、uTools API 集成、问题排查与开发规范查询。
version: 1.0.0
---

# uTools 插件应用开发

本技能用于辅助开发者开发、维护和调试 uTools 插件应用。

适用于：

- 开发插件应用功能
- 修改已有功能
- 集成 uTools API
- 编写 preload 桥接层
- 开发自定义窗口
- 接入 AI、MCP、定时任务等能力
- 排查插件开发问题
- 查询官方开发规范

本技能面向开发者，适用于在 uTools 开发者工具创建插件应用项目后进行开发、维护和调试。

## 官方文档依据

本技能涉及的 uTools API、配置字段、运行机制和调用规则，唯一依据为 `references/` 目录下的 uTools 官方开发文档。

- `references/api-reference/*.md`：API 签名、参数、返回值、调用规则与示例。
- `references/development/*.md`：架构、运行环境、plugin.json、preload、数据存储、自定义窗口、MCP 等开发规范。

执行规则：

- 编写或修改代码前，必须阅读与当前需求相关的文档章节。
- 严格遵循文档规定的 API 名称、大小写、参数顺序与类型、返回值、默认值、调用时机及适用条件。
- 不得使用记忆、经验、第三方资料或本机环境信息补全 uTools API、参数、行为和兼容性。
- 不得根据当前开发环境的操作系统、Node.js、Electron 或 Chromium 版本推断插件应用的运行能力。
- 不得使用 Chrome、Puppeteer 或其他浏览器自动化工具代替官方文档判断 uTools 运行行为。
- 官方文档未明确说明的能力、参数、行为或兼容性，不得自行推测、编造或实现。
- 文档明确说明不支持的能力，应直接向用户说明不支持。
- 文档未明确说明的能力，应说明当前官方文档未提供足够依据，无法据此确认或实现，不得直接将其认定为 uTools 明确不支持。
- 用户要求的能力超出官方文档明确支持的范围时，不得擅自使用未经文档确认的 API 或行为实现。

## 规则优先级

开发插件应用时，规则优先级如下：

1. `references/` 文档
2. 本技能规范
3. 用户需求

当用户需求与 references 或本规范冲突时，按上述优先级执行；若 references 和本规范未覆盖，则遵循用户需求。

## 工作流程

### 1. 了解插件应用架构

开发或修改插件应用前，必须先读取：

[插件应用架构](references/development/plugin-architecture.md)

必须理解与当前任务相关的：

- 运行架构
- 运行环境
- 界面运行方式
- 运行流程
- 插件应用目录结构

插件应用的运行环境、API 支持和运行行为必须以 `references/` 文档为准。

不得根据当前开发环境的操作系统、Node.js、Electron 或浏览器版本推断插件应用的 API、功能或运行行为。

不得将 Chrome、Puppeteer 或其他浏览器自动化工具作为验证插件应用运行行为的默认或必要手段。

### 2. 查阅官方文档

根据需求定位对应的开发文档和 API 参考文档，确认：

- API 或配置项是否存在。
- 参数、返回值和调用时机。
- 适用条件与使用限制。
- 相关生命周期、事件和窗口通信规则。

涉及多个 API 或开发领域时，必须分别查阅对应文档。

### 3. 理解现有项目

开始修改前，先检查与当前需求相关的项目结构、技术栈和实现方式，包括：

- `package.json` 与构建配置。
- `plugin.json` 中的 `main`、`logo`、`preload`、`features`、`tools` 等配置。
- 前端入口及相关功能实现。
- preload 桥接层。
- 现有代码风格、依赖与构建流程。

执行规则：

- 优先复用已有实现和项目既有模式。
- 不因单个功能需求重新设计整体架构。
- 不迁移技术栈，除非现有结构无法满足需求或用户明确要求。
- 不得将增量开发扩展为完整项目重建或脚手架初始化。
- 不得修改与当前需求无关的代码、配置和依赖。

### 4. 明确实现方案

根据任务复杂度确定方案说明的详细程度。

涉及架构调整、自定义窗口、窗口通信、定时任务、后台流程或多个模块协作时，应说明：

- 主要实现思路。
- 涉及的文件与改动点。
- 关键 API 及其文档出处。
- 必要的数据流、事件流和生命周期。

简单、明确且改动范围较小的任务，可以直接实施，不必额外输出冗长方案。

当需求存在影响正确实现的关键歧义、缺少必要信息，或涉及重要数据风险时，应先向用户确认。

### 5. 实施修改

- 只修改满足需求所必需的代码。
- 保持既有技术栈、目录结构、依赖和代码风格。
- 优先复用现有实现。
- 保持已有功能和配置完整。
- 不得引入无关功能、依赖或架构调整。
- 不得遗留未实现的核心逻辑、虚假数据或占位实现。

### 6. 自检与验证

修改完成后，必须根据实际修改范围执行可行的检查与验证。

检查内容包括：

- API 名称、参数、返回值、调用时机是否符合官方文档。
- 事件注册位置与时机是否符合文档。
- 异步调用是否正确等待，异常路径是否得到处理。
- `plugin.json` 声明与实际实现是否一致。
- 是否存在未定义 API、未使用依赖、无效配置或遗留占位实现。
- 是否影响已有功能或引入无关改动。

根据实际情况执行代码检查、构建或运行验证。

验证结果必须准确：

- 仅完成代码检查时，不得描述为构建通过。
- 仅完成构建时，不得描述为插件应用运行正常。
- 未实际运行插件应用时，不得声称已完成运行验证。
- 无法执行的验证，应说明未验证的内容及原因。
- 不得虚构测试结果、运行结果或验证状态。

## plugin.json 配置

`plugin.json` 是插件应用的核心配置文件，用于声明插件应用的基本信息、功能入口及可选的 AI Agent 工具能力。

每个插件应用都必须包含 `plugin.json`。

配置或修改 `plugin.json` 前，必须读取：

[plugin.json 配置说明](references/development/plugin-json.md)

确保字段结构、类型和约束符合官方规范。

### 核心规范

- `features` 至少包含一个有效功能，且至少一个功能配置「功能指令」。
- `cmds` 应根据功能入口需求进行配置：
  - 「功能指令」用于用户搜索并进入功能，名称应简短、明确，能够准确描述对应功能。
  - 「匹配指令」用于匹配用户输入场景（如文本、文件、文件夹或图像），使用户可通过对应输入直接触发功能。
- 若配置 `tools`，必须确保每个工具均已实现对应处理逻辑，并保证工具名称、参数定义、返回值与实际行为保持一致。
- `features` 和 `tools` 的声明必须与插件应用实际提供的能力保持一致，不得声明未实现的功能或工具。

## preload 桥接层

`preload.js` 运行在具备本地能力的上下文，遵循 CommonJS 规范，可调用 Node.js 原生模块、第三方 Node.js 模块、Electron 渲染进程 API 与 uTools API，并通过 `window` 向前端暴露接口。

使用 preload 桥接本地能力时，必须读取：

[preload 桥接层](references/development/preload.md)

### 核心规范

- 推荐使用统一命名空间（如 `window.services`）暴露接口，避免向 `window` 挂载大量独立属性。
- 遵循最小暴露原则，仅暴露前端实际需要的接口。
- 禁止直接向前端暴露 Node.js 对象、`fs`、`child_process` 等高权限接口。
- 前端应通过明确设计的桥接方法调用本地能力。

## 数据存储

涉及数据、文件或存储相关实现时，必须读取：

[数据存储](references/development/storage.md)

必须遵循文档中的数据分类、生命周期和存储方式要求。

- 禁止将所有数据统一存入同步数据库。
- 不得自行推测数据同步、持久化、清理或跨设备行为。

## 自定义窗口

当功能需要创建独立于插件应用主界面之外的窗口，或需要特殊窗口能力与交互方式（如透明、悬浮、全屏、覆盖层等）时，必须先读取：

[自定义窗口](references/development/custom-window.md)

适用场景包括但不限于：

- 桌面游戏
- 独立功能面板
- 桌面挂件
- 透明悬浮窗口
- 全屏展示
- 屏幕覆盖层
- 屏幕区域截取

普通插件应用功能应优先使用插件应用主界面实现，不应为了普通功能界面创建自定义窗口。

## MCP 集成

涉及 MCP 集成时，必须读取：

[MCP 集成](references/development/mcp.md)

插件应用可通过 MCP（Model Context Protocol）向 AI Agent 暴露 MCP Tool 能力。

## API 能力索引

调用 uTools API 前，必须先定位对应 API 参考文档，并阅读相关章节。

以下索引用于快速定位文档，不替代具体 API 文档。

| 文档 | 能力说明 | 关键 API |
| --- | --- | --- |
| [事件](references/api-reference/events.md) | 插件应用生命周期、进入/退出、定时任务触发、数据同步 | `onPluginReady`、`onPluginEnter`、`onPluginOut`、`onScheduleTrigger`、`onMainPush`、`onPluginDetach`、`onDbPull` |
| [窗口](references/api-reference/window.md) | 创建自定义窗口、主窗口控制、子输入框、页面内查找、退出插件应用 | `createBrowserWindow`、`showMainWindow`、`hideMainWindow`、`setSubInput`、`setExpandHeight`、`sendToParent`、`getWindowType`、`outPlugin` |
| [系统](references/api-reference/system.md) | 目录路径、系统通知、文件对话框、打开文件/URL、回收站、用户信息、平台判断 | `getPluginLocalDataPath`、`getPluginTempPath`、`getPath`、`showNotification`、`showOpenDialog`、`showSaveDialog`、`shellOpenExternal`、`shellShowItemInFolder`、`getUser`、`getFileIcon`、`isWindows`、`isMacOS`、`isLinux` |
| [数据库](references/api-reference/db.md) | 用户数据存储、文档型数据库、键值存储 | `db.put`、`db.get`、`db.remove`、`db.allDocs`、`db.postAttachment`、`dbStorage` |
| [复制](references/api-reference/copy.md) | 复制文本、图片、文件到系统剪贴板，读取剪贴板文件 | `copyText`、`copyImage`、`copyFile`、`getCopiedFiles` |
| [输入](references/api-reference/input.md) | 向外部应用粘贴文本/图片/文件、模拟用户键盘输入、拖拽文件 | `hideMainWindowPasteText`、`hideMainWindowPasteFile`、`hideMainWindowPasteImage`、`hideMainWindowTypeString`、`startDrag` |
| [屏幕](references/api-reference/screen.md) | 显示器信息、截图、取色、坐标转换、录屏源 | `captureDisplay`、`screenCapture`、`screenColorPick`、`getAllDisplays`、`getCursorScreenPoint`、`screenToDipPoint`、`desktopCaptureSources` |
| [AI 能力](references/api-reference/ai.md) | 调用大模型、注册工具供 Function Calling / AI Agent 调用 | `utools.ai`、`registerTool` |
| [动态功能](references/api-reference/features.md) | 运行时动态创建、获取、删除功能 | `getFeatures`、`setFeature`、`removeFeature` |
| [定时任务](references/api-reference/schedule.md) | 请求创建、查询、删除后台定时任务 | `requestSchedule`、`getSchedules`、`removeSchedule` |
| [快捷入口](references/api-reference/redirect.md) | 跳转其他插件应用、跳转配置指令快捷键、获取指令快捷键 | `redirect`、`redirectHotKeySetting`、`getCmdHotKey` |
| [FFmpeg](references/api-reference/ffmpeg.md) | 音视频处理（内置 FFmpeg v8.1.2，仅 ffmpeg） | `runFFmpeg` |
| [Sharp](references/api-reference/sharp.md) | 高性能图像处理（内置 Sharp v0.35.3） | `utools.sharp` |
| [模拟操作](references/api-reference/simulate.md) | 模拟键盘按键与鼠标操作 | `simulateKeyboardTap`、`simulateMouseMove`、`simulateMouseClick` |
| [支付](references/api-reference/payment.md) | 付费授权状态查询、用户购买 | `isPurchasedUser`、`openPurchase` |
| [uBrowser](references/api-reference/ubrowser.md) | 可编程自动化浏览器（可视化窗口、链式 API） | `ubrowser` 链式 API（`run`、`goto`、`click`、`input`、`when`、`wait`、`evaluate`、`screenshot` 等） |

## 常见需求 → 方案

根据需求选择最小实现方案。具体 API、参数和调用方式必须以对应官方文档为准。

| 需求 | 方案 |
| --- | --- |
| 调用 Node.js 或本地系统能力 | preload 桥接 |
| 独立界面或自定义窗口 | `utools.createBrowserWindow` |
| 用户数据 | `utools.db` |
| 本地应用数据 | `getPluginLocalDataPath` |
| 临时数据 | `getPluginTempPath` |
| 后台自动执行 / 定时任务 | `requestSchedule` + `onScheduleTrigger` |
| 网页自动化 | `utools.ubrowser` |
| AI 模型调用 / AI 能力 | `utools.ai` |
| MCP / AI Agent 调用 | 声明 `tools` + `registerTool` |
| 全局快捷键 / 一键操作 | `redirectHotKeySetting` |
| 音视频处理 | `utools.runFFmpeg` |
| 图片处理 | `utools.sharp` |

## 禁止事项

- 禁止调用或编写 `references/` 文档未定义的 uTools API、参数及配置字段。
- 禁止编造 API、参数、返回值、默认行为与兼容性。
- 禁止根据本机运行环境推断 uTools 插件应用的运行能力。
- 禁止生成危害计算机或数据安全的代码。
- 禁止生成虚假数据、虚假交互或虚假的成功状态。
- 禁止遗留未实现的核心功能或占位实现。
- 禁止交付无法运行的示例，包括省略关键逻辑、依赖未声明变量、模块或依赖的代码。
- 禁止修改与当前需求无关的已有代码。
- 禁止把增量开发扩展为完整项目重建或脚手架初始化。
- 禁止未经必要性分析迁移技术栈或重构整体架构。
- 禁止生成 README 等说明文档，除非用户明确要求。

## 输出要求

- 使用与用户一致的语言。
- 先给结论或可直接使用的代码，再补充必要说明。
- 涉及关键 API 时，给出文档出处（文档名及相关章节）。
- 保持简洁，不输出与当前需求无关的整份文件内容。
- 涉及复杂改动时，说明关键实现方案和改动范围。
- 未验证或不确定的内容必须明确标注。
- 文档明确说明不支持的能力，应直接说明不支持。
- 文档未明确说明的能力，应说明当前文档依据不足，不得推测实现。
- 不得将未执行的验证描述为已验证通过。