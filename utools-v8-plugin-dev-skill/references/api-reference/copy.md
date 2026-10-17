# 复制

提供向系统剪贴板复制文本、图片、文件及文件夹的能力。

## `utools.copyText(text)`

复制文本

### 类型定义

```ts
function copyText(text: string): boolean;
```

### 参数

- `text`：复制的文本

### 返回

- `true`：复制成功
- `false`：复制失败

### 示例

```js
utools.copyText("Hello World!");
```

## `utools.copyFile(filePath)`

复制文件或文件夹。

将指定文件或文件夹写入系统剪贴板。

::: warning 注意

文件复制不会立即产生文件副本，仅会将文件路径写入系统剪贴板。

用户执行粘贴操作时，由目标应用决定如何处理。

:::

### 类型定义

```ts
function copyFile(filePath: string | string[]): boolean;
```

### 参数

- `filePath`：需要复制的文件或文件夹路径。
  - 可以传入单个路径。
  - 也可以传入多个路径组成的数组。

### 返回

- `true`：复制成功
- `false`：复制失败

### 示例

```js
// 复制一个文件
utools.copyFile("/path/to/test.txt");
// 复制多个文件
utools.copyFile(["/path/to/test.txt", "/path/to/folder"]);
```

## `utools.copyImage(image)`

复制图片数据到系统剪贴板。

### 类型定义

```ts
function copyImage(image: string | Uint8Array): boolean;
```

### 参数

- `image`：
  - 图片文件路径。
  - 图片 Data URL。
  - 图片二进制数据 `Uint8Array`。

### 返回

- `true`：复制成功
- `false`：复制失败

### 示例

```js
// base64 Data URL
utools.copyImage("data:image/png;base64,......");
// 路径
utools.copyImage("/path/to/img.png");
```

## `utools.getCopiedFiles()`

获取系统剪贴板中的文件列表。

### 类型定义

```ts
function getCopiedFiles(): CopiedFile[] | null;
```

### 返回

- 返回当前剪贴板中的文件列表。
- 当当前剪贴板内容不包含文件时，返回 `null`。

::: details `CopiedFile` 类型定义

```ts
interface CopiedFile {
  /**
   * 文件路径
   */
  path: string;
  /**
   * 是否为文件夹
   */
  isDirectory: boolean;
  /**
   * 是否为文件
   */
  isFile: boolean;
  /**
   * 文件名
   */
  name: string;
}
```
:::

### 示例

```js
const copiedFiles = utools.getCopiedFiles();
if (copiedFiles) {
  copiedFiles.forEach(file => {
    console.log(file.path);
  });
}
```