# plugin.json 配置说明


## 文件概述

`plugin.json` 是插件应用的核心配置文件，用于声明插件应用的基本信息、功能入口以及可选的 AI Agent 工具能力。每个插件应用都必须包含一个 `plugin.json` 文件。

在 uTools 运行体系中，`plugin.json` 是用于识别插件应用的入口配置文件，它声明了：

- 插件应用基本信息（`main` 主界面入口、`logo` 图标、`preload` 本地能力桥接）
- 功能入口（`features`）
- 可选的 AI Agent 工具能力（`tools`）

> 关于插件应用整体架构，请参阅 [插件应用架构](./plugin-architecture)。

## 配置结构

`plugin.json` 文件是一个标准的 JSON 文件，它的结构如下：

```json
{
  "main": "index.html",
  "logo": "logo.png",
  "preload": "preload.js",
  "features": [
    {
      "code": "hello",
      "description": "hello world",
      "cmds": ["hello", "你好"]
    }
  ]
}
```

## 基础配置

### `main`

> 类型：`string`
>
> 必填：是

必须指定为相对于 `plugin.json` 的 **相对路径**，且文件类型必须为 `.html`

### `logo`

> 类型：`string`
>
> 必填：是

插件应用 Logo 文件，必须指定为相对于 `plugin.json` 的 **相对路径**

### `preload`

> 类型：`string`
>
> 必填：否

指定一个将在窗口加载前执行的预加载脚本（`.js` 文件）。该脚本运行在独立的预加载环境，可使用 **Node.js 原生能力** 与 **Electron 渲染进程 API**，并向 `window` 对象暴露自定义接口供前端调用。

> 关于 preload 的详细规范与用法，请参阅 [preload 桥接层](./preload)。

## 运行行为配置

### `pluginSetting`

> 类型：`object`
>
> 必填：否

用于配置插件应用的默认运行行为。

如无特殊需求，无需配置此字段。

### `pluginSetting.single`

> 类型：`boolean`
>
> 必填：否
>
> 默认值：`true`

用于控制插件应用是否以单例模式运行，默认为 `true`。

如无特殊需求，无需配置此字段。

### `pluginSetting.height`

> 类型：`number`
>
> 必填：否
>
> 默认值：`544`

配置插件应用初始高度，可通过 API [utools.setExpandHeight()](../api-reference/window#utools-setExpandHeight-height) 动态修改。

如无特殊需求，无需配置此字段。

## 功能配置

### `features`

> 类型：`Array<object>`
>
> 必填：是
>
> 最小长度：`1`

`features` 定义插件应用的功能入口。每个 `feature` 对应一个独立功能入口，并通过 `cmds` 配置一个或多个触发该功能的指令。

一个插件应用可包含多个 `feature`，每个 `feature` 应保持独立的功能职责。

### `feature.code`

> 类型：`string`
>
> 必填：是

`code` 是插件应用内部用于标识功能的唯一编码。当用户通过该 `feature` 的任一入口触发功能时，uTools 会将对应的 `code` 传递给插件应用，插件应用根据该值执行对应的功能逻辑。

### `feature.description`

> 类型：`string`
>
> 必填：否

功能描述，用于说明该功能的具体用途，便于用户理解。

### `feature.icon`

> 类型：`string`
>
> 必填：否

功能图标文件，支持 `.png`、`.jpg`、`.svg` 格式。指定为相对于 `plugin.json` 的 **相对路径**。

如无特殊需求，无需配置此字段。

### `feature.platform`

> 类型：`Platform | Array<Platform>`
>
> 必填：否

指定功能支持的平台。

```ts
type Platform = "win32" | "darwin" | "linux";
```

如无特殊需求，无需配置此字段。

### `feature.mainPush`

> 类型：`boolean`
>
> 必填：否

配置为 `true` 后，该功能匹配用户输入时，插件应用可以持续向 uTools 搜索结果区域推送动态结果。

如无特殊需求，无需配置此字段。

### `feature.mainHide`

> 类型：`boolean`
>
> 必填：否

配置为 `true` 时，通过非 uTools 搜索框入口触发该功能时，不主动显示插件应用主窗口。

::: tip

部分功能无需展示插件应用界面，例如：

- 通过全局快捷键执行「截图识别文字」
- 通过超级面板选中文本执行「Google 搜索」

此类场景可以配置 `mainHide: true`，使功能直接执行，避免显示插件应用主窗口，提升交互体验。

:::

通过 uTools 搜索框搜索进入插件应用时，插件应用主窗口仍会正常显示，不受该配置影响。

如无特殊需求，无需配置此字段。

### `feature.cmds`

> 类型：`Array<string|object>`
>
> 必填：是
>
> 最小长度：`1`

配置该功能支持的指令，包括「功能指令」和「匹配指令」。

## 功能指令

功能指令用于在 uTools 搜索框中通过关键词搜索并进入对应功能。

### 命名规范

- 指令名称应保持简短、明确，能够准确描述对应功能。
- 长度范围：1 ~ 80 个字符，推荐控制在 20 个字符以内。
- 禁止包含：
  - 控制字符或不可见字符；
  - 操作系统保留特殊字符：

    ```
    \ / : * ? " < > |
    ```

  - 仅由 Emoji 或空白字符组成的名称。

### 搜索支持

- 中文指令无需额外配置拼音或首字母，uTools 会自动支持拼音和首字母搜索。

### 配置约束

- 插件应用必须至少包含一个功能指令。
- 同一个功能最多配置 5 个功能指令，超出部分将被忽略。

### 示例

::: code-group

```json [plugin.json]
{
  "features": [
    {
      "code": "foo",
      "cmds": ["测试"]
    }
  ]
}
```

:::

## 匹配指令

在 uTools 搜索框输入特定文本或粘贴图片、文件（或文件夹）时，匹配出可处理该内容的指令。

匹配指令通过 `cmds` 数组中的对象进行配置，`type` 字段决定匹配类型：

| 类型 | 匹配内容 | 说明 |
| --- | --- | --- |
| `regex` | 正则匹配特定文本 | 通过 `match` 正则控制匹配规则，可设置字符长度范围 |
| `over` | 匹配任意文本 | 可设置排除正则与字符长度范围 |
| `img` | 匹配图像 | 匹配粘贴或拖入的图像 |
| `files` | 匹配文件或文件夹 | 可设置文件类型与扩展名 |
| `window` | 匹配当前活动系统窗口 | 通过应用名称与窗口标题匹配 |

匹配指令通过 `label` 配置指令名称，其命名规范与功能指令一致。

### `regex`

正则匹配特定文本

::: code-group

```json [plugin.json]
{
  "features": [
    {
      "code": "regex",
      "cmds": [
        {
          // 类型标记（必须）
          "type": "regex",
          // 指令名称（必须）
          "label": "打开网址",
          // 正则表达式字符串
          "match": "/^https?:\\/\\/[^\\s/$.?#]\\S+$|^[a-z0-9][-a-z0-9]{0,62}(\\.[a-z0-9][-a-z0-9]{0,62}){1,10}(:[0-9]{1,5})?$/i",
          // 最少字符数（可选）
          "minLength": 1,
          // 最多字符数（可选）
          "maxLength": 1000
        }
      ]
    }
  ]
}
```

:::

::: warning

`match` 为正则表达式字符串。由于 `plugin.json` 使用 JSON 格式，正则表达式中的反斜杠 `\` 需要进行 JSON 转义，例如 `\s` 应写为 `\\s`。

可匹配任意内容的正则会被 uTools 忽略，例如：`/\.*/`、`/(.)+/`、`/[\s\S]*/` 等。

:::

### `over`

匹配任意文本

::: code-group

```json [plugin.json]
{
  "features": [
    {
      "code": "over",
      "cmds": [
        {
          // 类型标记（必须）
          "type": "over",
          // 指令名称（必须）
          "label": "百度一下",
          // 排除的正则表达式字符串（任意文本中排除的部分）（可选）
          "exclude": "/\\n/",
          // 最少字符数（可选）
          "minLength": 1,
          // 最多字符数（默认最多为 10000）（可选）
          "maxLength": 500
        }
      ]
    }
  ]
}
```

:::

### `img`

匹配粘贴或拖入的图像

::: code-group

```json [plugin.json]
{
  "features": [
    {
      "code": "img",
      "cmds": [
        {
          // 类型标记（必须）
          "type": "img",
          // 指令名称（必须）
          "label": "图像保存为文件"
        }
      ]
    }
  ]
}
```

:::

### `files`

匹配文件或文件夹

`extensions` 与 `match` 最多配置一个；两者均未配置时匹配所有文件。

::: code-group

```json [plugin.json]
{
  "features": [
    {
      "code": "files",
      "cmds": [
        {
          // 类型标记（必须）
          "type": "files",
          // 指令名称（必须）
          "label": "图片批量处理",
          // 文件类型 - "file"、"directory"（可选）
          "fileType": "file",
          // 文件扩展名（可选）
          "extensions": ["png", "jpg", "jpeg", "svg", "webp", "tiff", "avif", "heic", "bmp", "gif"],

          // 匹配文件或文件夹名称的正则表达式字符串（可选）
          // "match": "/\\.(?:jpg|jpeg|png|svg|webp|tiff|avif|heic|bmp)$/i",

          // 最少文件数（可选）
          "minLength": 1,
          // 最多文件数（可选）
          "maxLength": 100
        }
      ]
    }
  ]
}
```

:::

### `window`

匹配当前活动窗口。通过 `match` 对象定义匹配规则，其中 `app` 为必填项，`title` 为可选项。

::: code-group

```json [plugin.json]
{
  "features": [
    {
      "code": "window",
      "cmds": [
        {
          // 类型标记（必须）
          "type": "window",
          // 指令名称（必须）
          "label": "窗口置顶",
          // 窗口匹配规则
          "match": {
            // app 为应用名称匹配列表，列表中的任一名称匹配成功即可。（必须）
            "app": ["xxx.app", "xxx.exe"],
            // 匹配窗口标题的正则表达式字符串（可选）
            "title": "/xxx/"
          }
        }
      ]
    }
  ]
}
```

:::

## AI Agent 工具

通过配置 `tools`，可以将插件应用能力以标准化工具的形式暴露给 AI Agent（如 WorkBuddy、Codex、Claude Code 等），使其在执行过程中能够自主决策并调用相应能力完成任务。

### `tools`

> 类型：`object`
>
> 必填：否

用于向 AI Agent 暴露可调用的工具集合，每个工具以键值对形式定义。

工具名称推荐使用小写 `snake_case`，用于唯一标识工具，例如：`say_hi`、`video_convert`。

### 工具定义

每个工具定义对象支持以下字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `description` | `string` | 是 | 工具功能说明，便于 AI Agent 理解和调用 |
| `inputSchema` | `object` | 是 | JSON Schema 定义工具输入参数结构，遵循 [JSON Schema 规范](https://json-schema.org/)。必须为有效对象，不能为 `null`，无参数工具配置为 `{ "type": "object", "additionalProperties": false }`  |
| `outputSchema` | `object` | 否 | JSON Schema 定义工具输出结果结构，遵循 [JSON Schema 规范](https://json-schema.org/) |

### `tools` 约束

- 工具名称必须唯一。
- 工具名称建议使用小写 `snake_case`。
- `inputSchema` 必须是有效的 JSON Schema 对象，且不能为 `null`。
- `outputSchema` 未配置时，表示不声明工具输出结构。
- `tools` 中声明的工具必须通过 [utools.registerTool()](../api-reference/ai#utools-registertool-name-handler) 注册。
- `plugin.json` 中声明的工具名称必须与 `registerTool()` 使用的名称一致。

### `tools` 配置示例

以下为 `tools` 字段的配置示例（需作为 `plugin.json` 的顶层字段）：

```json
"tools": {
  "say_hi": {
    "description": "向用户打个招呼",
    "inputSchema": { "type": "object", "additionalProperties": false }
  },
  "video_convert": {
    "description": "视频格式转换",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "inputPath": {
          "type": "string",
          "description": "输入视频文件绝对路径"
        },
        "format": {
          "type": "string",
          "enum": ["mp4", "mkv", "mov", "webm", "avi", "flv", "wmv"],
          "description": "目标视频格式"
        }
      },
      "required": ["inputPath", "format"]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "outputPath": {
          "type": "string",
          "description": "输出视频文件绝对路径"
        }
      },
      "required": ["outputPath"]
    }
  }
}
```

## plugin.json 最小可运行配置示例

```json
{
  "main": "index.html",
  "logo": "logo.png",
  "features": [
    {
      "code": "hello",
      "cmds": ["你好"]
    }
  ]
}
```

## plugin.json 完整配置示例

```json
{
  "main": "index.html",
  "logo": "logo.png",
  "preload": "preload.js",
  "features": [
    {
      "code": "test-text",
      "description": "功能指令 —— 可搜索打开的指令示例",
      "cmds": ["功能指令"]
    },
    {
      "code": "test-regex",
      "description": "匹配指令 —— 正则匹配示例",
      "cmds": [
        {
          "type": "regex",
          "label": "打开网址",
          "match": "/^https?:\\/\\/[^\\s/$.?#]\\S+$|^[a-z0-9][-a-z0-9]{0,62}(\\.[a-z0-9][-a-z0-9]{0,62}){1,10}(:[0-9]{1,5})?$/im"
        }
      ]
    },
    {
      "code": "test-files",
      "description": "匹配指令 —— 文件或文件夹匹配示例",
      "cmds": [
        {
          "type": "files",
          "fileType": "file",
          "extensions": ["png", "jpg", "jpeg", "svg", "webp", "tiff", "avif", "heic", "bmp", "gif"],
          "label": "图片批量处理"
        }
      ]
    },
    {
      "code": "test-img",
      "description": "匹配指令 —— 图像匹配示例",
      "cmds": [
        {
          "type": "img",
          "label": "OCR 文字识别"
        }
      ]
    },
    {
      "code": "test-over",
      "description": "匹配指令 —— 任意文本匹配示例",
      "cmds": [
        {
          "type": "over",
          "label": "Google 搜索",
          "exclude": "/\\n/",
          "minLength": 1,
          "maxLength": 500
        }
      ]
    },
    {
      "code": "test-window",
      "description": "匹配指令 —— 当前活动应用窗口匹配示例",
      "cmds": [
        {
          "type": "window",
          "match": {
            "app": ["explorer.exe", "Finder.app"]
          },
          "label": "终端中打开当前窗口目录"
        }
      ]
    }
  ],
  "tools": {
    "say_hi": {
      "description": "向用户打个招呼",
      "inputSchema": { "type": "object", "additionalProperties": false }
    }
  }
}
```
