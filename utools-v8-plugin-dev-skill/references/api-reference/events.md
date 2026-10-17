# 事件

事件由 uTools Runtime 主动触发，插件应用可通过注册回调函数监听生命周期、用户交互、定时任务以及数据同步相关事件。

每个插件应用仅需注册一次事件监听。

## `utools.onPluginReady(callback)`

插件应用加载完成后触发，用于执行一次性初始化任务。

该事件适用于需要在插件应用首次进入前完成的数据加载、配置读取等初始化工作。

使用该事件时，uTools Runtime 会等待 `callback` 执行完成后再进入插件应用。`callback` 支持异步函数，返回 `Promise` 时，uTools Runtime 会等待 Promise 完成。

### 类型定义

```ts
function onPluginReady(
  callback: () => void | Promise<void>
): void;
```

### 参数

- `callback`：插件应用加载完成后触发的回调函数。

### 示例

```js
utools.onPluginReady(async () => {
  await initData();
  console.log("数据准备完成...");
});
```

## `utools.onPluginEnter(callback)`

用户进入插件应用时触发。

### 类型定义

```ts
function onPluginEnter(
  callback: (action: PluginEnterAction) => void
): void;
```

### 参数

- `callback`：插件应用进入时触发的回调函数。

::: details `PluginEnterAction` 类型定义

```ts
/**
 * 插件应用进入事件参数
 */
interface PluginEnterAction {
  /**
   * 对应 plugin.json 中 feature.code
   */
  code: string;
  /**
   * 指令类型
   *
   * 对应 plugin.json 中 feature.cmds 配置：
   *
   * - text：功能指令
   * - img / files / regex / over / window：匹配指令
   */
  type: "text" | "img" | "files" | "regex" | "over" | "window";
  /**
   * 根据指令类型对应的数据：
   *
   * - text：触发的功能指令名称
   * - regex / over：匹配到的文本
   * - img：匹配到的图像 Base64 Data URL
   * - files：匹配到的文件或文件夹列表
   * - window：匹配到的当前系统窗口信息
   */
  payload: string | MatchFile[] | MatchWindow;
  /**
   * 进入插件应用的来源
   *
   * - main：通过 uTools 搜索框进入
   * - panel：通过超级面板进入
   * - hotkey：通过全局快捷键进入
   * - redirect：其他插件应用通过 API utools.redirect() 进入
   */
  from: "main" | "panel" | "hotkey" | "redirect";
  /**
   * 附加信息
   *
   * 仅通过 onMainPush 推送结果进入时提供
   */
  option?: {
    /**
     * 用户选择的推送结果文本
     */
    text?: string;
  };
}
```

:::

::: details `MatchFile` 类型定义

```ts
/**
 * 匹配到的文件或文件夹信息
 */
interface MatchFile {
  /**
   * 是否为文件
   */
  isFile: boolean;
  /**
   * 是否为文件夹
   */
  isDirectory: boolean;
  /**
   * 文件或文件夹名称
   */
  name: string;
  /**
   * 文件或文件夹绝对路径
   */
  path: string;
}
```

:::

::: details `MatchWindow` 类型定义

```ts
/**
 * 匹配到的窗口信息
 */
interface MatchWindow {
  /**
   * 窗口唯一标识
   */
  id: number;
  /**
   * 窗口标题
   */
  title: string;
  /**
   * 窗口左上角 X 坐标
   */
  x: number;
  /**
   * 窗口左上角 Y 坐标
   */
  y: number;
  /**
   * 窗口宽度
   */
  width: number;
  /**
   * 窗口高度
   */
  height: number;
  /**
   * 应用程序路径
   */
  appPath: string;
  /**
   * 应用进程 ID
   */
  pid: number;

  /**
   * 应用名称
   */
  app: string;
}
```

:::

### 示例

```js
utools.onPluginEnter(({ code, type, payload, from }) => {
  console.log("进入插件应用:", code);
  console.log("触发类型:", type);
  console.log("数据:", payload);
  console.log("来源:", from);
});
```

## `utools.onPluginOut(callback)`

插件应用退出到后台或结束运行时触发。

### 类型定义

```ts
function onPluginOut(
  callback: (isKill: boolean) => void
): void;
```

### 参数
- `callback`：插件应用退出到后台或结束运行时触发的回调函数。
  - `isKill`
    - `true`: 插件应用进程结束运行
    - `false`: 插件应用隐藏到后台，进程仍保持运行

### 示例

```js
utools.onPluginOut((isKill) => {
  if (isKill) {
    console.log("插件应用结束运行");
  } else {
    console.log("插件应用退出到后台");
  }
});
```

## `utools.onScheduleTrigger(callback)`

定时任务触发时调用。若插件应用当前未运行，uTools Runtime 会启动插件应用，并触发该事件。

### 类型定义

```ts
function onScheduleTrigger(
  callback: (action: ScheduleTriggerAction) => void
): void;
```

### 参数

- `callback`：定时任务触发时调用的回调函数。
  - `action`：定时任务信息。

::: details `ScheduleTriggerAction` 类型定义

```ts
/**
 * 定时任务触发事件参数
 */
interface ScheduleTriggerAction {

  /**
   * 定时任务唯一标识
   *
   * 对应 utools.requestSchedule({
   *   code,
   *   label,
   *   trigger
   * })
   * 中设置的 code
   */
  code: string;
}
```

参考 API [`utools.requestSchedule({ code, label, trigger })`](./schedule.md#utoolsrequestscheduleschedule)

:::


### 示例

```js
utools.onScheduleTrigger(({ code }) => {
  if (code === 'show-notification') {
    utools.showNotification('定时任务触发');
    return;
  }
  if (code === 'open-url') {
    utools.shellOpenExternal('https://www.u-tools.cn')
  }
});
```

## `utools.onMainPush(callback, onSelect)`

向 uTools 搜索框推送动态内容，并处理用户选择推送结果后的行为。

::: warning 注意
需要在 `plugin.json` 中配置 `feature.mainPush: true`。详情参考 [plugin.json 配置说明](../development/plugin-json.md)
:::

### 类型定义

```ts
function onMainPush(
  callback: (action: MainPushAction) => MainPushResult[],
  onSelect?: (action: PluginEnterAction) => boolean | undefined
): void;
```

### 参数

- `callback`：搜索框请求推送内容时调用，返回推送结果列表。返回结果将显示在 uTools 搜索框的搜索结果中。
- `onSelect`：用户选择推送结果时调用。
  - 回调参数为 `PluginEnterAction`，其中 `option` 包含用户选择的推送结果信息。
  - 仅返回 `true` 时进入插件应用，并触发 `onPluginEnter`。

::: details `MainPushAction` 类型定义

```ts
/**
 * 搜索框推送请求参数
 */
interface MainPushAction {
  /**
   * 对应 plugin.json 中 feature.code
   */
  code: string;
  /**
   * 指令类型
   *
   * 对应 plugin.json 中 feature.cmds 配置：
   *
   * - text：功能指令
   * - img / files / regex / over / window：匹配指令
   */
  type: "text" | "img" | "files" | "regex" | "over" | "window";
  /**
   * 根据指令类型对应的数据：
   *
   * - text：触发的功能指令名称
   * - regex / over：匹配到的文本
   * - img：匹配到的图像 Base64 Data URL
   * - files：匹配到的文件或文件夹列表
   * - window：匹配到的当前系统窗口信息
   */
  payload: string | MatchFile[] | MatchWindow;
}
```
:::

::: details `MainPushResult` 类型定义

```ts
/**
 * 向搜索框推送结果
 */
interface MainPushResult {
  /**
   * 图标相对路径
   */
  icon?: string;
  /**
   * 显示文本
   */
  text: string;
  /**
   * 鼠标悬停时显示的提示文本
   */
  title?: string;
}
```

:::

### 示例

```js
utools.onMainPush(
  () => {
    return [
      {
        icon: "icon.png",
        text: "选项 A"
      }
    ];
  },
  ({ option }) => {
    console.log(option);
    return true;
  }
);
```

## `utools.onPluginDetach(callback)`

用户通过窗口分离功能，将插件应用从 uTools 搜索框主窗口转换为独立窗口时触发。

### 类型定义

```ts
function onPluginDetach(
  callback: () => void
): void;
```

### 参数

- `callback`：插件应用从 uTools 搜索框主窗口转换为独立窗口时触发的回调函数。

### 示例

```js
utools.onPluginDetach(() => {
  console.log("插件应用已分离为独立窗口");
});
```

## `utools.onDbPull(callback)`

当插件应用数据通过 uTools 数据同步机制从其他设备更新到当前设备时触发。

### 类型定义

```ts
function onDbPull(
  callback: (docs: DbDoc[]) => void
): void;
```

### 参数

- `callback`：插件应用数据从其他设备同步到当前设备时触发的回调函数。
  - `docs`：同步到当前设备的数据列表。类型参考 [DbDoc](db.md#def-dbdoc)

### 示例

```js
utools.onDbPull((docs) => {
  console.log("同步到当前设备的数据：", docs);
});
```
