# 动态功能

插件应用可以在运行时动态创建、获取和删除功能。

对于部分插件应用，功能入口无法在 `plugin.json` 中预先确定。例如，网页快开插件应用可以根据用户配置动态创建不同的网页打开功能。此类场景可以使用动态功能 API，在插件应用运行过程中动态维护功能。

动态功能与 `plugin.json` 中声明的功能使用相同的 `Feature` 数据结构，具体字段说明请参考 [plugin.json 配置说明](../development/plugin-json.md)。

## `utools.getFeatures([codes])`

获取插件应用的动态功能。

### 类型定义

```ts
function getFeatures(codes?: string[]): Feature[];
```

### 参数

- `codes`：可选，要获取的功能编码列表。不传则返回全部动态功能。

### 返回

返回动态功能对象数组。

::: details `Feature` 类型定义 {#def-feature}

```ts
interface Feature {
  /**
   * 功能唯一编码。
   */
  code: string;
  /**
   * 功能描述。
   */
  description?: string;
  /**
   * 功能图标。
   *
   * 支持：
   * - 相对路径，支持 png、jpg、jpeg、svg、webp 格式
   * - Base64 Data URL
   */
  icon?: string;
  /**
   * 指定功能可用的平台。
   *
   * 支持：
   * - "win32"
   * - "darwin"
   * - "linux"
   *
   * 参考 plugin.json 中 feature.platform
   */
  platform?: Platform | Platform[];
  /**
   * 配置为 `true` 时，通过非 uTools 搜索框入口触发该功能时，不主动显示插件应用主窗口。
   *
   * 参考 plugin.json 中 feature.mainHide
   */
  mainHide?: boolean;
  /**
   * 配置为 `true` 后，该功能匹配用户输入时，插件应用可以持续向 uTools 搜索结果区域推送动态结果。
   *
   * 参考 plugin.json 中 feature.mainPush
   */
  mainPush?: boolean;
  /**
   * 配置该功能支持的指令，包括「功能指令」和「匹配指令」。
   *
   * - `string`：功能指令
   * - `Cmd`：匹配指令
   *
   * 参考 plugin.json 中 feature.cmds
   */
  cmds: Array<string | Cmd>;
}

type Platform = "win32" | "darwin" | "linux";

interface Cmd {
  /**
   * 匹配类型。
   */
  type: "regex" | "over" | "img" | "files" | "window";
  /**
   * 指令名称。
   */
  label: string;
  /**
   * 匹配规则。
   *
   * 对应 `type` 类型：
   * - `regex`：文本内容的正则表达式
   * - `files`：文件名称的正则表达式
   * - `window`：窗口匹配规则
   * - `over`、`img`：无效
   */
  match?: string | MatchWindow;
  /**
   * 排除规则。
   *
   * 仅 `type` 为 `over` 时有效，必须为正则表达式
   */
  exclude?: string;
  /**
   * 文件扩展名过滤。
   *
   * 仅 `type` 为 `files` 时有效，例如 ["png", "jpg", "jpeg"]
   */
  extensions?: string[];
  /**
   * 匹配最小值。
   *
   * - `regex`、`over`：文本最小字符数
   * - `files`：最少文件数
   */
  minLength?: number;
    /**
   * 匹配最大值。
   *
   * - `regex`、`over`：文本最大字符数
   * - `files`：最多文件数
   */
  maxLength?: number;
}
```

:::

### 示例

```js
// 获取所有动态功能
const features = utools.getFeatures();
console.log(features);
// 获取指定功能
const features = utools.getFeatures(["code-1", "code-2"]);
console.log(features);
```

## `utools.setFeature(feature)`

设置动态功能。

如果指定的功能编码已经存在，则更新该功能；否则创建新的动态功能。

### 类型定义

```ts
function setFeature(feature: Feature): void;
```

### 参数

- `feature`：要设置的功能对象，参考 [`Feature` 类型定义](#def-feature)

### 示例

```js
utools.setFeature({
  code: Date.now().toString(),
  description: "测试动态功能",
  // "icon": "res/xxx.png",
  // "icon": "data:image/png;base64,xxx...",
  cmds: [
    "测试",
    {
      type: "over",
      label: "测试"
    }
  ]
});
```

## `utools.removeFeature(code)`

删除指定的动态功能。

### 类型定义

```ts
function removeFeature(code: string): boolean;
```

### 参数

- `code`：要删除的功能编码

### 返回

- `true`：删除成功
- `false`：删除失败或功能不存在

### 示例

```js
utools.removeFeature("code");
```