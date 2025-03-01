# Anywhere
随时随地，召唤AI

## 页面展示
![image](/image/1.png)
![image](/image/2.png)
![image](/image/3.png)
![image](/image/4.png)
![image](/image/5.png)

## 功能：
1. 选中文本后，在要输入的地方调用快捷方式“Completion”（没有选中文本不会显示快捷方式），搭配快捷键更好“食用”
2. 复制图片后，在要输入的地方调用快捷方式（未默认定义图片的快捷方式，用户可以自行定义），搭配快捷键更好“食用”
3. 支持自定义API（OpenAI API格式），支持自定义模型（自定义模型会自动增加后缀，删除模型时不需要填写后缀）
4. 支持自定义提示词，发送文本或图片选择“general”类型，只发送文本则选择“text”类型，只发送图片则选择“image”类型
5. 支持多种输出选项，可以直接作为文本输入，或是通过窗口展示
6. 窗口模式支持追问（支持文字输入与图片粘贴、拖拽上传），选择Ctrl+Enter/Enter发送

### 细节
1. 支持跳过输入文本换行符的功能
2. 支持调整窗口模式下默认窗口大小：点击模型名称左侧图标后更新默认窗口大小
3. 支持“窗口失去焦点后自动消失”功能：可以在设置页面设置；打开的对话窗口在右上角可以选择当前窗口是否“失去焦点自动消失”，防止需要常显示页面意外消失


## 注意：
1. 使用的utools内置api实现模拟输入，对虚拟机并不友好，自动输入和能导致文本重复，请不要在虚拟机中使用
2. 使用utools内置api实现获取截图，截图默认为base64的url格式，因此推荐使用utools自带的截图工具（系统截图将会被识别为文件而非图片，暂不支持文件）
3. 由于AI自动回复会默认回复markdown格式，而大多markdown软件会自动补全用户格式（例如列表尾部换行后自动增加序号，而AI的回复并不会注意到这一点），选择“input”输出模式可能产生冲突，可以使用markdown的源码模式
4. “自动分离为独立窗口”可能导致文本生成时，设置界面无法关闭