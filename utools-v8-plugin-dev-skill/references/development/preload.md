# preload 桥接层

`preload.js` 是插件应用连接「前端界面」与「本地能力」的桥接层。

当 `plugin.json` 配置了 `preload` 字段后，uTools 会在插件应用主界面加载前预加载指定的 JavaScript 文件。`preload.js` 运行在具有本地能力的上下文中，可以使用 Node.js 原生模块、第三方 Node.js 模块、Electron 渲染进程 API 以及 uTools API，并通过 `window` 对象向前端暴露自定义接口。

preload 桥接层可调用的能力：

| 能力 | 说明 |
| --- | --- |
| Node.js 原生模块 | 访问文件系统、进程、网络等本地能力，例如 `fs`、`path`、`os`、`child_process` |
| 第三方 Node.js 模块 | 使用通过 `npm` 安装或以源码形式引入的 Node.js 模块 |
| Electron 渲染进程 API | 使用 Electron 提供的渲染进程能力，例如 `clipboard`、`nativeImage` |
| uTools API | 调用 uTools 提供的插件应用 API |

> 关于插件应用整体架构，请参阅 [插件应用架构](./plugin-architecture)。

## `preload` 的定义

### 文件位置

`preload.js` 文件必须位于插件应用目录内，与 `plugin.json` 位于同一目录或其子目录中，以确保打包插件应用时能够将其一同打包。

### 文件声明

需要在 `plugin.json` 中通过 `preload` 字段声明文件路径。路径必须使用相对于 `plugin.json` 所在目录的相对路径。

例如：

```json
{
  "preload": "preload.js"
}
```

具体配置方式请参阅 [plugin.json 配置说明](./plugin-json#preload)。

### 模块规范

`preload.js` 遵循 **CommonJS** 模块规范，可以使用 `require()` 引入 Node.js 原生模块、第三方模块以及插件应用自己的模块。

运行环境提供的 Node.js 版本为 **v20.19.1**。

> 关于运行环境版本，请参阅 [插件应用架构](./plugin-architecture#运行环境)。

## 前端使用 `preload`

`preload.js` 可以通过 `window` 对象向前端暴露自定义接口。

推荐使用统一的命名空间，例如 `window.services`，避免向 `window` 直接挂载大量独立属性。


### 示例

::: code-group

```js [preload.js]
const fs = require("node:fs");

window.services = {
  readFile: (filePath) => {
    return fs.readFileSync(filePath, "utf8");
  },
};
```

```jsx [App.jsx]
import { useEffect, useState } from "react";
export default function App() {
  const [content, setContent] = useState("");
  useEffect(() => {
    const fileContent = window.services.readFile("/path/to/README.md");
    setContent(fileContent);
  }, []);

  return (
    <div>
      <pre>{content}</pre>
    </div>
  );
}
```

:::

## 使用 Node.js 能力

`preload.js` 文件遵循 `CommonJS` 规范，通过 `require` 引入 Node.js 模块。运行环境提供的 Node.js 版本为 v20.19.1，可以引入：

- Node.js 提供的原生模块，例如 `fs`、`path`、`os`、`child_process`
- 开发者自己编写的 Node.js 模块
- 第三方 Node.js 模块

> 关于运行环境版本，请参阅 [插件应用架构](./plugin-architecture#运行环境)。

## 引入 Node.js 原生模块

::: code-group

```js [preload.js]
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execSync } = require("node:child_process");

window.services = {
  readFile: (filename) => {
    return fs.readFileSync(filename, { encoding: "utf-8" });
  },
  getFolder: (filePath) => {
    return path.dirname(filePath);
  },
  getOSInfo: () => {
    return { arch: os.arch(), cpus: os.cpus(), release: os.release() };
  },
  execCommand: (command) => {
    execSync(command);
  },
};
```

:::

## 引入自己编写的模块

::: code-group

```js [preload.js]
const writeText = require("./libs/writeText.js");

window.services = {
  writeText,
};
```

```js [libs/writeText.js]
const fs = require("node:fs");
const path = require("node:path");

module.exports = function writeText(text, filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
  return true;
};
```

:::

## 引入第三方模块

### 通过 `npm` 安装

在 `preload.js` 同级目录下，保证存在一个独立的 `package.json`，并且设置 `type` 为 `commonjs`。

```json [package.json]
{
  "type": "commonjs",
  "dependencies": {}
}
```

在 `preload.js` 同级目录下执行 `npm install` 安装第三方模块，安装完成后即可通过 `require()` 引入。

以下是通过 `npm` 引入 `colord` 的示例:

```bash
npm install colord
```

::: code-group

```js [preload.js]
const { getFormat, colord } = require("colord");

window.services = {
  darken: (text) => {
    const fmt = getFormat(text);
    if (!fmt) {
      return [null, "请输入一个有效的颜色值，比如 #000 或 rgb(0,0,0)"];
    }
    const darkColor = colord(text).darken(0.1).toHex();
    return [darkColor, null];
  }
};
```

:::

## 引入 Electron 渲染进程 API

::: code-group

```js [preload.js]
const { clipboard, nativeImage } = require("electron");

window.services = {
  copyImage: (imageFilePath) => {
    clipboard.writeImage(nativeImage.createFromPath(imageFilePath));
  },
};
```
:::

## preload 规范

- 推荐使用统一命名空间（如 `window.services`）暴露接口，避免向 `window` 挂载大量独立属性。
- 遵循**最小暴露原则**，仅暴露前端实际需要的接口。
- 禁止直接暴露 Node.js 对象、`fs`、`child_process` 等高权限接口给前端。
