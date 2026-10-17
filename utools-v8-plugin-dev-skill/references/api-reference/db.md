# 数据库

uTools 提供数据库 API，用于插件应用持久化存储用户数据。

除文档型数据库 API 外，还提供 `dbStorage` 键值存储 API，用于存储简单的配置数据。

数据库数据默认存储在用户本地计算机。
开启 uTools 数据同步后，数据可通过同步服务同步至云端，并在用户多个设备之间自动同步。

关于插件应用的数据存储方案和不同类型数据的选择，请参考：

[数据存储](../development/storage.md)


## `utools.db.put(doc)`

创建或更新数据库文档。

单个文档大小限制：最大 **1 MB**

### 类型定义

::: code-group

```ts [同步版本]
function put(doc: DbDoc): DbResult;
```

```ts [异步版本]
function put(doc: DbDoc): Promise<DbResult>;
```

:::

### 参数

- `doc`：数据库文档对象。

::: details `DbDoc` 类型定义 {#def-dbdoc}

```ts
interface DbDoc {
  /**
   * 文档唯一 ID。不存在时创建新文档，存在时更新文档
   */
  _id: string;
  /**
   * 文档版本号。更新已有文档时需要提供
   */
  _rev?: string;
  [key:string]: unknown
}
```

:::

::: details `DbResult` 类型定义 {#def-dbresult}

```ts
interface DbResult {
  /**
   * 文档 ID
   */
  id: string;
  /**
   * 最新文档版本号
   */
  rev?: string;
  /**
   * 是否成功
   */
  ok?: boolean;
  /**
   * 是否错误
   */
  error?: boolean;
  /**
   * 错误名称
   */
  name?: string;
  /**
   * 错误信息
   */
  message?: string;
}
```

:::

### 示例

::: code-group

```ts [同步版本]
// 新建文档
const doc = {
  _id: "test/doc-1",
  a: "value 1"
}
let result = utools.db.put(doc);
if (result.ok) {
  // 保存成功, 更新文档版本
  doc._rev = result.rev;
}

// 修改文档
doc.a = "value 2";
result = utools.db.put(doc);
if (result.ok) {
  doc._rev = result.rev;
}
```

```ts [异步版本]
// 新建文档
const doc = {
  _id: "test/doc-1",
  a: "value 1"
}
let result = await utools.db.promises.put(doc);
if (result.ok) {
  // 保存成功, 更新文档版本
  doc._rev = result.rev;
}

// 修改文档
doc.a = "value 2";
result = await utools.db.promises.put(doc);
if (result.ok) {
  doc._rev = result.rev;
}
```

:::

## `utools.db.get(id)`

根据文档 ID 获取文档。

文档不存在时返回 `null`。

### 类型定义

::: code-group

```ts [同步版本]
function get(id: string): DbDoc | null;
```

```ts [异步版本]
function get(id: string): Promise<DbDoc | null>;
```

:::

### 参数

- `id` 文档 ID


### 示例

::: code-group

```ts [同步版本]
// 获取文档
const doc = utools.db.get("test/doc-1");
console.log(doc);
```

```ts [异步版本]
// 获取文档
const doc = await utools.db.promises.get("test/doc-1");
console.log(doc);
```

:::

## `utools.db.remove(doc)`

删除数据库文档。

支持：
- 通过文档对象删除；
- 通过文档 ID 删除。

### 类型定义

::: code-group

```ts [同步版本]
function remove(doc: DbDoc): DbResult;
function remove(id: string): DbResult;
```

```ts [异步版本]
function remove(doc: DbDoc): Promise<DbResult>;
function remove(id: string): Promise<DbResult>;
```

:::

### 参数

- `doc` 文档对象
- `id` 文档 ID

### 示例

::: code-group

```ts [同步版本]
// 删除文档
const doc = utools.db.get("test/doc-1");
if (doc) {
  utools.db.remove(doc);
}

// 根据文档 ID 删除
const result = utools.db.remove("test/doc-1");
if (result.ok) {
  console.log("删除成功");
}
```

```ts [异步版本]
// 根据文档 ID 删除
const result = await utools.db.promises.remove("test/doc-1");
if (result.ok) {
  console.log("删除成功");
}
```

:::

## `utools.db.bulkDocs(docs)`

批量创建、更新或删除数据库文档。

批量删除是将文档对象设置为 `_deleted:true`

### 类型定义

::: code-group

```ts [同步版本]
function bulkDocs(docs: DbDoc[]): DbResult[];
```

```ts [异步版本]
function bulkDocs(docs: DbDoc[]): Promise<DbResult[]>;
```

:::

### 参数

- `docs` 文档对象集合

### 示例

::: code-group

```ts [同步版本]
// 批量创建文档
const docs = [
  { _id: "test/doc-2", a: "123" },
  { _id: "test/doc-3", a: "abc" }
];
const results = utools.db.bulkDocs(docs);
results.forEach(ret => {
  // 更新文档版本
  if (ret.ok) {
    docs.find(x => x._id === ret.id)?._rev = ret.rev;
  }
})
```

```ts [异步版本]
// 批量创建文档
const docs = [
  { _id: "test/doc-2", a: "123" },
  { _id: "test/doc-3", a: "abc" }
];
const results = await utools.db.promises.bulkDocs(docs);
results.forEach(ret => {
  // 更新文档版本
  if (ret.ok) {
    docs.find(x => x._id === ret.id)?._rev = ret.rev;
  }
})
```

:::

## `utools.db.allDocs([filter])`

获取插件应用数据库文档。

支持：

- 不传参数：获取全部文档；
- 传入字符串：根据文档 ID 前缀过滤；
- 传入数组：根据指定 ID 获取文档。

### 类型定义

::: code-group

```ts [同步版本]
function allDocs(idStartsWith?: string): DbDoc[];
function allDocs(ids: string[]): DbDoc[];
```

```ts [异步版本]
function allDocs(idStartsWith?: string): Promise<DbDoc[]>;
function allDocs(ids: string[]): Promise<DbDoc[]>;
```

:::

### 参数

- `idStartsWith` 文档 ID 前缀
- `ids` 文档 ID 数组

### 示例

::: code-group

```ts [同步版本]
// 获取所有 id 以 "test/" 作为前缀的文档
const docs1 = utools.db.allDocs("test/");
// 根据 id 数组获取对应文档数组
const docs2 = utools.db.allDocs(["test/doc-2", "test/doc-3"]);
// 获取插件应用所有文档
const docs3 = utools.db.allDocs();
console.log(docs1, docs2, docs3)
```

```ts [异步版本]
// 获取所有 id 以 "test/" 作为前缀的文档
const docs1 = await utools.db.promises.allDocs("test/");
// 根据 id 数组获取对应文档数组
const docs2 = await utools.db.promises.allDocs(["test/doc-2", "test/doc-3"]);
// 获取插件应用所有文档
const docs3 = await utools.db.promises.allDocs();
console.log(docs1, docs2, docs3)
```

:::

## `utools.db.postAttachment(id, attachment, type)`

创建附件。

数据库支持存储附件，例如图片、文件等二进制数据。

::: warning 注意

附件只能创建，不能更新；单个附件最大 10 MB。
:::

### 类型定义

::: code-group

```ts [同步版本]
function postAttachment(id: string, attachment: Buffer | Uint8Array, type: string): DbResult;
```

```ts [异步版本]
function postAttachment(id: string, attachment: Buffer | Uint8Array, type: string): Promise<DbResult>;
```

:::

### 参数

- `id`：附件文档 ID
- `attachment`：附件二进制数据，支持 Buffer 或 Uint8Array
- `type`：MIME 类型，例如 `image/png`。


### 示例

::: code-group

```ts [同步版本]
const buf = fs.readFileSync("/path/to/test.png");
const result = utools.db.postAttachment("test-image-file", buf, "image/png");
if (result.ok) {
  console.log("附件存储成功");
}
```

```ts [异步版本]
const buf = fs.promises.readFile("/path/to/test.png");
const result = await utools.db.promises.postAttachment("test-image-file", buf, "image/png");
if (result.ok) {
  console.log("附件存储成功");
}
```

:::

## `utools.db.getAttachment(id)`

获取附件，不存在返回 `null`

### 类型定义

::: code-group

```ts [同步版本]
function getAttachment(id: string): Uint8Array | null;
```

```ts [异步版本]
function getAttachment(id: string): Promise<Uint8Array | null>;
```
:::

### 参数

- `id`：附件文档 ID

### 示例

::: code-group

```ts [同步版本]
const buf = utools.db.getAttachment("test-image-file");
if (buf) {
  fs.writeFileSync(utools.getPath('downloads') + "/test.png", buf);
}
```

```ts [异步版本]
const buf = await utools.db.promises.getAttachment("test-image-file");
if (buf) {
  await fs.promises.writeFile(utools.getPath('downloads') + "/test.png", buf);
}
```

:::

## `utools.db.getAttachmentType(id)`

获取附件 MIME 类型，不存在返回 `null`

### 类型定义

::: code-group

```ts [同步版本]
function getAttachmentType(id: string): string | null;
```

```ts [异步版本]
function getAttachmentType(id: string): Promise<string | null>;
```

:::

### 参数

- `id`：附件文档 ID

### 示例

::: code-group

```ts [同步版本]
const type = utools.db.getAttachmentType("test-image-file");
console.log(type);
```

```ts [异步版本]
const type = await utools.db.promises.getAttachmentType("test-image-file");
console.log(type);
```

:::

## `utools.db.replicateStateFromCloud()`

获取数据从云端拉取到本地的状态。

拉取完成表示云端中来自其他设备的数据变更已全部更新到本机。此时读取数据库可以获取其他设备产生的最新数据。

在需要基于完整数据进行一致性处理时（例如清理未被引用的附件），应先确认云端数据已拉取完成。

### 类型定义

::: code-group

```ts [同步版本]
function replicateStateFromCloud(): State;
```

```ts [异步版本]
function replicateStateFromCloud(): Promise<State>;
```

:::

::: details `State` 类型定义

```ts
type State = null | 0 | 1;
```

| 状态 | 说明 |
| ---  | --- |
| `null` | 用户未开启数据同步 |
| `0` | 云端数据已完成拉取，本机已包含其他设备的最新数据变更 |
| `1` | 正在从云端拉取数据 |

:::

### 示例

::: code-group

```ts [同步版本]
const state = utools.db.replicateStateFromCloud();

if (state === 1) {
  console.log("数据库正在从云端拉取数据...");
} else if (state === 0) {
  // 云端数据已拉取完成
}
```

```ts [异步版本]
const state = await utools.db.promises.replicateStateFromCloud();

if (state === 1) {
  console.log("数据库正在从云端拉取数据...");
} else if (state === 0) {
  // 云端数据已拉取完成
}
```

:::


## `utools.dbStorage.setItem(key, value)`

保存键值数据。

::: tip

`dbStorage` 是基于 uTools 数据库封装的轻量级键值存储 API。

它的数据存储行为与数据库一致，支持 uTools 数据同步。

它提供类似浏览器 `localStorage` 的使用方式，适用于保存简单配置数据。

适用场景：

- 用户偏好设置；
- 简单配置项；
- 小量状态数据。

不适用于：

- 大量数据；
- 高频写入数据；
- 复杂数据结构。

:::

### 类型定义

```ts
function setItem(key: string, value: any): void;
```

### 参数

- `key`：键值
- `value`：数据

### 示例

```js
utools.dbStorage.setItem("key", "value");
```

## `utools.dbStorage.getItem(key)`

读取键值数据。没有数据返回 `null`

### 类型定义

```ts
function getItem(key: string): any;
```

### 参数

- `key`：键值

### 示例

```js
const value = utools.dbStorage.getItem("key");
console.log(value);
```

## `utools.dbStorage.removeItem(key)`

删除键值数据。

### 类型定义

```ts
function removeItem(key: string): boolean;
```

### 参数

- `key`：键值

### 返回

- `true`：删除成功
- `false`：删除失败

### 示例

```js
utools.dbStorage.removeItem("key");
```
