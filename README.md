# Anywhere
随时随地，召唤AI

## 页面展示
![image](/image/1.png)
![image](/image/2.png)
![image](/image/3.png)
![image](/image/4.png)

## 功能：
1. 选中文本后，在要输入的地方调用快捷方式“Completion”（没有选中文本不会显示快捷方式），搭配快捷键更好“食用”
2. 复制图片后，在要输入的地方调用快捷方式（未默认定义图片的快捷方式，用户可以自行定义），搭配快捷键更好”食用“
3. 支持自定义API（OenAI API 格式）
4. 支持自定义补全提示词，如果需要更新默认提示词需要手动清除utools数据（建议自定义提示词与自定义快捷键），发送文本则选择“text”类型，发送图片则选择“img”类型

## 注意：
1. 使用的utools内置api实现模拟输入，对虚拟机并不友好，自动输入和能导致文本重复，请不要在虚拟机中使用
2. 使用utools内置api实现获取截图，截图默认为base64的url格式，因此推荐使用utools自带的截图工具（系统自带的截图会将图片保存为文件，暂不支持读取文件）
3. 由于AI自动回复会默认回复markdown格式，而大多markdown软件会自动补全用户格式（例如列表尾部换行后自动增加序号，而AI的回复并不会注意到这一点），两者可能产生冲突，可以使用markdown的源码模式（如果支持的话）
4. “自动分离为独立窗口”的设置可能导致文本生成时，设置界面无法关闭