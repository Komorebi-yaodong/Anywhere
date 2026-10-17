# 屏幕

提供屏幕相关能力，包括：

- 获取显示器信息
- 获取显示器截图
- 用户交互截图
- 屏幕取色
- 屏幕坐标转换
- 获取录屏源

::: warning 注意

屏幕坐标存在两种单位：

- DIP 坐标：用于窗口定位、Display.bounds
- 物理像素：用于截图图片尺寸

高 DPI 显示器下，物理像素通常为 DIP × scaleFactor。不同显示器可能具有不同的 scaleFactor。

```text
物理像素 ≈ DIP × scaleFactor
```
开发者进行坐标计算时，应根据 API 的坐标单位选择对应的坐标类型。涉及 DIP 与物理像素之间的转换时，建议使用 `screenToDipPoint()`、`dipToScreenPoint()` 等 API，不要自行进行换算。

:::

## `utools.captureDisplay(options)`

获取显示器截图，用于程序自动截图，不显示截图交互界面。

未指定显示器时，返回所有显示器的截图。

### 类型定义

```ts
function captureDisplay(options?: CaptureDisplayOptions): Promise<DisplayCapture[]>;
```

### 参数

- `options`: 屏幕截图选项。
  - `displayId`：指定要截取的显示器 ID。未设置时返回所有显示器的截图。

::: details `CaptureDisplayOptions` 类型定义

```ts
interface CaptureDisplayOptions {
  /**
   * 显示器 ID
   *
   * 不设置时返回所有显示器截图
   */
  displayId?: number;
}
```

:::

::: details `DisplayCapture` 类型定义

```ts
interface DisplayCapture {
  /**
   * 显示器信息
   */
  display: Display;
  /**
   * 显示器截图图片。
   *
   * 图片尺寸单位为物理像素。
   */
  image: NativeImage;
}
```
:::

::: details `Display` 类型定义

```ts
interface Display {
  /**
   * 显示器唯一 ID
   */
  id: number;
  /**
   * 显示器边界区域
   *
   * 坐标单位为 DIP
   */
  bounds: Rectangle;
  /**
   * 可用工作区域
   *
   * 排除任务栏等系统区域
   * 坐标单位为 DIP
   */
  workArea: Rectangle;
  /**
   * 可用工作区域尺寸。
   *
   * 单位为 DIP。
   */
  workAreaSize: Size;
  /**
   * 显示器缩放比例
   *
   * 例如：
   * Windows 125% 缩放：
   * scaleFactor = 1.25
   */
  scaleFactor: number;
  /**
   * 显示器旋转角度
   *
   * 0、90、180、270
   */
  rotation: number;
  /**
   * 显示器内部名称
   */
  label?: string;
}
```
:::

::: details `Rectangle` 类型定义 {#rectangle}
```ts
interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
```
:::

::: details `Size` 类型定义 {#size}
```ts
interface Size {
  width: number;
  height: number;
}
```
:::

::: details `Point` 类型定义
```ts
interface Point {
  x: number;
  y: number;
}
```
:::

::: details `NativeImage` 类型定义 {#native-image}
```ts
interface NativeImage {
  /**
   * 获取图片尺寸。
   */
  getSize(): Size;
  /**
   * 转换为 PNG Buffer
   */
  toPNG(): Buffer;
  /**
   * 转换为 JPEG Buffer
   *
   * @param quality 图片质量，范围 0-100
   */
  toJPEG(quality: number): Buffer;
  /**
   * 转换为 Data URL
   */
  toDataURL(): string;
  /**
   * 裁剪图片区域。
   */
  crop(rect: Rectangle): NativeImage;
  /**
   * 调整图片尺寸
   *
   * 只设置 width 或 height 时，会保持图片比例
   */
  resize(options: {
    width?: number;
    height?: number;
    quality?: "good" | "better" | "best";
  }): NativeImage;
  /**
   * 是否为空图片
   */
  isEmpty(): boolean;
}
```
:::

### 示例

```js
async function capture() {
  const captures = await utools.captureDisplay();
  if (captures.length === 0) {
    return;
  }
  const image = captures[0].image;
  console.log(image.toDataURL());
}
```

## `utools.screenCapture()`

进入截图模式，用户框选区域后返回截图图片的 Data URL。支持 Promise 和回调两种调用方式。

### 类型定义

::: code-group

```ts [Promise]
function screenCapture(): Promise<string>;
```

```ts [回调方式]
function screenCapture(callback: (image: string) => void): void;
```

:::


### 回调参数

- `callback`：截图完成后的回调函数。
  - `image`：截图图片的 Base64 Data URL。

::: tip
Promise 模式下，用户取消操作时 Promise 会 rejected。
:::

### 示例

```js
utools.screenCapture()
 .then(imageDataURL => {
    console.log(imageDataURL);
 })
 .catch(() => {
    console.log('用户取消截图');
 });
```

## `utools.screenColorPick()`

进入屏幕取色模式，用户选择颜色后返回颜色信息。支持 Promise 和回调两种调用方式。

### 类型定义

::: code-group

```ts [Promise]
function screenColorPick(): Promise<PickColor>;
```

```ts [回调方式]
function screenColorPick(callback: (color: PickColor) => void): void;
```

:::

### 回调参数

- `callback`：颜色选择完成后的回调函数。
  - `color`：选择的颜色信息。

::: tip
Promise 模式下，用户取消操作时 Promise 会 rejected。
:::

::: details `PickColor` 类型定义

```ts
interface PickColor {
  /**
   * 十六进制颜色值
   *
   * 示例：
   * #FFFFFF
   */
  hex: string;
  /**
   * RGB 字符串
   *
   * 示例：
   * rgb(255, 255, 255)
   */
  rgb: string;
}
```
:::

### 示例

```js
utools.screenColorPick()
.then(color => {
  console.log(color);
})
.catch(() => {
  console.log('用户取消取色');
});
```

## `utools.getAllDisplays()`

获取所有显示器

### 类型定义

```ts
function getAllDisplays(): Display[];
```

### 示例

```js
const displays = utools.getAllDisplays();
console.log(displays);
```

## `utools.getPrimaryDisplay()`

获取主显示器

### 类型定义

```ts
function getPrimaryDisplay(): Display;
```

### 示例

```js
const display = utools.getPrimaryDisplay();
console.log(display);
```

## `utools.getCursorScreenPoint()`

获取当前鼠标位置。返回系统屏幕绝对坐标，坐标单位为 DIP。

### 类型定义

```ts
function getCursorScreenPoint(): Point;
```

### 示例

```js
const point = utools.getCursorScreenPoint();
console.log(point);
```

## `utools.getDisplayNearestPoint(point)`

获取包含指定点的显示器。如果点不属于任何显示器区域，则返回距离最近的显示器。

### 类型定义

```ts
function getDisplayNearestPoint(point: Point): Display;
```

### 参数

- `point`：屏幕位置，坐标单位为 DIP。

### 示例

```js
const display = utools.getDisplayNearestPoint({ x: 100, y: 100 });
console.log(display);
```

## `utools.getDisplayMatching(rect)`

获取与指定矩形区域匹配的显示器。当矩形跨越多个显示器时，返回与该矩形区域重叠面积最大的显示器。

### 类型定义

```ts
function getDisplayMatching(rect: Rectangle): Display;
```

### 参数

- `rect`：屏幕区域，坐标单位为 DIP。

### 示例

```js
const display = utools.getDisplayMatching({
  x: 100,
  y: 100,
  width: 200,
  height: 200,
});
console.log(display);
```

## `utools.screenToDipPoint(point)`

将屏幕物理像素坐标转换为 DIP 坐标。

### 类型定义

```ts
function screenToDipPoint(point: Point): Point;
```

### 参数

- `point`：屏幕物理像素坐标。

### 示例

```js
const dipPoint = utools.screenToDipPoint({ x: 200, y: 200 });
console.log(dipPoint);
```

## `utools.dipToScreenPoint(point)`

将屏幕 DIP 坐标转换为物理像素坐标。

### 类型

```ts
function dipToScreenPoint(point: Point): Point;
```

### 参数

- `point`：屏幕 DIP 坐标。

### 示例

```js
const screenPoint = utools.dipToScreenPoint({ x: 200, y: 200 });
console.log(screenPoint);
```

## `utools.screenToDipRect(rect)`

将屏幕物理像素区域转换为 DIP 区域。

### 类型定义

```ts
function screenToDipRect(rect: Rectangle): Rectangle;
```

### 参数

- `rect`：屏幕物理像素区域。

### 示例

```js
const dipRect = utools.screenToDipRect({ x: 0, y: 0, width: 200, height: 200 });
console.log(dipRect);
```

## `utools.dipToScreenRect(rect)`

将屏幕 DIP 区域转换为物理像素区域。

### 类型定义

```ts
function dipToScreenRect(rect: Rectangle): Rectangle;
```

### 参数

- `rect`：屏幕 DIP 区域。

### 示例

```js
const rect = utools.dipToScreenRect({ x: 0, y: 0, width: 200, height: 200 });
console.log(rect);
```

## `utools.desktopCaptureSources(options)`

获取可用于录屏的窗口和显示器来源。

返回的来源可配合 `navigator.mediaDevices.getUserMedia()` 创建录屏流。

### 类型定义

```ts
function desktopCaptureSources(options?: DesktopCaptureSourcesOptions): Promise<DesktopCaptureSource[]>;
```

### 参数

- `options` 录屏源获取选项。

::: details `DesktopCaptureSourcesOptions` 类型定义

```ts
interface DesktopCaptureSourcesOptions {
  /**
   * 要获取的来源类型。
   */
  types?: Array<"window" | "screen">;
  /**
   * 缩略图尺寸。
   */
  thumbnailSize?: Size;
  /**
   * 是否获取窗口图标。
   */
  fetchWindowIcons?: boolean;
}
```
:::

::: details `DesktopCaptureSource` 类型定义

```ts
interface DesktopCaptureSource {
  /**
   * 来源 ID
   */
  id: string;
  /**
   * 来源类型
   */
  type: "screen" | "window";
  /**
   * 来源名称
   */
  name: string;
  /**
   * 缩略图
   */
  thumbnail: NativeImage;
  /**
   * 应用图标
   */
  appIcon?: NativeImage;

}
```
:::

### 示例

```js
// webm 录屏
async function screenRecording() {
  const sources = await utools.desktopCaptureSources({
    types: ["window", "screen"],
    thumbnailSize: {
      width: 320,
      height: 180,
    },
    fetchWindowIcons: true,
  });
  if (sources.length === 0) {
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sources[0].id,
        minWidth: 1280,
        maxWidth: 1280,
        minHeight: 720,
        maxHeight: 720,
      },
    },
  });
  const video = document.querySelector("video");
  video.srcObject = stream;
  video.onloadedmetadata = () => video.play();
}
```
