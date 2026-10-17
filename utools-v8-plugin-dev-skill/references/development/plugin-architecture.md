# 插件应用架构

uTools 插件应用由 Web 前端界面、本地能力桥接层以及 uTools 运行环境共同组成。

可以使用现代 Web 技术结合 uTools 开放能力，构建具备桌面应用体验，并能够调用本地能力的插件应用。

## 运行架构

插件应用整体由「前端界面层」「preload 桥接层」「uTools 运行环境」三部分组成：

```text
┌────────────────────────────────┐
│           前端界面层            │
|                                |
│   HTML / CSS / JavaScript      │
│   React / Vue 等前端框架        │
|                                |
│   window.utools API            |
|   window.xxx 桥接接口           │
└────────────────┬───────────────┘
                 │
                 │ 调用桥接接口
                 │
┌────────────────▼────────────────┐
│          preload 桥接层          │
|                                 |
│    Node.js 能力                 │
│    第三方 Node.js 模块           │
│    Electron 渲染进程 API         │
│    window.utools API            │
|                                 |
│      暴露 window.xxx 接口        │
└────────────────┬────────────────┘
                 │
                 │ 运行于
                 │
┌────────────────▼───────────────┐
│         uTools 运行环境         │
|                                |
│    插件应用生命周期管理          │
│    提供 uTools Runtime          │
└────────────────────────────────┘
```

## 运行环境

插件应用运行于 uTools Runtime 提供的运行环境中。

uTools Runtime 基于 Electron 构建，为插件应用提供 Chromium 渲染环境和 Node.js 运行能力。

插件应用基于以下运行环境：

| 组件 | 版本 |
| --- | --- |
| Electron | 34.5.8 |
| Chromium | 132 |
| Node.js | 20.19.1 |

> 插件应用运行环境版本由 uTools Runtime 决定，与开发者本机安装的 Node.js 或浏览器版本无关。

## 界面运行方式

插件应用主界面运行在 uTools 管理的 Electron `BrowserView` 中。

`BrowserView` 默认附加到 uTools 搜索框主窗口，用户可以通过 uTools 分离功能将插件应用主界面附加到一个独立窗口。

当插件应用退出到后台时，插件应用的 `BrowserView` 会从 uTools 搜索框主窗口移除，并进入后台状态。

如需创建自定义窗口，可以通过 `utools.createBrowserWindow()` 创建 Electron `BrowserWindow`，由 uTools Runtime 负责管理。

运行关系：

```text
uTools Runtime
    │
    ├── 插件应用主界面
    │       │
    │       └── BrowserView
    │
    └── 自定义窗口
            │
            └── BrowserWindow
```

> 更多自定义窗口相关内容，请参阅 [自定义窗口](./custom-window)。

## plugin.json 配置

每个插件应用都需要通过 `plugin.json` 描述自身信息和功能入口，主要包括：

- 插件应用基本信息（`main` 主界面入口、`logo` 图标、`preload` 本地能力桥接）
- 功能入口（`features`）
- 可选的 AI Agent 工具能力（`tools`）

> 关于 `plugin.json` 各字段的详细说明，请参阅 [plugin.json 配置说明](./plugin-json)。

## 前端界面层

插件应用使用标准 Web 技术开发，支持 React、Vue 等主流前端框架。

前端主要负责：

- 页面渲染与用户交互
- 数据展示与状态管理
- 通过 preload 桥接层调用本地能力，或直接调用 `window.utools` API

前端无法直接访问 Node.js 能力和第三方 Node.js 模块，如需使用这些本地能力，需要通过 preload 桥接层暴露接口。

## preload 桥接层

`preload.js` 是扩展插件应用本地能力的桥接层，可以访问：

- uTools API
- Node.js 能力
- 第三方 Node.js 模块
- Electron 渲染进程 API

桥接层向 `window` 暴露自定义接口（如 `window.xxx`），前端通过该接口调用本地能力，避免前端代码直接依赖底层实现，提升代码隔离性、可维护性与可读性。

> 关于 `preload` 的详细规范与用法，请参阅 [preload 桥接层](./preload)。

## 第三方依赖

插件应用中的第三方依赖需要根据运行环境和构建方式进行处理。

### 前端依赖

用于界面开发，例如 React、Vue 等。

需要通过 Vite、Webpack 等前端构建工具处理，最终生成插件应用界面运行所需的资源。

### Node.js 依赖

用于 `preload.js` 等具备 Node.js 能力的代码。

Node.js 依赖可以根据项目需求选择处理方式：

- 保留依赖目录（如 `node_modules`），由运行环境直接加载。
- 通过 Webpack 等工具构建，将依赖合并到输出文件中。

## 运行流程

插件应用提供多个事件，用于响应不同运行场景。

| 事件 | 说明 |
| --- | --- |
| `onPluginReady` | 插件应用加载完成后触发，用于执行一次性初始化任务 |
| `onPluginEnter` | 用户进入插件应用时触发 |
| `onPluginOut` | 用户退出插件应用时触发 |
| `onScheduleTrigger` | 后台定时任务触发 |

`onPluginReady` 为可选事件。使用该事件时，uTools Runtime 会等待 `callback` 执行完成后再进入插件应用。

```text
                     插件应用加载完成
                           |
                           ▼
                     onPluginReady
                         (可选)
                           |
                           ▼
                       初始化完成
                           |
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼

       用户进入        定时任务触发     AI Agent 调用

          │                │                │
          ▼                ▼                ▼

    onPluginEnter   onScheduleTrigger   执行通过 utools.registerTool 注册的工具

          │
          ▼

     onPluginOut
```

> 更多事件，请参阅 [事件 API](../api-reference/events)。

## 推荐开发项目结构

```text
plugin-project/
├─ public/             # 插件应用固定资源
│  ├─ plugin.json      # 插件应用配置
│  ├─ index.html       # 插件应用主界面入口
│  └─ logo.png         # 插件应用 Logo
│
├─ bridge/             # 本地能力桥接层
│  └─ preload.js
│
├─ src/                # 前端业务源码
│  └─ App.js
│
├─ package.json        # 项目依赖管理
│
└─ dist/               # 生产构建输出目录（插件应用目录）
   ├─ plugin.json
   ├─ preload.js
   ├─ index.html
   ├─ logo.png
```

## 插件应用目录结构

无论是手动编写，还是通过 Vite、Webpack 等构建工具产出，最终交付给 uTools 的插件应用目录都需要包含 `plugin.json` 定义的文件结构。

uTools 开发者工具打包时，将指定构建输出目录作为插件应用根目录。

```text
plugin/                       # 插件应用目录（生产构建输出目录）
├─ plugin.json                # 插件应用配置与功能入口（必需）
├─ preload.js                 # 本地能力桥接（可选，需在 plugin.json 中指定）
├─ index.html                 # 插件应用主界面入口（必需，对应 plugin.json 的 main）
├─ logo.png                   # 插件应用 Logo（必需，对应 plugin.json 的 logo）
├─ index.js                   # 构建输出文件（可选）
├─ assets/                    # 前端构建资源（可选）
│  ├─ index.xxx.js
│  └─ index.xxx.css
└─ node_modules/              # preload.js 运行所需 Node.js 依赖（可选）
```
