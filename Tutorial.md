## Anywhere使用教程

### 设置页面

#### 提供商设置

- 点击`Add Provider`增加新的服务提供商（支持Openai格式）
- 设置`API KEY`与`API URL`后，点击`Get Models`可以选择该提供商的模型加入模型列表
- 点击`Add Model`设置自定义模型名称
![alt text](./image/s2.png)

### 使用设置

目前提供以下使用设置：

![alt text](./image/s3.png)
- `Stream`: 是否使用流式输出，如果选择`True`，则进行流式请求,使用流式输出。（*如果使用非流式请求，则不会使用流式请求，AI回复完成后内容才会展现，在prompt的`Show Mode`中如果选择`input`，仍旧会在用户当前输入框条用Utools的api以流式展示，但本质上是非流式请求*）
- `Skip LineBreak`：选择的文本是否自动删除换行符，如果选择`True`，则自动删除换行符，如果选择`False`，则保留换行符。在OCR或翻译等功能中可能需要保证用户的划选的多行内容自动删去换行符后发送给AI
- `Auto CloseOnBlur`：*在prompt的`Show Mode`中选择`window`后有效。* 如果选择`True`，则当用户点击窗口外的其他地方时，自动关闭窗口，如果选择`False`，则不会自动关闭窗口，实现即用即开，用完即走
- `Ctrl+Enter to Send`：*在prompt的`Show Mode`中选择`window`后有效。* 开启的提问页面中，按下`Ctrl+Enter`键发送问题，如果选择`False`，则按下`Enter`键发送问题
- `Success Notification`：如果选择`True`，则当AI回复完成后，会弹出通知，如果选择`False`，则不会弹出通知（*在prompt的`Show Mode`中选择`window`后，只有初次请求会触发成功提示，追问不再出现成功提示*）

### 提示词设置
用于多种功能定义，利用AI实现多种工具，如OCR、翻译、代码解释、变量命名等。
![alt text](./image/s2.png)


- `Add Prompt`：位于底部左侧，点击后添加新的提示词
- `Key`：提示词名称，用于在prompt中调用，如`OCR`、`Translate`等，设置的`Key`将会生成Utools匹配指令，可以在Utools的快捷设置中设置全局快捷键便于调用
![alt text](./image/t5.png)
- `Type`：调用方法，目前支持`general`、`text`和`image`
  ![alt text](./image/t6.png)
  - `general`：选择文本或者截图后，呼出utools菜单可以选择`Key`来调用工具
  - `text`：选择文本后，呼出utools菜单可以选择`Key`来调用工具，并自动将选择的文本作为输入发送给AI
  - `image`：选择截图后，呼出utools菜单可以选择`Key`来调用工具，并自动将选择的截图作为输入发送给AI
- `Show Mode`：选择工具的展示模式，目前支持`input`和`window`
  - `input`：工具的输出结果会直接显示在当前输入框中，从而实现AI便捷输入（请确保调用该功能时有聚焦输入框）
  - `window`：工具的输出结果会以窗口形式展示
- `Prompt`：设置AI的系统提示词，AI将遵守提示词要求进行回复
- `Model`：设置执行该提示词的AI模型，默认为Default，即默认提供商设置中选择的默认模型

## 工具使用

### input模式

用户选择文字/截图后，调用`Show Mode`为`input`的提示词`Key`，工具的输出结果会直接显示在当前输入框中，从而实现AI便捷输入（请确保调用该功能时有聚焦输入框）

![alt text](./image/t7.png)

### window模式

![alt text](./image/t8.png)