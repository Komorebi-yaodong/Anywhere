# 自定义窗口

**插件应用主界面**：指插件应用默认运行的主要界面，对应 `plugin.json` 中 `main` 指定的入口文件。

**自定义窗口**：指通过 `utools.createBrowserWindow()` 创建的窗口实例，用于承载插件应用主界面之外的独立界面。

自定义窗口基于 Electron `BrowserWindow` 实现，大部分窗口属性和方法与 Electron 保持一致，但部分功能会受到 uTools 运行环境的限制。

自定义窗口适用于需要独立于插件应用主界面运行的场景，例如：

- 全屏透明置顶窗口：用于屏幕特效、区域选择等场景
- 透明置顶小窗口：用于悬浮挂件、状态提示等场景
- 自定义业务窗口：用于编辑器、独立面板、辅助工具等场景

## 自定义窗口的开发结构

自定义窗口本质上是一个独立的 Electron `BrowserWindow` 页面实例。根据功能需求，可以包含 HTML 入口文件、UI 渲染层和 preload 桥接层。

| 内容 | 是否必需 | 说明 |
| --- | --- | --- |
| HTML 入口文件 | 必需 | 自定义窗口的页面入口 |
| UI 渲染层 | 可选 | 用于组织窗口界面和业务逻辑；简单窗口可直接写在 HTML 入口文件中 |
| preload 桥接层 | 可选 | 用于调用 Node.js 本地能力，以及实现窗口间通信。 |

### 1. HTML 入口文件（必需）

通常存放于 `public/` 目录，例如：`public/foo.html`

该 HTML 文件是自定义窗口的加载入口，创建窗口时通过相对路径（可携带查询参数）引用，例如 `foo.html` 或 `foo.html?params=`。

::: tip
完整目录结构请参考插件应用架构的[推荐开发项目结构](./plugin-architecture#推荐开发项目结构)。
:::

### 2. UI 渲染层（可选）

用于组织自定义窗口的界面和业务逻辑，通常存放于 `src/` 目录，例如 `src/foo/`。

对于简单窗口，也可以直接在 HTML 入口文件中编写界面和业务逻辑，无需单独创建 UI 目录。

目录示例：

```
src/
└── foo/
    ├── index.js      # React 启动入口
    ├── index.less    # 主样式文件（LESS）
    └── App.js        # 业务入口，可扩展功能
```

::: tip
完整目录结构请参考插件应用架构的[推荐开发项目结构](./plugin-architecture#推荐开发项目结构)。
:::

### 3. preload 桥接层（可选）

如果自定义窗口需要使用 Node.js 原生能力或接收来自插件应用主界面的消息，则需要创建对应的 `preload` 脚本文件，并放置在 `bridge/` 目录下。

例如：`bridge/foo_preload.js`

::: tip
完整目录结构请参考插件应用架构的[推荐开发项目结构](./plugin-architecture#推荐开发项目结构)。

`preload` 桥接的编写规范与插件应用主界面一致，请参阅 [preload 桥接层](./preload)。
:::

## 创建自定义窗口

使用 `utools.createBrowserWindow()` 创建自定义窗口。

API 文档：

[utools.createBrowserWindow(url[, options][, callback])](../api-reference/window.md#utools-createbrowserwindow-url-options-callback)

### 窗口显示

`utools.createBrowserWindow()` 创建窗口后，窗口是否立即显示由 `options.show` 控制。对于需要等待页面加载完成后再显示的窗口，建议设置 `show: false`，并在 `callback` 中调用 `win.show()`，避免窗口在页面加载未完成时显示，减少白屏或界面闪烁。

例如：
```js
const win = utools.createBrowserWindow('foo.html', {
  show: false
}, () => {
  win.show()
})
```

### 基础示例

下面的示例创建一个自定义窗口，并在页面加载完成后显示窗口、设置窗口置顶以及向窗口发送消息。

::: code-group

```js [插件应用主界面]
const win = utools.createBrowserWindow(
  "test.html",
  {
    show: false,
    title: "测试窗口",
    webPreferences: {
      preload: "test_preload.js",
    },
  },
  () => {
    // 显示
    win.show();
    // 置顶
    win.setAlwaysOnTop(true);
    // 向自定义窗口发送消息
    win.webContents.send("ping", "test");
  }
);
```

```js [自定义窗口 preload.js]
// 自定义窗口的 preload.js 中接收插件应用主界面传递过来的数据
const { ipcRenderer } = require("electron");
ipcRenderer.on("ping", (event, data) => {
  console.log(data);
});
// 向创建当前自定义窗口的插件应用主界面发送消息。
utools.sendToParent("pong", "hello world");
```

:::

## 常见窗口场景

### 全屏透明置顶窗口

全屏透明窗口适用于屏幕特效、区域选择、屏幕标注等场景。

例如：

```js
function createFullScreenTransparentWindow() {
  const cursorPoint = utools.getCursorScreenPoint();
  const currentDisplay = utools.getDisplayNearestPoint(cursorPoint);
  const displayBounds = currentDisplay.bounds;
  // Windows 下需要覆盖系统任务栏区域时开启全屏；普通屏幕特效无需开启，否则任务栏会被窗口覆盖
  const isFullscreen = utools.isWindows();
  const regionWindow = utools.createBrowserWindow("foo.html?params=xxx", {
    show: true,
    x: displayBounds.x,
    y: displayBounds.y,
    width: displayBounds.width,
    height: displayBounds.height,
    // 如果需要接收鼠标事件，可设置为接近完全透明但实际具有背景的颜色
    backgroundColor: "#00000000",
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: isFullscreen,
    fullscreen: isFullscreen,
    autoHideMenuBar: true,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    alwaysOnTop: true,
    roundedCorners: false,
    hasShadow: false,
    webPreferences: {
      preload: "foo_preload.js"
    }
  });
  // 设置窗口置顶层级
  try {
    regionWindow.setAlwaysOnTop(true, "screen-saver");
  } catch {}
}
```

如果透明窗口需要接收鼠标事件，可以将 `backgroundColor` 设置为接近完全透明但实际具有背景的颜色，例如：

```js
backgroundColor: "rgba(255, 255, 255, 0.01)"
```

::: warning 性能注意

对于包含复杂动画、视觉特效或 3D 渲染的透明窗口，建议保持 `focusable: true` 并让窗口获得焦点。

设置 `focusable: false` 后，窗口可能被 Chromium 视为非活动窗口，从而降低渲染优先级或帧率，导致动画出现卡顿。`backgroundThrottling: false` 并不能完全避免这种情况，因此对高性能动画场景，建议让窗口保持可聚焦并主动获得焦点。

:::

### 透明置顶小窗口

透明置顶小窗口适用于悬浮挂件、状态提示等场景。

例如：

```js
const win = utools.createBrowserWindow(
  "widget.html",
  {
    show: false,
    width: 300,
    height: 200,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: "widget_preload.js"
    }
  },
  () => {
    win.show();
    // 设置窗口置顶层级
    try {
      win.setAlwaysOnTop(true, 'screen-saver');
    } catch {}
  }
);
```

## 插件应用主界面与自定义窗口通信

插件应用主界面与自定义窗口运行在不同的窗口环境中，可以通过 Electron IPC 进行通信。

常用的通信方式如下：

| 通信方向 | 发送方式 | 接收方式 |
| --- | --- | --- |
| 插件应用主界面 → 自定义窗口 | `win.webContents.send()` | 自定义窗口 `preload` 中的 `ipcRenderer.on()` |
| 自定义窗口 → 插件应用主界面 | `utools.sendToParent()` | 插件应用主界面 `preload` 中的 `ipcRenderer.on()` |


### 插件应用主界面 → 自定义窗口

插件应用主界面通过自定义窗口的 `webContents.send()` 发送消息：

```js
const win = utools.createBrowserWindow(
  "foo.html",
  { show: false },
  () => {
    win.show();
    win.webContents.send("channelName", {
      foo: "bar"
    });
  }
);
```

自定义窗口在 `preload` 中接收：

```js
const { ipcRenderer } = require("electron");

ipcRenderer.on("channelName", (event, data) => {
  console.log(data);
});
```

### 自定义窗口 → 插件应用主界面

自定义窗口通过 `utools.sendToParent()` 向创建它的插件应用主界面发送消息：

```js
utools.sendToParent("channelName", {
  foo: "bar"
});
```

插件应用主界面在 `preload` 中接收：

```js
const { ipcRenderer } = require("electron");

ipcRenderer.on("channelName", (event, data) => {
  console.log(data);
})
```

::: tip

`utools.sendToParent()` 用于向创建当前窗口的窗口发送消息。创建当前窗口的窗口可以是插件应用主界面，也可以是其他自定义窗口。

如果需要从自定义窗口重新打开插件应用主界面，应使用 [`utools.redirect()`](../api-reference/redirect.md)。

例如：`utools.redirect([<pluginName>, <cmdLabel>])`

其中，`pluginName` 为插件应用名称，`cmdLabel` 为要打开的功能指令名称。

:::

## 关闭自定义窗口

自定义窗口可以自行关闭，也可以由插件应用主界面关闭。

### 1. 自定义窗口自行关闭

```js
window.close()
```
::: warning 注意

如果创建窗口时禁用了窗口关闭能力（例如：`closeable: false`），则无法通过 `window.close()` 主动关闭窗口。
:::

### 2. 插件应用主界面关闭自定义窗口

如果需要由插件应用统一管理窗口生命周期，可以通过 IPC 请求插件应用主界面关闭窗口。

::: code-group

```js [自定义窗口]
utools.sendToParent("close-window");
```

```js [插件应用主界面 preload.js]
ipcRenderer.on("close-window", () => {
  win.close();
});
```

:::

::: warning 注意

uTools 主窗口隐藏后，插件应用可能会在用户设定的时间（默认 3 分钟）内自动退出。

避免在 `onPluginOut` 事件中关闭自定义窗口，以免插件应用自动退出时关闭仍在使用的自定义窗口。

:::
