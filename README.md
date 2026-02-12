# ✨ AI Anywhere - 你的定制化 AI Agent 🚀

> **随时随地，便捷召唤 AI！支持 MCP 与 Skill 技能库，将 AI 从简单的“聊天机器人”升级为能够执行复杂任务的“全能AI助手”。**

<p align="center">
  <a href="https://www.u-tools.cn/plugins/detail/AI%20Anywhere/">
    <img src="https://img.shields.io/badge/uTools-Plugin-blue?style=flat-square&logo=utools" alt="uTools Plugin">
  </a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
  <a href="https://github.com/Komorebi-yaodong/Anywhere">
    <img src="https://img.shields.io/github/stars/Komorebi-yaodong/Anywhere?style=flat-square" alt="Stars">
  </a>
</p>

Anywhere 是一款为 **uTools** 打造的深度定制化 AI 助手插件。它不仅仅是一个聚合 API 的聊天窗口，更是一个集成了 **MCP 工具调用**、**Skill 流程编排**、**多模态交互** 以及 **多端数据同步** 的生产力平台。

无论是日常的划词翻译、变量命名、OCR、文件总结，还是基于 MCP 和 SKILL 的智能爬虫、自动化工作流，它都能成为你最得力的助手。同时，Anywhere 也可作为 AI 服务商的集成平台，或个人提示词的理想存储与管理工具。

---

## 📸 功能预览

### 🚀 极速交互模式

**快捷输入**：极速启动的悬浮条。适用于划词翻译、变量命名等“阅后即焚，快捷输入”的轻量级任务。支持流式打字机效果，任务结束后自动销毁。

![快捷输入模式](image/快捷输入模式-深色.gif)

### 💬 独立对话窗口

**独立窗口**：功能完整的对话界面。支持多轮对话、文件拖拽、图片粘贴、语音交互，打造自定义Agent，支持自定义背景。

![独立窗口模式](image/独立对话窗口界面.gif)
![自定义背景图片](image/背景图片示例.png)

---

## 💡 核心特性

### 🧠 真正的智能 Agent (MCP 支持)

打破 AI 与物理世界的隔阂。通过引入 **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)**，Anywhere 让 AI 拥有了“双手”：

* **内置强力工具**：开箱即用，无需配置即可支持 **Python 代码执行**、**全能文件操作** (读/写/搜索/正则替换)、**终端命令执行** (Bash/PowerShell)、**联网搜索** (DuckDuckGo)。
* **无限扩展**：兼容社区成千上万的 MCP 服务 (Stdio/HTTP/SSE)。
* **安全可控**：支持人工审批机制，高风险操作需确认。

![MCP管理界面](image/MCP管理界面.png)

### 📚 Skill 技能库 (SOP 编排)

如果 MCP 是手，Skill 就是 AI 的“大脑”。

* **SOP 标准化**：将复杂的任务（如代码审查规范、周报生成模板）封装成技能包。
* **子智能体模式 (Sub-Agent)**：对于复杂任务，Anywhere 可以启动一个独立的 Agent 专注执行该技能，主对话流仅接收最终结果。

![SKILL下载示例](image/skill下载示例.gif)

### ⚡ 便捷调用与管理

支持通过 uTools 关键字、快捷键、以及选中文本/文件/图片后的超级面板快速调用。

|           指令调用           |               快捷调用               |
| :---------------------------: | :-----------------------------------: |
| ![指令调用](image/指令调用.png) | ![快捷调用方法](image/快捷调用方法.png) |

### ☁️ 数据与隐私

* **WebDAV 同步**：支持坚果云、Nextcloud 等 WebDAV 服务，实现多台电脑间的配置与对话记录秒级同步。
* **本地隐私优先**：对话记录默认存储在本地 JSON 文件中，支持自动保存。

![云端对话管理页面](image/对话管理界面.png)

---

## 📖 界面概览

<details>
<summary><b>🖱️ 点击展开更多界面截图</b></summary>

|             快捷助手管理             |            服务商配置            |
| :-----------------------------------: | :-------------------------------: |
| ![快捷助手界面](image/快捷助手界面.png) | ![服务商页面](image/服务商界面.png) |

|           设置中心           |
| :---------------------------: |
| ![设置界面](image/设置界面.png) |

</details>

---

## 📚 详细文档

我们为不同模块提供了详尽的文档，帮助你挖掘 Anywhere 的潜力：

| 模块                   | 说明                                                              | 文档链接                        |
| :--------------------- | :---------------------------------------------------------------- | :------------------------------ |
| **历史对话**     | 管理本地与云端对话记录，自动清理与导出。                          | [查看文档](./docs/chat_doc.md)     |
| **快捷助手**     | 学习创建不同类型的助手（文本/截图/文件），设置窗口行为。          | [查看文档](./docs/ai_doc.md)       |
| **MCP 服务**     | **(高阶)** 配置 Python 环境，启用内置工具，接入第三方服务。 | [查看文档](./docs/mcp_doc.md)      |
| **Skill 技能库** | **(高阶)** 编写 SOP，创建SKILL，支持子智能体模式。         | [查看文档](./docs/skill_doc.md)    |
| **服务商管理**   | 配置多模型、负载均衡及自定义模型参数。                            | [查看文档](./docs/provider_doc.md) |
| **设置与同步**   | 全局设置、语音配置及 WebDAV 云同步教程。                          | [查看文档](./docs/setting_doc.md)  |

*所有文档均可以在设置页面左上角的使用指南中查看*

---

## 🛠️ 开发者指南

如果你想参与 Anywhere 的开发，或者想自己编译修改版，请参考以下指南。

### 项目结构

本项目是一个基于 Electron (uTools 环境) 的多窗口应用，主要包含以下部分：

```text
Anywhere/
├── backend/            # 后端逻辑 (Node.js)，处理文件读写、MCP连接、Preload脚本
├── Anywhere_main/      # 主界面前端 (Vue 3 + Element Plus)，用于设置、管理配置
├── Anywhere_window/    # 独立对话窗口前端 (Vue 3 + Element Plus)，核心交互区
├── Fast_window/        # 快捷输入条前端 (原生 HTML/JS)，轻量级交互
├── docs/               # 项目文档
├── build/              # 构建脚本与资源
├── plugin.json         # uTools 插件入口配置
└── ...
```

### 开发环境搭建与构建

请确保你的环境已安装 `Node.js` 和 `pnpm`。

1. **克隆项目**

   ```bash
   git clone https://github.com/Komorebi-yaodong/Anywhere.git
   cd Anywhere
   ```
2. **安装依赖并构建前端**
   Anywhere 由三个独立的前端项目组成，需要分别构建：

   * **主界面 (Anywhere_main)**

     ```bash
     cd Anywhere_main
     pnpm install && pnpm build
     cd ..
     ```
   * **对话窗口 (Anywhere_window)**

     ```bash
     cd Anywhere_window
     pnpm install && pnpm build
     cd ..
     ```
   * **后端/Preload (backend)**

     ```bash
     cd backend
     pnpm install && pnpm build
     cd ..
     ```
3. **整合资源**
   项目根目录提供了自动化的脚本，用于将构建好的文件移动到统一的发布目录（命名格式示例 `v2.0.0`）。

   * **Windows 用户**: 运行 `move.bat`
   * **macOS / Linux 用户**: 运行 `move.sh` (需先赋予执行权限 `chmod +x move.sh`)
4. **在 uTools 中加载**

   1. 下载并安装 [uTools 开发者工具](https://www.u-tools.cn/plugins/detail/uTools%20%E5%BC%80%E5%8F%91%E8%80%85%E5%B7%A5%E5%85%B7/)。
   2. 在开发者工具中选择「新建项目」 -> 「导入项目」。
   3. 选择第 3 步生成的文件夹（例如 `v2.0.0`）中的 `plugin.json` 文件。
   4. 点击运行即可开始调试。

---

## 💡 推荐 API 资源

如果你还没有 API Key，可以尝试以下渠道：

1. **AI Studio (Google Gemini)**: [免费申请](https://aistudio.google.com/apikey) (需配合支持 Gemini 转 OpenAI 格式的中转使用)。
2. **DeepSeek**: [官方平台](https://platform.deepseek.com/)，性能强劲，完美支持 Function Calling，且价格亲民。
3. **OpenRouter**: [聚合平台](https://openrouter.ai)，支持几乎所有主流模型。


---

[![Star History Chart](https://api.star-history.com/svg?repos=Komorebi-yaodong/Anywhere&type=Timeline)](https://star-history.com/#Komorebi-yaodong/Anywhere&Timeline)

---

## 🤝 社区与支持

Anywhere 是一个持续进化的开源项目，欢迎加入社区交流心得、分享 Skill 或反馈 Bug。

* **GitHub Issues**: [提交反馈与建议](https://github.com/Komorebi-yaodong/Anywhere/issues)
* **作者常用提示词**: [Komorebi 的提示词库](https://komorebi.141277.xyz/post?file=posts%2F5.md)
* **QQ 交流群**: `1065512489` (欢迎加群催更、分享提示词、Agent、MCP与SKILL、或者闲聊~)

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。
