# 数据存储

插件应用通常需要保存不同类型的数据，例如用户创建的数据、应用配置、缓存文件、日志以及生成文件等。

不同类型的数据具有不同的生命周期和使用场景，应选择合适的存储方式。

插件应用主要有以下几类数据：

| 数据类型 | 存储方式 | 生命周期 | 是否同步 |
| --- | --- | --- | --- |
| 用户数据 | 同步数据库 | 长期 | 是 |
| 应用数据 | 插件应用本地数据目录 | 长期 | 否 |
| 临时数据 | 插件应用临时目录 | 插件应用运行期间 | 否 |
| 用户文件 | 用户指定目录 | 用户管理 | 否 |

合理的数据存储设计可以：

- 保证用户重要数据可靠保存
- 减少无效数据同步，降低同步压力
- 提高插件应用运行性能
- 避免临时数据长期占用存储空间


## 用户数据

用户主动创建或配置，并且希望在不同设备之间保持的数据，应使用 uTools 提供的同步数据库。

例如：

- 文档
- 笔记
- 收藏
- 用户配置
- 业务数据


### 存储到同步数据库

如何存储用户数据，详情参考 API：[数据库](../api-reference/db.md)

::: warning 注意

同步数据库由 uTools 负责数据同步，插件应用无需实现账号关联、数据上传以及同步逻辑。

同步数据库适合存储结构化用户数据，不适合存储以下类型的数据：

- 日志文件
- 缓存数据
- 搜索索引
- 临时数据
- 二进制文件
- 操作记录
- 下载文件

此类数据通常变化频繁、数据量增长较快，且丢失后可以重新生成，应存储在插件应用本地数据目录或临时目录中。

:::


## 应用数据

插件应用运行过程中产生或需要本地保存，并且需要长期保留的数据及运行资源，应存储在插件应用本地数据目录。该目录仅保存当前设备数据，不参与 uTools 数据同步。

例如：

- SQLite 数据库
- 本地配置
- 模型文件
- 索引数据
- 缓存
- 日志
- 外部命令行工具（如 yt-dlp）
- 操作记录
- 剪贴板记录

### 存储到插件应用本地数据目录

通过 API [`utools.getPluginLocalDataPath()`](../api-reference/system.md#utools-getpluginlocaldatapath) 获取插件应用专属的本地数据目录。

通过 `preload.js` 暴露文件操作接口，将数据写入该目录。

`preload.js` 示例：

```js
const path = require("node:path");
const fs = require("node:fs");

window.services = {
  saveLocalData: (data) => {
    const filePath = path.join(utools.getPluginLocalDataPath(), 'cache.json');
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  }
};
```

::: warning 注意

插件应用本地数据目录中的数据会被持久化保存，插件应用卸载后也不会自动删除。

插件应用需要自行负责：
- 数据迁移
- 版本兼容
- 空间清理
- 数据生命周期管理

:::


## 临时数据

生命周期较短、无需持久化保存的数据，应存储在插件应用临时目录。

例如：

- 图片处理过程文件
- 文件转换中间结果
- 下载过程临时文件
- 临时缓存


### 存储到插件应用临时目录

通过 API [`utools.getPluginTempPath()`](../api-reference/system.md#utools-getplugintemppath) 获取插件应用专属的临时目录。

通过 `preload.js` 暴露文件操作接口，将临时文件写入该目录。

`preload.js` 示例：

```js
const path = require("node:path");
const fs = require("node:fs");

window.services = {
  writeTempFile: (data) => {
    const tempFile = path.join(utools.getPluginTempPath(), 'task.tmp');
    fs.writeFileSync(tempFile, data);
  }
};
```

::: warning
uTools 会在插件应用结束运行或软件退出时清理临时目录中的数据，因此请勿将需要长期保留的数据存储在此目录。
:::


## 用户文件

用户生成或导出的文件，应保存到用户可访问的位置。

例如：

- 下载文件
- 导出文件
- 生成文件
- 文件处理输出结果

插件应用可以保存到下载目录，也可以通过保存对话框让用户选择存储位置。

### 保存用户文件

通过 API [`utools.getPath(name)`](../api-reference/system.md#utools-getpath-name) 获取系统目录。

通过 API [`utools.showSaveDialog(options)`](../api-reference/window.md#utools-showsavedialog-options) 让用户选择保存位置。

`preload.js` 示例：

```js
const path = require("node:path");
const fs = require("node:fs");

window.services = {
  exportMarkdownFile: (mdText) => {
    const filePath = path.join(utools.getPath('downloads'), 'example.md');
    fs.writeFileSync(filePath, mdText, 'utf-8');
    // 导出后，直接在文件资源管理器中显示
    utools.shellShowItemInFolder(filePath);
  }
};
```
