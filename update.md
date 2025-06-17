## Notice
为方便使用AI Studio的免费gemini密钥，提供免费中转平台，支持开启google搜索模式（模型名称增加“:search”后缀，注意后缀是全英文字符）

**gemini中转API**：https://gemini-oai.001412.xyz/v1

**搜索模式使用**：复制一个存在的模型名称（从API获取模型，选择一个对话模型，如gemini-2.5-flash-preview-05-20），点击手动添加，将模型名称粘贴并增加":search"后缀，例如（gemini-2.5-flash-preview-05-20:search）

**使用项目**：https://github.com/Komorebi-yaodong/openai-gemini （直接连接仓库，未进行代码更改，可以通过分析仓库代码进行安全分析）

**安全提示**：当你使用他人的中转API时，他人有能力更改中转API代码实现读取你使用的密钥的，请鉴别使用

## Features
1. 全局上传文件，而非拖拽到输入框
2. 增加对话导出功能
3. 增加“恢复聊天”功能，继续之前的对话（将导出的对话以任意对话窗口打开都能够恢复对话）