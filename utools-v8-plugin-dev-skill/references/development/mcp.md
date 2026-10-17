# MCP 集成

插件应用可以通过 MCP（Model Context Protocol）将自身 Tool 能力暴露给第三方 AI Agent。

AI Agent 可以通过 MCP 协议发现并调用 uTools 暴露的 Tool，从而使用本地插件应用能力完成任务。

通过 MCP 集成，AI Agent 可以：

- 发现 uTools MCP Server 暴露的插件应用 Tool
- 调用插件应用声明的 Tool
- 获取 Tool 执行结果
- 将 AI Agent 与本地插件应用能力连接

典型应用场景：

- AI 助手调用本地工具完成任务
- 让 Claude Code、Codex、WorkBuddy 等 AI Agent 使用 uTools 插件应用能力

## MCP 服务介绍

uTools 内置 MCP Server，为外部 AI Agent 提供访问本地插件应用 Tool 的能力。

插件应用通过 `plugin.json` 声明 Tool 信息和 Schema，并通过 `utools.registerTool()` 注册 Tool Handler。

插件应用安装后，uTools 会读取 plugin.json 中声明的 tools。当 MCP 服务启用后，这些 Tool 会通过 MCP Server 暴露给已连接的 AI Agent。

### 启用 MCP 服务

用户可以在：

```text
uTools 设置  -> AI 设置 -> MCP 服务
```
开启本地 MCP 服务。

启用后，AI Agent 可以通过 MCP 地址连接 uTools，并调用插件应用提供的工具。

### MCP 服务特点

- 本地运行，Tool 调用过程在本机完成，无需上传数据到云端
- 支持 AI Agent 自动发现和调用 Tool
- 支持多个插件应用同时提供能力
- 支持 MCP 标准客户端调用

### MCP Tool 调用流程

```text
  插件应用安装
      |
      |
uTools 自动识别 plugin.json 声明的 tools
      |
      |
uTools MCP Server 加载 Tool 声明信息
      |
      |
AI Agent 调用 Tool
      |
      |
当 Tool 被调用时，如果插件应用未运行，uTools 会启动插件应用，并初始化 Tool 执行环境
      |
      |
插件应用初始化过程中，执行 registerTool() 完成 Tool Handler 注册
      |
      |
uTools 调用 Tool Handler
      |
      |
返回执行结果给 AI Agent
```

::: warning 注意

`plugin.json.tools` 仅用于声明 Tool 信息和 Schema。实际 Tool 执行逻辑需要通过 `utools.registerTool()` 注册。

:::

## Tool Schema 定义

插件应用通过 `plugin.json` 的 `tools` 字段声明 Tool Schema, 详情参考 [plugin.json tools 配置](./plugin-json.md#tools)

Tool Schema 包括：

- Tool 名称
- 描述信息
- 输入参数 Schema
- 输出结果 Schema

::: warning Tool Schema

- description 应准确描述 Tool 能力和使用场景，帮助 AI Agent 正确选择 Tool。
- 避免返回不可序列化的数据
- 返回结果建议使用 JSON 对象

:::

## 注册插件应用工具

插件应用通过 `utools.registerTool()` 注册 MCP Tool 的执行逻辑。详情参考 API [utools.registerTool()](../api-reference/ai.md#utools-registertool-name-handler)


## 调试 MCP Tool

插件应用开发过程中，可以通过插件应用「uTools 开发者工具」验证：

- Tool 是否被正确发现
- 参数 Schema 是否正确
- Tool Handler 是否正常执行
- 返回结果是否符合预期
