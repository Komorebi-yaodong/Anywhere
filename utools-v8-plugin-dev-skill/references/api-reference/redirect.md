# 快捷入口

插件应用可以通过 API 实现功能跳转、快捷键配置与查询，帮助用户快速访问插件应用能力。

## `utools.redirect(label[, payload])`

跳转到指定插件应用的功能指令或匹配指令。

如果目标插件应用尚未安装，uTools 将跳转到插件应用市场，并根据目标信息引导用户安装。

### 类型定义

```ts
function redirect(
  label: string | [string, string],
  payload?: string | MatchPayload
): boolean;
```

::: details `MatchPayload` 类型定义
```ts
interface MatchPayload {
  /**
   * 匹配类型
   */
  type: "img" | "files";
  /**
   * 匹配数据：
   * - img：Base64 Data URL
   * - files：文件路径或文件路径集合
   */
  data: string | string[];
}
```
:::

### 参数

- `label`：目标功能指令。
  - 传入 `string` 时，表示指令名称。uTools 会查找所有拥有该指令的插件应用。
  - 传入 `[pluginName, label]` 时，分别表示插件应用名称和指令名称，uTools 会直接定位到指定插件应用的对应指令。
- `payload`：传递给目标指令的匹配内容。
  - 跳转到功能指令时，无需传递 `payload`。
  - 跳转到匹配指令时，必须传递符合目标指令匹配规则的数据。

::: tip

当 `label` 为指令名称时：

- 如果仅找到一个匹配的插件应用，则直接打开。
- 如果找到多个匹配的插件应用，则由用户选择。
- 如果未找到已安装的插件应用，则跳转到插件应用市场，并搜索对应指令名称。

当 `label` 为 `[pluginName, label]` 时：

- uTools 会直接定位到指定插件应用并打开对应指令。
- 如果插件应用尚未安装，则跳转到插件应用市场，引导用户安装后打开。
:::

### 示例

```js
// 跳转到插件应用「聚合翻译」并翻译内容
utools.redirect(["聚合翻译", "翻译"], "hello world");

// 查找「翻译」指令，并自动跳转到对应插件应用
utools.redirect("翻译", "hello world");

// 跳转到插件应用「OCR 文字识别」并识别图片中的文字
utools.redirect(["OCR 文字识别", "OCR 文字识别"], {
  type: "img",
  data: "data:image/png;base64,", // base64
});

// 跳转到插件应用「JSON 编辑器」查看 JSON 文件
utools.redirect(["JSON 编辑器", "Json"], {
  type: "files",
  data: "/path/to/test.json", // 支持数组
});
```

## `utools.redirectHotKeySetting(cmdLabel[, autocopy])`

跳转至 uTools 全局快捷键设置界面，用于用户配置指定指令的全局快捷键。

uTools 全局快捷键支持普通组合快捷键，以及以下扩展快捷键：
- 单键 `F1-F12`
- 双击 `Ctrl`、`Alt`、`Shift`

常用于为需要快速触发的功能提供快捷入口，例如：

- 通过快捷键打开「悬浮剪贴板」
- 通过快捷键触发「翻译」功能

该方法仅负责跳转快捷键设置界面，不会自动创建或修改快捷键配置。

### 类型定义

```ts
function redirectHotKeySetting(cmdLabel: string, autocopy?: boolean): void;
```

### 参数

- `cmdLabel`：指令名称，对应 `plugin.json` 中 `cmds[]` 定义的指令。
  - `autocopy` 为 `false` 时，可指定功能指令或匹配指令。通常指定功能指令名称；如果指定匹配指令，用户需要先手动复制内容，再触发全局快捷键。
  - `autocopy` 为 `true` 时，应指定匹配指令名称。
- `autocopy`：是否启用自动复制模式，默认为 `false`。
  - 设置为 `true` 时，用户通过配置的全局快捷键触发后，uTools 会自动复制当前选中内容，并使用复制的内容匹配指定的匹配指令，匹配成功后打开插件应用。
### 示例

```js
<button onClick={() => utools.redirectHotKeySetting("剪贴板") }>前往设置快捷键打开剪贴板 </button>
<button onClick={() => utools.redirectHotKeySetting("翻译", true) }>前往设置一键翻译 </button>
```

## `utools.getCmdHotKey(cmdLabel)`

获取指定指令配置的全局快捷键，返回快捷键字符串，例如：`Ctrl+Shift+A`、`F6`。如果用户未设置快捷键，则返回 `null`。

### 类型定义

```ts
function getCmdHotKey(cmdLabel: string): string | null;
```

### 参数

- `cmdLabel`：指令名称

### 示例

```js
const hotkey = utools.getCmdHotKey("截图文字识别");
if (!hotkey) {
  utools.redirectHotKeySetting("截图文字识别");
}
```
