# 输入

向外部应用执行输入操作，包括粘贴文本、粘贴图像、粘贴文件以及模拟键盘输入。

调用这些 API 时，uTools 会先隐藏搜索框主窗口，并尝试将焦点返回到用户调用 API 前正在操作的外部窗口，然后执行相应的粘贴或输入操作。

这些 API 的返回值表示操作是否成功执行，并不代表目标应用一定成功接收或处理了输入内容。实际效果取决于目标窗口及操作系统对相应输入方式的支持。

::: warning
如果插件应用已分离为独立窗口，或 API 在自定义窗口中执行，调用 `hideMainWindow*` API 可能因执行 API 的窗口仍然拥有焦点而失败。
:::

## `utools.hideMainWindowPasteText(text)`

复制文本并执行粘贴操作。

### 类型定义

```ts
function hideMainWindowPasteText(text: string): boolean;
```

### 参数

- `text`：要粘贴的文本。

### 返回

- `true`：已成功执行复制和粘贴操作，但目标应用是否实际接收文本取决于当前系统及目标窗口是否支持文本粘贴。
- `false`：执行失败，例如 `text` 为空字符串，或调用 API 时当前窗口仍然拥有焦点。

### 示例

```js
utools.hideMainWindowPasteText("uTools，你的下一代工具平台");
```

## `utools.hideMainWindowPasteFile(filePath)`

复制文件并执行粘贴操作。

### 类型定义

```ts
function hideMainWindowPasteFile(filePath: string | string[]): boolean;
```

### 参数

- `filePath`：文件路径，可以是单个文件路径，也可以是文件路径数组。

### 返回

- `true`：已成功执行复制和粘贴操作，但目标应用是否实际接收文件取决于当前系统及目标窗口是否支持文件粘贴。
- `false`：执行失败，例如文件不存在，或调用 API 时当前窗口仍然拥有焦点。

### 示例

```js
// 一个文件
utools.hideMainWindowPasteFile("/path/to/test.txt");
// 多个文件
utools.hideMainWindowPasteFile(["/path/to/a.png", "/path/to/b.png"]);
```

## `utools.hideMainWindowPasteImage(image)`

复制图像并执行粘贴操作。

### 类型定义

```ts
function hideMainWindowPasteImage(image: string | Uint8Array): boolean;
```

### 参数

- `image`：图像数据，可以是图片文件路径、图片 Data URL 或 `Uint8Array`。

### 返回

- `true`：已成功执行复制和粘贴操作，但目标应用是否实际接收图像取决于当前系统及目标窗口是否支持图像粘贴。
- `false`：执行失败，例如图像不存在、图像数据无效，或调用 API 时当前窗口仍然拥有焦点。

### 示例

```js
// base64
utools.hideMainWindowPasteImage("data:image/png;base64,......");
// 路径
utools.hideMainWindowPasteImage("/path/to/test.png");
```

## `utools.hideMainWindowTypeString(text)`

模拟用户键盘输入，将文本输入到当前具有输入焦点的外部应用。

与 `hideMainWindowPasteText` 不同，此 API 不通过剪贴板，而是模拟用户输入文本的方式写入目标应用。

支持 Emoji 及其他 Unicode 字符。

::: warning
Linux 环境不支持 `hideMainWindowTypeString`，调用时将按照 `hideMainWindowPasteText` 执行
:::

### 类型定义

```ts
function hideMainWindowTypeString(text: string): boolean;
```

### 参数

- `text`：要输入的文本，支持 Emoji 及其他 Unicode 字符。

### 返回

- `true`：已成功执行输入操作，但目标应用是否实际接收文本取决于当前系统及目标窗口是否支持键盘输入。
- `false`：执行失败，例如 `text` 为空字符串，或调用 API 时当前窗口仍然拥有焦点。

### 示例

```js
utools.hideMainWindowTypeString("Test ▶ 可以是任意字符，包含 Emoji - 🐼👏🦄👨‍👩‍👧‍👦🚵🏻");
```

## `utools.startDrag(filePath)`

从插件应用中发起文件拖拽，将指定文件或文件夹拖拽到其他应用窗口。

通常在界面元素的 `dragstart` 事件中调用，用于实现文件拖拽功能。

### 类型定义

```ts
function startDrag(filePath: string | string[]): void;
```

### 参数

- `filePath`：要拖拽的文件或文件夹路径，可以是单个路径，也可以是路径数组。

### 示例

```jsx
<div
  draggable
  onDragStart={(e) => {
    // 阻止默认网页拖拽行为，调用 uTools 文件拖拽
    e.preventDefault();
    utools.startDrag("/path/to/abc.txt");
  }}
>
  拖拽文件
</div>
```