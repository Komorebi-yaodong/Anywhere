# Sharp 图片处理

[Sharp](https://sharp.pixelplumbing.com/) 是一个高性能的 Node.js 图像处理库。uTools 已内置 Sharp v0.35.3，插件应用无需额外安装即可通过 `utools.sharp()` 创建 Sharp 实例，进行图片处理、格式转换、图片合成等操作。

## `utools.sharp([input], [options])`

创建 Sharp 实例。

### 类型定义

```ts
function sharp(
  input?: Buffer | Uint8Array | Uint8ClampedArray | ArrayBuffer | string | Object | Array,
  options?: SharpOptions
): Sharp;
```

### 参数

- input：输入图像数据。支持以下类型：
  - `Buffer`：Node.js Buffer，包含图片二进制数据
  - `Uint8Array` / `ArrayBuffer`：二进制图片数据
  - `string`：本地图片文件路径
  - `Object`：特殊输入对象，例如 `{ text }`，可用于根据文本创建图像。
  - `Array`：多个输入图像，可用于图像拼接；通过 `options.join.animated` 可将输入图像作为多帧动画处理。
- options：配置 Sharp 实例行为。

### 返回

返回一个 `Sharp` 实例，可以通过链式调用对图像进行处理。

::: details `SharpOptions` 类型定义

以下为常用配置项，完整配置项请参考 Sharp 官方文档。

```ts
interface SharpOptions {
  /**
   * 指定原始像素数据的尺寸和通道信息
   */
  raw?: SharpRaw;
  /**
   * 创建新图像
   */
  create?: SharpCreate;
  /**
   * 限制输入像素总量
   */
  limitInputPixels?: number;
  /**
   * 限制输入图像的最大通道数
   */
  limitInputChannels?: number;
  /**
   * 遇到无效像素数据时的处理策略
   */
  failOn?: 'none' | 'truncated' | 'error' | 'warning';
  /**
   * 处理多帧输入（GIF、WebP、TIFF 等）
   */
  animated?: boolean;
  /**
   * 处理 PDF 或 SVG 时的像素密度
   */
  density?: number;
  /**
   * 多个输入图像的拼接方式
   */
  join?: SharpJoin;
}

interface SharpColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

interface SharpRaw {
  /**
   * 图片宽度
   */
  width: number;
  /**
   * 图片高度
   */
  height: number;

  /**
   * 通道数，1～4 分别对应灰度、灰度 + Alpha、RGB、RGBA
   */
  channels: 1 | 2 | 3 | 4;
  /**
   * 是否已进行预乘 Alpha
   */
  premultiplied?: boolean;
  /**
   * 多帧原始像素数据中单帧的高度
   */
  pageHeight?: number;
}

interface SharpCreate {
  /**
   * 图片宽度
   */
  width: number;
  /**
   * 图片高度
   */
  height: number;
  /**
   * 通道数，3 表示 RGB，4 表示 RGBA
   */
  channels:  3 | 4;
  /**
   * 图片背景
   */
  background?: string | SharpColor;
}

interface SharpJoin {
  /**
   * 每行排列的图像数量
   */
  across?: number;

  /**
   * 是否将输入图像作为多帧动画处理
   */
  animated?: boolean;

  /**
   * 图片之间的间隔像素
   */
  shim?: number;

  /**
   * 拼接区域的背景色
   */
  background?: string | SharpColor;
}

```
:::

### 常用方法

图像变换：

| 方法 | 说明 |
| ---  | --- |
| `.resize(width, height)` | 调整图像尺寸 |
| `.rotate(angle)` | 旋转图像 |
| `.flip()` |	垂直翻转图像 |
| `.flop()`	| 水平翻转图像 |
| `.extract({ left, top, width, height })` |	裁剪指定区域 |
| `.extend({ top, bottom, left, right, background })` |	扩展图像边界 |
| `.trim(tolerance?)` |	裁剪边缘的相似颜色区域 |

图像处理：

| 方法 | 说明 |
| ---  | --- |
| `.grayscale()` | 转换为灰度图 |
| `.negate()` |	反相图像颜色 |
| `.blur(sigma?)` |	高斯模糊 |
| `.sharpen(sigma?, flat?, jagged?)` | 锐化图像 |
| `.threshold(threshold?)` | 将图像转换为黑白二值图 |
| `.normalize()` | 自动调整图像对比度 |
| `.gamma(gamma)` | 应用 Gamma 校正 |
| `.median(size?)` | 使用中值滤波降噪 |
| `.tint(color)` | 为图像添加颜色效果 |

图像合成：

| 方法 | 说明 |
| ---  | --- |
| `.flatten([background])` | 移除 Alpha 通道并填充背景色 |
| `.composite(images)` | 将一个或多个图像合成到当前图像 |

输出：

| 方法 | 说明 |
| ---  | --- |
| `.jpeg(options?)` | 输出 JPEG |
| `.png(options?)` | 输出 PNG |
| `.webp(options?)` | 输出 WebP |
| `.tiff(options?)` | 输出 TIFF |
| `.toBuffer()` | 将处理结果输出为 Buffer |
| `.toFile(path)` | 将处理结果保存到文件 |
| `.toUint8Array()` | 将处理结果输出为 `Uint8Array` |

信息与实例：

| 方法 | 说明 |
| ---  | --- |
| `.metadata()`| 获取图像元信息 |
| `.clone()` | 创建当前 Sharp 实例的副本 |

### 示例

```js
// 修改 JPG 尺寸
await utools.sharp('/path/to/input.jpg').resize(300, 200).toFile('/path/to/output.jpg');
```

```js
// 创建空的 PNG 图像
await utools.sharp({
  create: {
    width: 300,
    height: 200,
    channels: 4,
    background: { r: 255, g: 0, b: 0, alpha: 0.5 }
  }
}).png().toUint8Array();
```

```js
// 将 GIF 动画转为 webp 格式
await utools.sharp('/path/to/in.gif', { animated: true }).toFile('/path/to/out.webp');
```

```js
// 读取像素的原始数组并将其保存为 PNG 格式
const input = Uint8Array.from([255, 255, 255, 0, 0, 0]); // or Uint8ClampedArray
const image = utools.sharp(input, {
  raw: {
    width: 2,
    height: 1,
    channels: 3
  }
});
await image.toFile('/path/to/my-two-pixels.png');
```

```js
// 生成 RGB 高斯噪声
await utools.sharp({
  create: {
    width: 300,
    height: 200,
    channels: 3,
    noise: {
      type: 'gaussian',
      mean: 128,
      sigma: 30
    }
 }
}).toFile('/path/to/noise.png');
```

```js
// 根据文本生成图像
await utools.sharp({
  text: {
    text: 'Hello, world!',
    width: 400, // max width
    height: 300 // max height
  }
}).toFile('/path/to/text_bw.png');
```

```js
// 生成 GIF 动画
const images = ['😀', '😛'].map(text => ({
  text: { text, width: 64, height: 64, channels: 4, rgba: true }
}));
await utools.sharp(images, { join: { animated: true } }).toFile('/path/to/out.gif');
```

```js
// 根据图片元信息处理
const image = utools.sharp('/path/to/input.jpg');
const metadata = await image.metadata();
const data = await image
  .resize(Math.round(metadata.width / 2))
  .webp()
  .toBuffer();
```

### Sharp 官方文档

uTools 内置 Sharp 的 API 与 Sharp 官方 API 保持一致。更多 API 和详细参数请参考 Sharp 官方文档：

- [Constructor](https://sharp.pixelplumbing.com/api-constructor/)
- [Input metadata](https://sharp.pixelplumbing.com/api-input/)
- [Output options](https://sharp.pixelplumbing.com/api-output/)
- [Resizing images](https://sharp.pixelplumbing.com/api-resize/)
- [Compositing images](https://sharp.pixelplumbing.com/api-composite/)
- [Image operations](https://sharp.pixelplumbing.com/api-operation/)
- [Colour manipulation](https://sharp.pixelplumbing.com/api-colour/)
- [Channel manipulation](https://sharp.pixelplumbing.com/api-channel/)
- [Global properties](https://sharp.pixelplumbing.com/api-utility/)