# uBrowser 浏览器

uBrowser（uTools Browser）是 uTools 提供的**可编程自动化浏览器**。插件应用可以通过链式 API 控制浏览器打开网页、操作页面元素、模拟鼠标和键盘操作、执行 JavaScript、上传和下载文件，以及获取网页内容等。

与传统的无头浏览器自动化工具不同，uBrowser 创建的是**可视化浏览器窗口**。自动化执行过程中，用户可以直接查看浏览器页面，也可以进行手动操作。

uBrowser 的浏览器会话按插件应用隔离。每个插件应用拥有独立的会话存储，可以持久化保存 Cookie 等会话数据，因此登录状态可以在后续运行中继续使用。

uBrowser 的操作 API 采用链式调用方式。调用操作 API 时不会立即执行，而是加入当前操作队列；调用 `run()` 后，uTools 按调用顺序执行队列中的操作。

::: tip 元素选择器
需要定位网页元素的 API 使用**元素选择器（selector）**。

支持 CSS Selector：

```js
.click('#submit')
.click('.button')
.click('input[name="username"]')
```

支持 XPath：

```js
.click('//button[contains(text(), "提交")]')
```

对于位于 `iframe` 中的元素，可以使用 `>>` 连接多个选择器：

```js
.click('#iframe1 >> #iframe2 >> #submit')
.click('#iframe1 >> //button[contains(text(), "提交")]')
```

表示依次进入 `#iframe1`、`#iframe2`，最终定位到 `#submit`。
:::


## `ubrowser.run(...)`

执行当前 uBrowser 操作队列。

调用 `run()` 时，可以创建新的 uBrowser 窗口，也可以继续使用已有的 uBrowser 窗口。

::: warning
`run()` 执行结束后，如果 uBrowser 窗口处于隐藏状态，uTools 会自动销毁该窗口。
:::

### 类型定义

```ts
// 创建新的 uBrowser 窗口执行操作，不传配置时使用默认窗口配置。
function run(
  options?: UBrowserWindowOptions
): Promise<[...any[], UBrowserWindowInstance | null]>;

// 在已有 uBrowser 窗口中执行操作。
function run(
  uBrowserWindowId: number
): Promise<[...any[], UBrowserWindowInstance | null]>;
```

### 参数

- `options`：uBrowser 窗口配置。
- `uBrowserWindowId`：uBrowser 窗口 ID。

### Promise 返回

Promise resolve 后返回一个数组。

- 前面的元素：链式调用过程中各操作产生的返回值，顺序与操作调用顺序一致。
- 最后一项：当前 `UBrowserWindowInstance`，如果窗口已销毁则为 `null`。

如果执行过程中发生错误，Promise 会 reject。错误对象的 `data` 字段包含错误发生前已成功执行的操作返回值，以及最后的 `UBrowserWindowInstance`。

`error.data` 的结构与 Promise resolve 返回值一致，但仅包含错误发生前已成功执行部分的结果。

::: details `UBrowserWindowOptions` 类型定义

```ts
interface UBrowserWindowOptions {
  /**
   * 是否显示窗口
   * 默认为 true
   */
  show?: boolean;
  /**
   * 窗口标题
   */
  title?: string;
  /**
   * 窗口宽度，默认为 800
   */
  width?: number;
  /**
   * 窗口高度，默认为 600
   */
  height?: number;
  /**
   * 窗口最小宽度
   */
  minWidth?: number;
  /**
   * 窗口最小高度
   */
  minHeight?: number;
  /**
   * 窗口最大宽度
   */
  maxWidth?: number;
  /**
   * 窗口最大高度
   */
  maxHeight?: number;
  /**
   * 窗口初始横坐标
   */
  x?: number;
  /**
   * 窗口初始纵坐标
   */
  y?: number;
  /**
   * 是否将窗口显示在屏幕中央
   * 默认为 false
   */
  center?: boolean;
  /**
   * 是否允许调整窗口大小
   * 默认为 true
   */
  resizable?: boolean;
  /**
   * 是否允许移动窗口
   * 默认为 true
   */
  movable?: boolean;
  /**
   * 是否允许最大化窗口
   * 默认为 true
   */
  maximizable?: boolean;
  /**
   * 是否允许最小化窗口
   * 默认为 true
   */
  minimizable?: boolean;
  /**
   * 是否允许关闭窗口
   * 默认为 true
   */
  closable?: boolean;
  /**
   * 是否显示窗口边框
   * 默认为 true
   */
  frame?: boolean;
  /**
   * 是否显示窗口阴影
   * 默认为 true
   */
  hasShadow?: boolean;
  /**
   * 是否显示窗口圆角
   * 默认为 true
   */
  roundedCorners?: boolean;
  /**
   * 是否始终显示在其他窗口之上
   * 默认为 false
   */
  alwaysOnTop?: boolean;
  /**
   * 是否允许窗口获得焦点
   * 默认为 true
   */
  focusable?: boolean;
  /**
   * 是否允许窗口尺寸超出屏幕可显示范围
   * 默认为 false
   */
  enableLargerThanScreen?: boolean;
  /**
   * 是否允许窗口进入全屏模式
   * 默认为 true
   */
  fullscreenable?: boolean;
  /**
   * 是否以全屏模式创建窗口
   * 默认为 false
   */
  fullscreen?: boolean;
  /**
   * 窗口透明度，取值范围为 0.0 ~ 1.0
   * 默认为 1.0
   */
  opacity?: number;
  /**
   * 窗口背景颜色
   */
  backgroundColor?: string;
  /**
   * 是否创建透明窗口
   * 默认为 false
   */
  transparent?: boolean;
  /**
   * 窗口标题栏样式
   */
  titleBarStyle?: string;
}

```

:::

::: details `UBrowserWindowInstance` 类型定义 {#ubrowser-instance}

表示 uBrowser 窗口的基本信息，可通过 `id` 在后续调用 `run(id)` 时继续使用该窗口。

```ts
interface UBrowserWindowInstance {
  /**
   * 窗口 ID
   */
  id: number;
  /**
   * 当前 URL
   */
  url: string;
  /**
   * 窗口标题
   */
  title: string;
  /**
   * 窗口宽度
   */
  width: number;
  /**
   * 窗口高度
   */
  height: number;
  /**
   * 窗口横坐标
   */
  x: number;
  /**
   * 窗口纵坐标
   */
  y: number;
}

```

:::

### 示例

获取页面操作结果：

```js
const [title, visible, browser] = await utools.ubrowser
  .goto(...)
  .evaluate(() => document.title)
  .evaluate(() => document.visibilityState === 'visible')
  .run()

console.log(title, visible)
```

继续使用已有窗口：

```js
const [browser] = await utools.ubrowser
  .goto('https://example.com')
  .run()

await utools.ubrowser
  .click('button', 'left')
  .run(browser.id)

```

错误后继续使用已有窗口：
```js
try {
  await utools.ubrowser
  .goto('https://example.com')
  .wait('.no-existed-element', 1000)
  .run()
} catch (err) {
  const browser = err.data?.at(-1)
  if (browser) {
    await utools.ubrowser
    .evaluate(
      function (errorMessage) {
        const div = document.createElement('div')
        div.textContent = '自动化执行出错：' + errorMessage
        Object.assign(div.style, {
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 999999,
          padding: '12px 16px',
          background: '#D32F2F',
          color: '#fff',
          borderRadius: '8px',
          cursor: 'pointer'
        })
        div.onclick = () => div.remove()
        document.body.appendChild(div)
      }, err.message
    )
    .run(browser.id)
  }
}
```


## `ubrowser.goto(url[, headers][, timeout])`

打开指定 URL。

### 类型定义

```ts
function goto(
  url: string,
  headers?: Record<string, string>,
  timeout?: number
): UBrowser;
```

### 参数

- `url`：要访问的 URL。
- `headers`：请求头。
- `timeout`：页面加载超时时间，单位为毫秒。

### 示例

```js
await utools.ubrowser
  .goto('https://www.baidu.com')
  .run()
```

设置请求头：

```js
await utools.ubrowser
  .goto('https://example.com', {
    Authorization: 'Bearer xxx'
  })
  .run()
```

## `ubrowser.userAgent(ua)`

设置浏览器 User-Agent。

### 类型定义

```ts
function userAgent(ua: string): UBrowser;
```

### 参数

- `ua`：User-Agent 字符串。

### 示例

```js
await utools.ubrowser
  .userAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  )
  .goto('https://example.com')
  .run()
```

## `ubrowser.viewport(width, height)`

设置网页内容区域的视口尺寸，不等同于 uBrowser 窗口尺寸。

### 类型定义

```ts
function viewport(
  width: number,
  height: number
): UBrowser;
```

### 参数

- `width`：视口宽度。
- `height`：视口高度。

### 示例

```js
await utools.ubrowser
  .viewport(1280, 720)
  .goto('https://example.com')
  .run()
```


## `ubrowser.device(options)`

模拟指定设备环境。

### 类型定义

```ts
function device(
  options: DeviceOptions
): UBrowser;
```

### 参数

- `options`：设备模拟配置。

::: details `DeviceOptions` 类型定义

```ts
interface DeviceOptions {
  /**
   * 配置浏览器 User-Agent
   */
  userAgent?: string;
  /**
   * 设置页面视口大小
   */
  viewport?: {
    /**
     * 页面宽度
     */
    width: number;
    /**
     * 页面高度
     */
    height: number;
    /**
     * 设备缩放
     */
    deviceScaleFactor?: number;
    /**
     * 是否移动设备
     */
    isMobile?: boolean;
    /**
     * 是否可以触摸
     */
    hasTouch?: boolean;
  };
}
```
:::

## `ubrowser.click(selector[, mouseButton])`

点击指定元素。

### 类型定义

```ts
// 元素点击
function click(
  selector: string,
  mouseButton?: MouseButton
): UBrowser;

// 模拟鼠标物理在坐标上点击
function click(
  x: number,
  y: number,
  mouseButton?: MouseButton
): UBrowser;
```

::: details `MouseButton` 类型定义

```ts
type MouseButton = "left" | "middle" | "right";
```

- `left`：鼠标左键。
- `middle`：鼠标中键。
- `right`：鼠标右键。
:::

### 参数

- `selector`：元素选择器。
- `x`：页面坐标 X。
- `y`：页面坐标 Y。
- `mouseButton`：鼠标按键。

::: warning
使用元素选择器时：

- `.click(selector)`：触发目标元素的页面点击事件，不模拟真实鼠标操作。
- `.click(selector, mouseButton)`：模拟鼠标在目标元素位置执行物理点击操作。
  - 获取目标元素的位置
  - 移动鼠标到元素位置
  - 执行鼠标按下与释放操作
  - 行为更接近用户真实操作

物理点击要求目标元素可定位且位于页面可视区域内。
如果元素被隐藏、不可见，或无法滚动到可视区域，将无法执行物理点击，并抛出异常。

`dblclick`、`mousedown`、`mouseup` 等鼠标操作 API 遵循相同的元素定位与物理操作逻辑。
:::

### 示例

触发点击事件：
```js
await utools.ubrowser
  .goto('https://example.com')
  .click('#submit')
  .run()
```

模拟物理点击：

```js
await utools.ubrowser
  .goto('https://example.com')
  .click('#submit', 'left')
  .run()
```

## `ubrowser.dblclick(selector[, mouseButton])`

双击指定元素。

### 类型定义

```ts
function dblclick(
  selector: string,
  mouseButton?: MouseButton
): UBrowser;

function dblclick(
  x: number,
  y: number,
  mouseButton?: MouseButton
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `x`：页面坐标 X。
- `y`：页面坐标 Y。
- `mouseButton`：鼠标按键。

## `ubrowser.mousedown(selector[, mouseButton])`

在指定元素上按下鼠标按键。

### 类型定义

```ts
function mousedown(
  selector: string,
  mouseButton?: MouseButton
): UBrowser;

function mousedown(
  x: number,
  y: number,
  mouseButton?: MouseButton
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `x`：页面坐标 X。
- `y`：页面坐标 Y。
- `mouseButton`：鼠标按键。

## `ubrowser.mouseup(selector[, mouseButton])`

在指定元素上释放鼠标按键。

### 类型定义

```ts
function mouseup(
  selector: string,
  mouseButton?: MouseButton
): UBrowser;

function mouseup(
  x: number,
  y: number,
  mouseButton?: MouseButton
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `x`：页面坐标 X。
- `y`：页面坐标 Y。
- `mouseButton`：鼠标按键。

## `ubrowser.hover(selector)`

将鼠标移动到指定元素或页面坐标位置。

### 类型定义

```ts
// 在元素上悬停
function hover(selector: string): UBrowser;
// 在坐标位置悬停
function hover(
  x: number,
  y: number
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `x`：页面坐标 X。
- `y`：页面坐标 Y。

### 示例

悬停在指定元素上：

```js
await utools.ubrowser
  .goto('https://example.com')
  .hover('.menu')
  .run()
```

悬停在指定坐标位置：

```js
await utools.ubrowser
  .goto('https://example.com')
  .hover(300, 200)
  .run()
```

## `ubrowser.press(key[, modifiers])`

模拟键盘按键。

### 类型定义

```ts
function press(
  key: string,
  ...modifiers: string[]
): UBrowser;
```

### 参数

- `key`：要模拟的键。
- `modifiers`：修饰键，例如：`ctrl`、`alt`、`shift`、`meta`

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .press('enter')
  .run()
```

使用组合键：

```js
await utools.ubrowser
  .goto('https://example.com')
  .press('a', 'ctrl')
  .run()
```

## `ubrowser.focus(selector)`

使指定元素获得焦点。

### 类型定义

```ts
function focus(selector: string): UBrowser;
```

### 参数

- `selector`：元素选择器。

## `ubrowser.input([selector,] payload)`

模拟用户输入。

`input()` 更接近用户实际输入行为；`value()` 用于直接设置表单元素的值。

### 类型定义

```ts
function input(
  selector: string,
  payload: string
): UBrowser;

function input(
  payload: string
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `payload`：要输入的文本。

未指定 `selector` 时，输入到当前获得焦点的元素。

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .input('#username', 'uTools')
  .run()
```

## `ubrowser.value(selector, payload)`

设置指定表单元素的值。

::: warning
仅对 `input`、`textarea`、`select` 等表单元素赋值
:::

### 类型定义

```ts
function value(
  selector: string,
  payload: string
): UBrowser;
```

### 参数

- `selector`：表单元素选择器。
- `payload`：要设置的值。

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .value('#username', 'uTools')
  .run()
```

## `ubrowser.check(selector, checked)`

设置复选框或单选框的选中状态。

### 类型定义

```ts
function check(
  selector: string,
  checked: boolean
): UBrowser;
```

### 参数

- `selector`：复选框或单选框选择器。
- `checked`：是否选中。

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .check('#agree', true)
  .run()
```

## `ubrowser.scroll(...)`

页面滚动。

### 类型定义

```ts
// 将指定元素滚动到可视区域。
function scroll(
  selector: string,
  options?: ScrollIntoViewOptions
): UBrowser;

// 将页面滚动到指定坐标。
function scroll(
  x: number,
  y: number
): UBrowser;

// 将页面垂直滚动到指定位置。
function scroll(
  y: number
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `x`：页面坐标 X。
- `y`：页面坐标 Y。
- `options`：滚动配置，使用浏览器内置的 `ScrollIntoViewOptions`：
  - `behavior`：滚动方式，`smooth` 为平滑滚动，其余取值（`auto`、`instant`）立即滚动。
  - `block`：元素在垂直方向的对齐位置，`start` / `center` / `end` / `nearest`。
  - `inline`：元素在水平方向的对齐位置，`start` / `center` / `end` / `nearest`。

### 示例

滚动页面：

```js
await utools.ubrowser
  .goto('https://example.com')
  .scroll(200)
  .run()
```

滚动指定元素：

```js
await utools.ubrowser
  .goto('https://example.com')
  .scroll('#container')
  .run()
```

## `ubrowser.file(selector, payload)`

向文件上传控件设置文件。

### 类型定义

```ts
function file(
  selector: string,
  payload: string | Uint8Array | string[]
): UBrowser;
```

### 参数

- `selector`：文件上传控件选择器。
- `payload`：要上传的文件。支持：
  - 图片 Base64 Data URL,
  - 文件 Uint8Array
  - 文件路径
  - 文件路径集合

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .file('input[type=file]', '/tmp/example.png')
  .run()
```

## `ubrowser.drop(selector, payload)`

模拟将文件拖放到指定元素。

### 类型定义

```ts
function drop(
  selector: string,
  payload: string | Uint8Array | string[]
): UBrowser;

function drop(
  x: number,
  y: number,
  payload: string | Uint8Array | string[]
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `x`：页面坐标 X。
- `y`：页面坐标 Y。
- `payload`：要拖放的文件。支持：
  - 图片 Base64 Data URL,
  - 文件 Uint8Array
  - 文件路径
  - 文件路径集合

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .drop('#file-box', '/tmp/example.png')
  .run()
```

## `ubrowser.paste(payload)`

向当前页面执行粘贴操作。

### 类型定义

```ts
function paste(payload: string): UBrowser;
```

### 参数

- `payload`：要粘贴的内容。
  - 图片 Base64 Data URL，将执行粘贴图片。
  - 粘贴普通文本。

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .click('#input')
  .paste('uTools')
  .run()
```

## `ubrowser.download(...)`

下载文件。

### 类型定义

```ts
//下载 URL
function download(
  url: string,
  savePath?: string
): UBrowser;

/**
 * 根据页面脚本获取下载 URL
 *
 * 当下载地址需要从当前页面动态获取时，可以传入页面函数。函数在页面环境执行，并返回资源 URL。
 */
function download(
  func: (...args: any[]) => string,
  savePath: string | null,
  ...funcArgs: any[]
): UBrowser;
```

### 参数

- `url`：下载地址。
- `savePath`：文件保存路径。
- `func`：JS 函数, 函数在页面环境执行，并返回资源 URL，根据返回 URL 下载文件。
- `...funcArgs`：传递给 `func` 的参数

### 示例

下载 URL：
```js
await utools.ubrowser
  .goto('https://example.com')
  .download(
    'https://example.com/example.zip',
    '/tmp/example.zip'
  )
  .run()
```

根据函数返回下载：
```js
await utools.ubrowser
  .goto('https://example.com')
  .download(
    () => document.querySelector('#download')?.href,
    '/tmp/example.zip'
  )
  .run()
```

## `ubrowser.evaluate(func[, ...args])`

在当前 uBrowser 页面上下文中执行 JavaScript。

### 类型定义

```ts
function evaluate(
  func: (...args: any[]) => any,
  ...funcArgs: any[]
): UBrowser;
```

### 参数

- `func`：要执行的函数。
- `...funcArgs`：传递给函数的参数。

### 示例

获取页面标题：

```js
const [title] = await utools.ubrowser
  .goto('https://example.com')
  .evaluate(() => document.title)
  .run()

console.log(title)
```

传递参数：

```js
const [result] = await utools.ubrowser
  .goto('https://example.com')
  .evaluate(
    keyword => document.body.innerText.includes(keyword),
    'uTools'
  )
  .run()

console.log(result)
```

## `ubrowser.css(css)`

向当前页面注入 CSS。

### 类型定义

```ts
function css(css: string): UBrowser;
```

### 参数

- `css`：要注入的 CSS。

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .css(`
    body {
      background: #fff;
    }
    .header {
      display: none;
    }
  `)
  .run()
```

## `ubrowser.wait(...)`

等待指定条件满足后继续执行。

| 调用                          | 含义          |
| --------------------------- | ----------- |
| `wait(1000)`                | 等待 1 秒      |
| `wait('#loading')`          | 等待元素出现      |
| `wait('#loading', false)`   | 等待元素消失      |
| `wait('#loading', 10000)`   | 最多等待 10 秒出现 |
| `wait('#loading', { ... })` | 使用完整配置      |
| `wait(() => document.readyState === 'complete', { ... })` | 等待页面函数返回 true  |

### 类型定义

```ts
// 等待固定时间
function wait(ms: number): UBrowser;

// 等待元素出现，并配置超时时间
function wait(
  selector: string,
  timeout?: number
): UBrowser;

// 等待元素出现或消失，result 为 false 时等待元素消失
function wait(
  selector: string,
  result?: boolean
): UBrowser;

// 等待元素出现或消失，并配置超时、轮询间隔
function wait(
  selector: string,
  options?: {
    result?: boolean;
    timeout?: number;
    interval?: number;
  }
): UBrowser;

// 等待页面函数返回 true
function wait(
  func: (...args: any[]) => boolean,
  timeout?: number,
  ...funcArgs: any[]
): UBrowser;

// 等待页面函数返回 true，并配置超时、轮询间隔
function wait(
  func: (...args: any[]) => boolean,
  options?: {
    timeout?: number;
    interval?: number;
  },
  ...funcArgs: any[]
): UBrowser;
```

### 参数

- `ms`：等待时长，单位为毫秒。
- `selector`：元素选择器。
- `result`：等待条件，为 `true` 时等待元素出现，为 `false` 时等待元素消失，默认为 `true`。
- `timeout`：等待超时时间，默认为 60000 毫秒（60 秒）。
- `interval`：轮询检查间隔，默认为 500 毫秒。
- `func`：在页面环境中执行的判定函数，返回 `true` 时等待结束。
- `...funcArgs`：传递给 `func` 的参数。

### 示例

等待指定时间：

```js
await utools.ubrowser
  .goto('https://example.com')
  .wait(1000)
  .click('#submit')
  .run()
```

等待元素出现：

```js
await utools.ubrowser
  .goto('https://example.com')
  .wait('#result')
  .run()
```

等待元素消失：

```js
await utools.ubrowser
  .goto('https://example.com')
  .wait('#loading', false)
  .run()
```

等待页面内函数返回 `true`，超过 10 分钟超时：

```js
await utools.ubrowser
  .goto('https://example.com')
  .wait(() => document.readyState === 'complete', 10 * 60 * 1000)
  .run()
```

## `ubrowser.when(...)`

根据当前页面状态创建条件执行块。

`when()` 与 `endWhen()` 之间的操作仅在条件满足时执行，否则会被跳过。

`when()` 必须与 `endWhen()` 成对使用，并支持嵌套。`endWhen()` 之后的操作始终执行。

条件会在 uBrowser 执行操作队列时判断，而不是调用 `when()` 时立即判断。

### 类型定义

```ts
// 当指定元素存在（result 为 false 时表示不存在）时执行
function when(
  selector: string,
  result?: boolean
): UBrowser;

// 当页面内函数返回 true 时执行
function when(
  func: (...args: any[]) => boolean,
  ...funcArgs: any[]
): UBrowser;
```

### 参数

- `selector`：元素选择器。
- `result`：判断条件，为 `true` 表示元素存在，为 `false` 表示元素不存在，默认为 `true`。
- `func`：在页面环境中执行的判定函数，返回 `true` 表示条件满足。
- `...funcArgs`：传递给 `func` 的参数。

### 示例

当元素存在时执行操作：

```js
await utools.ubrowser
  .goto('https://example.com')
  .when('#login')
    .click('#login')
  .endWhen()
  .run()
```

当元素不存在时执行操作（例如未登录状态）：

```js
await utools.ubrowser
  .goto('https://example.com')
  .when('#user-info', false)
    .goto('https://example.com/login')
  .endWhen()
  .run()
```

根据页面内函数返回值执行操作：

```js
await utools.ubrowser
  .goto('https://example.com')
  .when(() => document.querySelector('#login') !== null)
    .click('#login')
  .endWhen()
  .run()
```

## `ubrowser.endWhen()`

结束 `when()` 开启的条件块。

条件满足时，`when()` 与 `endWhen()` 之间的操作会执行；条件不满足时，这段操作会被跳过。`endWhen()` 之后的操作始终执行。

### 类型定义

```ts
function endWhen(): UBrowser;
```

## `ubrowser.markdown([selector])`

获取页面内容并转换为 Markdown。

### 类型定义

```ts
function markdown(
  selector?: string
): UBrowser;
```

### 参数

- `selector`：要转换的元素选择器。未指定时处理整个页面。

### 示例

```js
const [content] = await utools.ubrowser
  .goto('https://example.com/article')
  .markdown('article')
  .run()

console.log(content)
```

## `ubrowser.screenshot([target][, savePath])`

截取页面窗口、指定元素或指定区域的截图，保存为 png 格式。

### 类型定义

```ts
function screenshot(
  target?: string | ScreenshotRect,
  savePath?: string
): UBrowser;
```

### 参数

- `target`：截图目标，可选：
  - 字符串：元素选择器，截取该元素。
  - `ScreenshotRect` 对象：截取指定区域。
  - 不传：截取整个 uBrowser 页面窗口。
- `savePath`：截图保存路径。未指定时默认保存在临时目录。

::: details `ScreenshotRect` 类型定义

```ts
/**
 * 截图区域
 *
 * 坐标以 uBrowser 内容区域左上角为原点。
 */
interface ScreenshotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```
:::

### 示例

截取整个页面窗口：

```js
await utools.ubrowser
  .goto('https://example.com')
  .screenshot()
  .run()
```

截取指定元素：

```js
await utools.ubrowser
  .goto('https://example.com')
  .screenshot('#content', '/tmp/content.png')
  .run()
```

截取指定区域：

```js
await utools.ubrowser
  .goto('https://example.com')
  .screenshot(
    { x: 0, y: 0, width: 400, height: 300 },
    '/tmp/area.png'
  )
  .run()
```

## `ubrowser.pdf(options[, savePath])`

将当前页面生成 PDF。

### 类型定义

```ts
function pdf(
  options: PdfOptions,
  savePath?: string
): UBrowser;
```

### 参数

- `options`：PDF 配置。
- `savePath`：PDF 保存路径。

::: details `PdfOptions` 类型定义

```ts
interface PdfOptions {
  /**
   * 是否横向打印，默认为 false
   */
  landscape?: boolean;
  /**
   * 是否显示页眉和页脚，默认为 false
   */
  displayHeaderFooter?: boolean;
  /**
   * 是否打印背景，默认为 false
   */
  printBackground?: boolean;
  /**
   * 页面缩放比例
   */
  scale?: number;
  /**
   * 页面尺寸，默认为 `Letter`
   *
   * 包含 `A0`, `A1`, `A2`, `A3`, `A4`, `A5`, `A6`, `Legal`, `Letter`, `Tabloid`, `Ledger`
   */
  pageSize?: string | PdfPageSize;
  /**
   * 页面边距，单位为英寸
   */
  margins?: PrintToPDFMargins;
  /**
   * 要打印的页码范围
   */
  pageRanges?: string;
  /**
   * 页眉模板
   */
  headerTemplate?: string;
  /**
   * 页脚模板
   */
  footerTemplate?: string;
  /**
   * 是否优先使用 CSS 定义的页面尺寸
   */
  preferCSSPageSize?: boolean;
}

interface PdfPageSize {
  /**
   * 页面宽度，单位为英寸。
   */
  width: number;
  /**
   * 页面高度，单位为英寸。
   */
  height: number;
}

interface PrintToPDFMargins {
 /**
 * 上边距，单位为英寸。
 * 默认为 1 cm（约 0.4 英寸）。
 */
  top: number;
 /**
 * 下边距，单位为英寸。
 * 默认为 1 cm（约 0.4 英寸）。
 */
  bottom: number;
 /**
 * 左边距，单位为英寸。
 * 默认为 1 cm（约 0.4 英寸）。
 */
  left: number;
 /**
 * 右边距，单位为英寸。
 * 默认为 1 cm（约 0.4 英寸）。
 */
  right: number;
}

```
:::

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .pdf({ pageSize: 'A4' }, '/tmp/example.pdf')
  .run()
```

## `ubrowser.cookies(...)`

获取 Cookie。

### 类型定义

```ts
// 获取当前 URL 的 Cookie，name 为空时获取全部
function cookies(name?: string): UBrowser;

// 根据条件筛选获取 Cookie
function cookies(filter: CookieFilter): UBrowser;
```

### 参数

- `name`：Cookie 名称。未指定时获取当前 URL 的全部 Cookie。
- `filter`：Cookie 筛选条件。

::: details `CookieFilter` 类型定义

```ts
/**
 * Cookie 筛选条件
 */
interface CookieFilter {
  /**
   * 检索与指定 URL 相关的 Cookie，为空表示检索所有 URL 的 Cookie
   */
  url?: string;
  /**
   * 按名称筛选 Cookie
   */
  name?: string;
  /**
   * 检索与指定域名或其子域名匹配的 Cookie
   */
  domain?: string;
  /**
   * 检索路径与指定 path 匹配的 Cookie
   */
  path?: string;
  /**
   * 是否仅匹配带 Secure 属性的 Cookie
   */
  secure?: boolean;
  /**
   * 是否仅匹配会话 Cookie
   */
  session?: boolean;
  /**
   * 是否仅匹配带 httpOnly 属性的 Cookie
   */
  httpOnly?: boolean;
}
```
:::

### 示例

获取当前页面全部 Cookie：

```js
const [cookies] = await utools.ubrowser
  .goto('https://example.com')
  .cookies()
  .run()
```

获取指定名称的 Cookie：

```js
const [cookies] = await utools.ubrowser
  .goto('https://example.com')
  .cookies('session')
  .run()
```

按条件筛选 Cookie：

```js
const [cookies] = await utools.ubrowser
  .goto('https://example.com')
  .cookies({ domain: 'example.com' })
  .run()
```

## `ubrowser.setCookies(...)`

设置 Cookie。

### 类型定义

```ts
// 设置单个 Cookie
function setCookies(
  name: string,
  value: string
): UBrowser;

// 批量设置 Cookie
function setCookies(
  cookies: CookieDetails[]
): UBrowser;
```

### 参数

- `name`：Cookie 名称。
- `value`：Cookie 值。
- `cookies`：要设置的 Cookie 名称与值集合。

::: details `CookieDetails` 类型定义

```ts
interface CookieDetails {
  /**
   * Cookie 名称。
   */
  name: string;
  /**
   * Cookie 值。
   */
  value: string;
  /**
   * Cookie 所属 URL。
   */
  url?: string;
  /**
   * Cookie 所属域名。
   */
  domain?: string;
  /**
   * Cookie 路径。
   */
  path?: string;
  /**
   * 是否设置 Secure 属性。
   */
  secure?: boolean;
  /**
   * 是否设置 HttpOnly 属性。
   */
  httpOnly?: boolean;
  /**
   * Cookie 过期时间。
   */
  expirationDate?: number;
  /**
   * SameSite 属性。
   * 默认为 "lax"。
   */
  sameSite?:
    | 'unspecified'
    | 'no_restriction'
    | 'lax'
    | 'strict';
}
```
:::

### 示例

设置单个 Cookie：

```js
await utools.ubrowser
  .goto('https://example.com')
  .setCookies('token', 'xxx')
  .run()
```

批量设置 Cookie：

```js
await utools.ubrowser
  .setCookies([
    { name: 'token', value: 'xxx', url: 'https://example.com' },
    { name: 'theme', value: 'dark', url: 'https://example.com' }
  ])
  .goto('https://example.com')
  .run()
```

## `ubrowser.removeCookies(name)`

删除当前 URL 指定名称 Cookie。

### 类型定义

```ts
function removeCookies(
  name: string
): UBrowser;
```

### 参数

- `name`：Cookie 名称。

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .removeCookies('session')
  .run()
```

## `ubrowser.clearCookies([url])`

清除指定 URL 的 Cookie。若不指定 URL 则清除当前 URL Cookie。

### 类型定义

```ts
function clearCookies(
  url?: string
): UBrowser;
```

### 参数

- `url`：指定 Cookie 所属 URL。

### 示例

先清除 URL Cookie，再打开 URL：
```js
await utools.ubrowser
  .clearCookies('https://example.com')
  .goto('https://example.com')
  .run()
```

清除当前 URL Cookie：
```js
await utools.ubrowser
  .goto('https://example.com')
  .clearCookies()
  .run()
```

## `ubrowser.show()`

显示 uBrowser 窗口。

### 类型定义

```ts
function show(): UBrowser;
```

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .wait(2000)
  .show()
  .run({ show: false })
```

`run()` 的 `show` 选项控制窗口创建时是否显示；`show()` / `hide()` 则属于操作队列中的窗口操作。

## `ubrowser.hide()`

隐藏 uBrowser 窗口。

隐藏窗口后，uBrowser 仍会继续执行操作。

### 类型定义

```ts
function hide(): UBrowser;
```

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .hide()
  .run()
```

## `ubrowser.devTools([mode])`

打开 uBrowser 开发者工具。

### 类型定义

```ts
function devTools(
  mode?: 'right' | 'bottom' | 'undocked' | 'detach'
): UBrowser;
```

### 参数

- `mode`：开发者工具显示方式：
  - `right`：显示在右侧。
  - `bottom`：显示在底部。
  - `undocked`：独立显示。
  - `detach`：使用独立窗口显示。

### 示例

```js
await utools.ubrowser
  .goto('https://example.com')
  .devTools('right')
  .run()
```

## `utools.getIdleUBrowsers()`

获取当前处于空闲状态的 uBrowser 窗口。

### 类型定义

```ts
function getIdleUBrowsers(): UBrowserWindowInstance[];
```

### 返回

返回当前处于空闲状态的 uBrowser 窗口集合。参考 [`UBrowserWindowInstance` 类型定义](./ubrowser.md#ubrowser-instance)

空闲状态表示该 uBrowser 窗口当前未执行任何操作队列，可以通过 `run(id)` 继续执行新的操作。

### 示例

```js
const browsers = utools.getIdleUBrowsers()

if (browsers.length > 0) {
  await utools.ubrowser
    .goto('https://example.com')
    .run(browsers[0].id)
}
```

## `utools.setUBrowserProxy(config)`

设置 uBrowser 网络代理。

设置完代理，插件应用下所有 uBrowser 都将使用代理。

### 类型定义

```ts
function setUBrowserProxy(
  config: ProxyConfig
): void;
```

### 参数

- `config`：代理配置。

::: details `ProxyConfig` 类型定义
```ts
interface ProxyConfig {
  mode?: string;
  pacScript?: string;
  proxyRules?: string;
  proxyBypassRules?: string;
}
```
:::

### 示例

```js
utools.setUBrowserProxy({
  proxyRules: 'http://127.0.0.1:7890'
})
```

## `utools.clearUBrowserCache()`

清除 uBrowser 缓存。

用于清理 uBrowser 使用的缓存数据。

### 类型定义

```ts
function clearUBrowserCache(): void;
```

### 示例

```js
utools.clearUBrowserCache();
```
