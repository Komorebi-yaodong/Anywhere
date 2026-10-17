# 系统

提供系统相关能力以及 uTools Runtime 信息查询等 API。

## `utools.getPluginLocalDataPath()`

获取插件应用本地数据目录。目录不存在时会自动创建。

插件应用运行过程中产生，并且需要长期保留的本地数据，应存储在插件应用本地数据目录。

关于插件应用的数据存储方案和不同类型数据的选择，请参考：

[数据存储](../development/storage.md)

### 类型定义

```ts
function getPluginLocalDataPath(): string;
```

### 示例

```js
// preload.js
const path = require("node:path");
const fs = require("node:fs");
const filePath = path.join(utools.getPluginLocalDataPath(), 'cache.json');
fs.writeFileSync(filePath, JSON.stringify({ name: 'test' }), 'utf-8');
```

## `utools.getPluginTempPath()`

获取插件应用临时目录。目录不存在时会自动创建。

生命周期较短、无需持久化保存的数据，应存储在插件应用临时目录。

关于插件应用的数据存储方案和不同类型数据的选择，请参考：

[数据存储](../development/storage.md)

::: warning
uTools 会在插件应用结束运行或软件退出时清理临时目录中的数据，因此请勿将需要长期保留的数据存储在此目录。
:::

### 类型定义

```ts
function getPluginTempPath(): string;
```

### 示例

```js
// preload.js
const path = require("node:path");
const fs = require("node:fs");
const filePath = path.join(utools.getPluginTempPath(), 'test.tmp');
fs.writeFileSync(filePath, "hello", "utf-8");
```

## `utools.showNotification(body[, clickFeatureCode])`

弹出系统通知。

### 类型定义

```ts
function showNotification(body: string, clickFeatureCode?: string): void;
```

### 参数

- `body`：通知内容。
- `clickFeatureCode`：点击通知后进入的功能编码，对应 `plugin.json` 中配置的 `feature.code`。不传入时，点击通知不会进入插件应用。

### 示例

```js
utools.showNotification("hello test");
```

## `utools.showOpenDialog(options)`

弹出文件选择对话框。

### 类型定义

```ts
function showOpenDialog(options: OpenDialogOptions): string[] | undefined;
```

### 参数

- `options`：文件选择对话框选项。

### 返回

- 用户确认选择：返回所选文件或文件夹的路径数组。
- 用户取消：返回 `undefined`。

::: details `OpenDialogOptions` 类型定义
```ts
interface OpenDialogOptions {
  /**
   * 对话框标题。
   */
  title?: string;
  /**
   * 默认使用的绝对目录路径、绝对文件路径或文件名。
   */
  defaultPath?: string;
  /**
   * 「确认」按钮的自定义标签。
   * 未设置时使用系统默认标签。
   */
  buttonLabel?: string;
  /**
   * 文件过滤器。
   */
  filters?: FileFilter[];
  /**
   * 对话框属性。
   *
   * 支持以下属性值：
   *
   * - `openFile`：允许选择文件。
   * - `openDirectory`：允许选择文件夹。
   * - `multiSelections`：允许多选。
   * - `showHiddenFiles`：显示隐藏文件。（macOS、Windows）
   * - `createDirectory`：允许通过对话框创建新目录。（macOS）
   * - `promptToCreate`：输入的文件路径不存在时提示创建。
   *   此选项不会直接创建文件，而是允许返回不存在的路径，由应用自行创建。（Windows）
   * - `noResolveAliases`：禁用自动解析别名路径（符号链接）。
   *   所选别名将返回其自身路径，而非目标路径。（macOS）
   * - `treatPackageAsDirectory`：将包（如 `.app`）视为目录而不是文件。（macOS）
   * - `dontAddToRecent`：不将所选项目添加到最近使用的文档列表。（Windows）
   */
  properties?: string[];
  /**
   * 显示在输入框上方的消息。（macOS）
   */
  message?: string;
}

interface FileFilter {
  /**
   * 名称
   */
  name: string;
  /**
   * 文件扩展名列表，例如 ["jpg", "png"]
   */
  extensions: string[];
}

```
:::

### 示例

```js
const files = utools.showOpenDialog({
  filters: [{ name: "JSON 文件", extensions: ["json"] }],
  properties: ["openFile"],
});

console.log(files);
```

## `utools.showSaveDialog(options)`

弹出文件保存对话框。

### 类型定义

```ts
function showSaveDialog(options: SaveDialogOptions): string | undefined;
```

### 参数

- `options`：文件保存对话框选项。

### 返回

- 用户确认保存：返回用户选择的文件路径。
- 用户取消：返回 `undefined`。

::: details `SaveDialogOptions` 类型定义
```ts
interface SaveDialogOptions {
  /**
   * 对话框标题。
   */
  title?: string;
  /**
   * 默认使用的绝对目录路径、绝对文件路径或文件名。
   */
  defaultPath?: string;
  /**
   * 「确认」按钮的自定义标签。
   * 未设置时使用系统默认标签。
   */
  buttonLabel?: string;
  /**
   * 文件过滤器。
   */
  filters?: FileFilter[];
  /**
   * 对话框属性。
   *
   * 支持以下属性值：
   *
   * - `showHiddenFiles`：显示隐藏文件。（macOS、Windows）
   * - `createDirectory`：允许通过对话框创建新目录。（macOS）
   * - `treatPackageAsDirectory`：将包（如 `.app`）视为目录而不是文件。（macOS）
   * - `dontAddToRecent`：不将所选项目添加到最近使用的文档列表。（Windows）
   * - `showOverwriteConfirmation`：当用户输入已存在的文件名时，
   *   是否显示覆盖确认对话框。（Linux）
   */
  properties?: string[];
  /**
   * 显示在输入框上方的消息。（macOS）
   */
  message?: string;
  /**
   * 文件名输入框对应的自定义标签。（macOS）
   */
  nameFieldLabel?: string;
  /**
   * 是否显示标记输入框，默认为 `true`。（macOS）
   */
  showsTagField?: boolean;
}
```
:::

### 示例

```js
const savePath = utools.showSaveDialog({
  title: "保存位置",
  defaultPath: utools.getPath("downloads"),
  buttonLabel: "保存",
});
console.log(savePath);
```

## `utools.shellOpenPath(fullPath)`

使用系统默认方式打开指定的文件或文件夹。

### 类型定义

```ts
function shellOpenPath(fullPath: string): Promise<string>;
```

### 参数

- `fullPath`：文件或文件夹路径。

### Promise 返回

- 操作成功：返回空字符串 `""`。
- 操作失败：返回包含错误信息的字符串。

### 示例

```js
const error = await utools.shellOpenPath("/path/to/test.txt");
if (error) {
  console.error(error);
}
```

## `utools.shellTrashItem(fullPath)`

将指定的文件或文件夹移入系统回收站。

### 类型定义

```ts
function shellTrashItem(fullPath: string): Promise<void>;
```

### 参数

- `fullPath`：文件或文件夹路径。

### 示例

```js
await utools.shellTrashItem("/path/to/test.txt");
```

## `utools.shellShowItemInFolder(fullPath)`

在系统文件管理器中显示指定的文件或文件夹。

### 类型定义

```ts
function shellShowItemInFolder(fullPath: string): void;
```

### 参数

- `fullPath`：文件或文件夹路径。

### 示例

```js
utools.shellShowItemInFolder("/path/to/test.txt");
```

## `utools.shellOpenExternal(url)`

使用系统默认应用打开指定的 URL 或协议链接。

### 类型定义

```ts
function shellOpenExternal(url: string): Promise<void>;
```

### 参数

- `url`：URL 或协议链接，通常为 `http` 或 `https` 协议，也支持其他系统协议，例如 `mailto`。

### 示例

```js
// 打开 uTools 官网
await utools.shellOpenExternal("https://www.u-tools.cn");
// 打开邮件客户端
await utools.shellOpenExternal("mailto:example@example.com?subject=Hello&body=How%20are%20you%3F");
```

## `utools.shellBeep()`

播放系统提示音。

### 类型定义

```ts
function shellBeep(): void;
```

### 示例

```js
utools.shellBeep();
```

## `utools.getNativeId()`

获取当前插件应用对应的设备 ID。

设备 ID 经过哈希处理，可用于在当前插件应用中区分不同设备。不同插件应用获取的设备 ID 相互独立。


### 类型定义

```ts
function getNativeId(): string;
```

### 示例

```js
const nativeId = utools.getNativeId();
console.log(nativeId);
```

## `utools.getAppVersion()`

获取 uTools 软件版本。

### 类型定义

```ts
function getAppVersion(): string;
```

### 示例

```js
console.log(utools.getAppVersion());
```

## `utools.getUser()`

获取当前登录用户的信息。

### 类型定义

```ts
function getUser(): UserInfo | null;
```

### 返回

- 用户已登录：返回 `UserInfo`
- 用户未登录：返回 `null`

::: details `UserInfo` 类型定义

```ts
interface UserInfo {
  /**
   * 用户头像 URL
   */
  avatar: string;
  /**
   * 用户昵称
   */
  nickname: string;
  /**
   * 用户类型
   *
   * - `user`：普通用户
   * - `member`：uTools 会员用户
   */
  type: "member" | "user";
}
```

:::

### 示例

```js
const user = utools.getUser();
if (user) {
  console.log(user.nickname);
}
```

## `utools.getPath(name)`

获取 uTools 提供的系统路径。

### 类型定义

```ts
function getPath(name: string): string;
```

### 参数

- `name`：路径名称，支持以下值：
  - `home`：用户主目录
  - `temp`：系统临时目录
  - `desktop`：用户桌面目录
  - `documents`：用户文档目录
  - `downloads`：用户下载目录
  - `music`：用户音乐目录
  - `pictures`：用户图片目录
  - `videos`：用户视频目录

### 返回

- 返回完整路径。

### 示例

```js
const downloadsPath = utools.getPath('downloads');
console.log(downloadsPath);
```

## `utools.getFileIcon(filePath)`

获取文件、文件夹或指定类型对应的系统图标。

### 类型定义

```ts
function getFileIcon(filePath: string): string;
```

### 参数

- `filePath`：文件路径、文件扩展名或特殊类型。
  - 传入文件路径时，获取该文件对应的系统图标。
  - 传入文件扩展名时，获取该扩展名对应的系统图标，例如 `.txt`。
  - 传入 `folder` 时，获取系统文件夹图标。

### 返回

- 返回图标的 Base64 Data URL 字符串。

### 示例

```js
// 获取 txt 文件类型图标
const txtIcon = utools.getFileIcon(".txt");
// 获取系统文件夹图标
const folderIcon = utools.getFileIcon("folder");
// 获取快捷方式对应图标
const folderIcon = utools.getFileIcon("C:\\Users\\Public\\Desktop\\微信.lnk");
```

## `utools.getFileIconAsync(filePath)`

异步获取文件、文件夹或指定类型对应的系统图标。

### 类型定义

```ts
function getFileIconAsync(filePath: string): Promise<string>;
```

### 参数

- filePath：参考 `utools.getFileIcon(filePath)`。

### Promise 返回

- 返回图标的 Base64 Data URL 字符串。

### 示例

```js
const docxIcon = await utools.getFileIconAsync(".docx");
console.log(docxIcon)
```

## `utools.readCurrentFolderPath()`

读取当前活动文件管理器窗口的路径。

仅当当前活动窗口为系统文件管理器时有效。

::: warning

Linux 不支持此 API。

:::

### 类型定义

```ts
function readCurrentFolderPath(): Promise<string>;
```

### 示例

```js
const folderPath = await utools.readCurrentFolderPath();
console.log(folderPath);
```

## `utools.readCurrentBrowserUrl()`

读取当前活动浏览器窗口的 URL。

仅当当前活动窗口为浏览器时有效。

::: warning

Linux 不支持此 API。

由于浏览器实现存在差异，目前仅对以下浏览器完成测试：

- Windows：Chrome、Edge、Firefox
- macOS：Safari、Chrome、Edge

:::

### 类型定义

```ts
function readCurrentBrowserUrl(): Promise<string>;
```

### 示例

```js
const url = await utools.readCurrentBrowserUrl();
console.log(url);
```

## `utools.isDev()`

判断当前插件应用是否运行在开发环境。

插件应用开发环境是指：插件应用项目通过「uTools 开发者工具」安装的开发工程。

### 类型定义

```ts
function isDev(): boolean;
```

### 返回

- `true`：开发环境。
- `false`：生产环境。

### 示例

```js
if (utools.isDev()) {
  console.log("插件应用开发环境");
}
```

## `utools.isMacOS()`

判断当前操作系统是否为 macOS。

### 类型定义

```ts
function isMacOS(): boolean;
```

### 返回

- `true`：当前系统为 macOS。
- `false`: 当前系统不是 macOS。

### 示例

```js
if (utools.isMacOS()) {
  console.log("当前系统是 macOS");
}
```

## `utools.isWindows()`

判断当前操作系统是否为 Windows。

### 类型定义

```ts
function isWindows(): boolean;
```

### 返回

- `true`：当前系统为 Windows。
- `false`: 当前系统不是 Windows。

### 示例

```js
if (utools.isWindows()) {
  console.log("当前系统是 Windows");
}
```

## `utools.isLinux()`

判断当前操作系统是否为 Linux。

### 类型定义

```ts
function isLinux(): boolean;
```

### 返回

- `true`：当前系统为 Linux。
- `false`：当前系统不是 Linux。

### 示例

```js
if (utools.isLinux()) {
  console.log("当前系统是 Linux");
}
```

## `utools.isDarkColors()`

判断当前 uTools 是否使用深色主题。

### 类型定义

```ts
function isDarkColors(): boolean;
```

### 返回

- `true`: 当前 uTools 使用深色主题。
- `false`: 当前 uTools 使用浅色主题。

### 示例

```js
if (utools.isDarkColors()) {
  console.log("深色主题");
}
```

::: tip

对插件应用界面主题进行判断时，推荐使用 `prefers-color-scheme`。

```js
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  // 当前是否为深色主题
  let isDark = mediaQuery.matches;
  // 监听主题切换
  mediaQuery.addEventListener("change", (event) => {
    isDark = event.matches;
  });
```
:::