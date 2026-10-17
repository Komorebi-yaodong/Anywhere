# 窗口

提供自定义窗口创建、窗口控制、窗口通信以及 uTools 窗口交互相关 API。

## `utools.createBrowserWindow(url[, options][, callback])`

创建一个自定义窗口

自定义窗口的定义、窗口通信及使用示例，请参考：[自定义窗口](../development/custom-window.md)


### 类型定义

```ts
function createBrowserWindow(
  url: string,
  options?: BrowserWindowConstructorOptions,
  callback?: Function
): BrowserWindow;
```

### 参数

- `url`：窗口加载的 HTML 文件路径，相对于插件应用根目录。
- `options`：自定义窗口选项。
- `callback`：自定义窗口页面加载完成后调用，常用于显示窗口、设置窗口状态或向自定义窗口发送消息。

### 返回

- 返回由 uTools 管理的 `BrowserWindow` 窗口实例。其大部分属性和方法与 Electron `BrowserWindow` 保持一致，但不支持 `BrowserWindow` 和 `webContents` 的实例事件监听。

::: details `BrowserWindowConstructorOptions` 类型定义

```ts
interface BrowserWindowConstructorOptions {
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
   * 窗口宽度
   */
  width?: number;
  /**
   * 窗口高度
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
   * 是否在任务栏中显示窗口
   * 默认为 false
   */
  skipTaskbar?: boolean;
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
  /**
   * 是否接受首次鼠标点击（macOS）
   * 默认为 false
   */
  acceptFirstMouse?: boolean;
  /**
   * 网页相关配置
   */
  webPreferences?: {
    /**
     * preload.js 文件路径
     */
    preload?: string;
  };
}
```
:::

::: details `BrowserWindow` 类型定义
```ts
/**
 * 自定义窗口实例
 *
 * 由 utools.createBrowserWindow() 创建并返回，由 uTools 负责管理。
 */
interface BrowserWindow {
  /**
   * 窗口唯一标识
   */
  id: number;
  /**
   * 窗口页面对象，用于控制页面并与页面通信
   */
  webContents: WebContents;
  /**
   * 显示窗口
   */
  show(): void;
  /**
   * 显示窗口但不激活，即不抢占当前焦点
   */
  showInactive(): void;
  /**
   * 隐藏窗口
   */
  hide(): void;
  /**
   * 销毁窗口并释放资源
   */
  destroy(): void;
  /**
   * 关闭窗口
   */
  close(): void;
  /**
   * 窗口是否已获得焦点
   */
  isFocused(): boolean;
  /**
   * 窗口是否已销毁
   */
  isDestroyed(): boolean;
  /**
   * 窗口是否可见
   */
  isVisible(): boolean;
  /**
   * 让窗口获得焦点
   */
  focus(): void;
  /**
   * 让窗口失去焦点
   */
  blur(): void;
  /**
   * 设置窗口是否允许调整大小
   *
   * @param resizable 是否允许调整大小
   */
  setResizable(resizable: boolean): void;
  /**
   * 窗口是否允许调整大小
   */
  isResizable(): boolean;
  /**
   * 设置窗口尺寸
   *
   * @param width 宽度，单位为 DIP
   * @param height 高度，单位为 DIP
   * @param animate 是否以动画方式调整尺寸（macOS）
   */
  setSize(width: number, height: number, animate?: boolean): void;
  /**
   * 获取窗口尺寸，单位为 DIP
   */
  getSize(): [width: number, height: number];
  /**
   * 设置窗口位置
   *
   * @param x 横坐标，单位为 DIP
   * @param y 纵坐标，单位为 DIP
   * @param animate 是否以动画方式移动（macOS）
   */
  setPosition(x: number, y: number, animate?: boolean): void;
  /**
   * 获取窗口位置，单位为 DIP
   */
  getPosition(): [x: number, y: number];
  /**
   * 设置窗口区域
   *
   * @param bounds 目标区域
   * @param animate 是否以动画方式调整（macOS）
   */
  setBounds(bounds: Rectangle, animate?: boolean): void;
  /**
   * 获取窗口区域
   */
  getBounds(): Rectangle;
  /**
   * 设置窗口内容区域
   *
   * @param bounds 目标区域
   */
  setContentBounds(bounds: Rectangle): void;
  /**
   * 获取窗口内容区域
   */
  getContentBounds(): Rectangle;
  /**
   * 获取窗口恢复正常状态后的区域
   */
  getNormalBounds(): Rectangle;
  /**
   * 设置窗口内容尺寸
   *
   * @param width 宽度，单位为 DIP
   * @param height 高度，单位为 DIP
   */
  setContentSize(width: number, height: number): void;
  /**
   * 获取窗口内容尺寸，单位为 DIP
   */
  getContentSize(): [width: number, height: number];
  /**
   * 设置窗口最小尺寸
   *
   * @param width 最小宽度
   * @param height 最小高度
   */
  setMinimumSize(width: number, height: number): void;
  /**
   * 获取窗口最小尺寸
   */
  getMinimumSize(): [width: number, height: number];
  /**
   * 设置窗口最大尺寸
   *
   * @param width 最大宽度
   * @param height 最大高度
   */
  setMaximumSize(width: number, height: number): void;
  /**
   * 获取窗口最大尺寸
   */
  getMaximumSize(): [width: number, height: number];
  /**
   * 设置窗口是否可启用，设置为 false 时窗口不响应鼠标与键盘事件
   *
   * @param enable 是否可启用
   */
  setEnabled(enable: boolean): void;
  /**
   * 窗口是否可启用
   */
  isEnabled(): boolean;
  /**
   * 最大化窗口
   */
  maximize(): void;
  /**
   * 取消最大化窗口
   */
  unmaximize(): void;
  /**
   * 窗口是否已最大化
   */
  isMaximized(): boolean;
  /**
   * 最小化窗口
   */
  minimize(): void;
  /**
   * 恢复窗口，即取消最小化
   */
  restore(): void;
  /**
   * 窗口是否已最小化
   */
  isMinimized(): boolean;
  /**
   * 窗口是否处于正常状态，即既未最大化也未最小化
   */
  isNormal(): boolean;
  /**
   * 设置窗口是否进入全屏
   *
   * @param flag 是否进入全屏
   */
  setFullScreen(flag: boolean): void;
  /**
   * 窗口是否处于全屏状态
   */
  isFullScreen(): boolean;
  /**
   * 设置窗口是否允许进入全屏
   *
   * @param fullscreenable 是否允许进入全屏
   */
  setFullScreenable(fullscreenable: boolean): void;
  /**
   * 窗口是否允许进入全屏
   */
  isFullScreenable(): boolean;
  /**
   * 设置窗口是否允许关闭
   *
   * @param closable 是否允许关闭
   */
  setClosable(closable: boolean): void;
  /**
   * 窗口是否允许关闭
   */
  isClosable(): boolean;
  /**
   * 设置窗口是否始终置顶
   *
   * @param flag 是否始终置顶
   * @param level 置顶层级，取值参考 Electron，例如 'screen-saver'
   */
  setAlwaysOnTop(flag: boolean, level?: string): void;
  /**
   * 窗口是否始终置顶
   */
  isAlwaysOnTop(): boolean;
  /**
   * 将窗口置于同级窗口的顶层
   */
  moveTop(): void;
  /**
   * 设置窗口标题
   *
   * @param title 窗口标题
   */
  setTitle(title: string): void;
  /**
   * 获取窗口标题
   */
  getTitle(): string;
  /**
   * 设置窗口宽高比
   *
   * @param aspectRatio 宽高比
   * @param extraSize 额外尺寸
   */
  setAspectRatio(aspectRatio: number, extraSize?: Size): void;
  /**
   * 设置窗口背景色
   *
   * @param backgroundColor 颜色值，支持 #RRGGBB 等格式
   */
  setBackgroundColor(backgroundColor: string): void;
  /**
   * 获取窗口背景色
   */
  getBackgroundColor(): string;
  /**
   * 设置窗口是否有阴影
   *
   * @param hasShadow 是否有阴影
   */
  setHasShadow(hasShadow: boolean): void;
  /**
   * 窗口是否有阴影
   */
  hasShadow(): boolean;
  /**
   * 设置窗口是否忽略鼠标事件
   *
   * @param ignore 是否忽略鼠标事件
   * @param options forward 为 true 时忽略鼠标事件但仍接收鼠标移动事件
   */
  setIgnoreMouseEvents(
    ignore: boolean,
    options?: {
      /**
       * 是否继续接收鼠标移动事件
       */
      forward?: boolean;
    }
  ): void;
  /**
   * 设置窗口是否在任务栏显示
   *
   * @param skip 是否跳过任务栏
   */
  setSkipTaskbar(skip: boolean): void;
  /**
   * 设置菜单栏是否可见
   *
   * @param visible 是否可见
   */
  setMenuBarVisibility(visible: boolean): void;
  /**
   * 菜单栏是否可见
   */
  isMenuBarVisible(): boolean;
  /**
   * 设置任务栏进度条
   *
   * @param progress 进度值，取值范围 0 ~ 1，小于 0 时移除进度条
   * @param options 进度条配置
   */
  setProgressBar(
    progress: number,
    options?: {
      /**
       * 显示模式
       */
      mode?: 'none' | 'normal' | 'indeterminate' | 'error' | 'paused';
    }
  ): void;
  /**
   * 设置窗口是否在所有工作区可见（macOS、Linux）
   *
   * @param visible 是否在所有工作区可见
   * @param options 配置项
   */
  setVisibleOnAllWorkspaces(
    visible: boolean,
    options?: {
      /**
       * 切换到其他工作区时是否仍然可见
       */
      visibleOnFullScreen?: boolean;
      /**
       * 是否跳过窗口转换动画
       */
      skipTransformProcessType?: boolean;
    }
  ): void;
  /**
   * 窗口是否在所有工作区可见
   */
  isVisibleOnAllWorkspaces(): boolean;
  /**
   * 设置内容保护，防止其他应用截取窗口内容（Windows、macOS）
   *
   * @param enable 是否开启内容保护
   */
  setContentProtection(enable: boolean): void;
  /**
   * 内容保护是否已开启
   */
  isContentProtected(): boolean;
  /**
   * 设置窗口是否进入 kiosk 模式
   *
   * @param flag 是否进入 kiosk 模式
   */
  setKiosk(flag: boolean): void;
  /**
   * 窗口是否处于 kiosk 模式
   */
  isKiosk(): boolean;
  /**
   * 闪烁窗口以引起用户注意
   *
   * @param flag 是否闪烁
   */
  flashFrame(flag: boolean): void;
  /**
   * 让窗口内的页面获得焦点
   */
  focusOnWebView(): void;
  /**
   * 让窗口内的页面失去焦点
   */
  blurWebView(): void;
  /**
   * 截取窗口页面图像
   *
   * @param rect 截取区域，不传时截取整个页面
   * @param options 截图配置
   */
  capturePage(
    rect?: Rectangle,
    options?: {
      /**
       * 页面隐藏时是否仍进行截图
       * 默认为 true
       */
      stayHidden?: boolean;
      /**
       * 截图期间是否阻止系统进入休眠
       * 默认为 false
       */
      stayAwake?: boolean;
    }
  ): Promise<NativeImage>;
  /**
   * 重新加载窗口页面
   */
  reload(): void;
  /**
   * 重新加载窗口页面并忽略缓存
   */
  reloadIgnoringCache(): void;
  /**
   * 加载远程页面
   *
   * @param url 页面地址
   */
  loadURL(url: string): Promise<void>;
  /**
   * 加载插件应用内的本地页面
   *
   * @param filePath 相对于插件应用根目录的页面路径
   */
  loadFile(filePath: string): Promise<void>;
  /**
   * 窗口页面是否正在加载
   */
  isLoading(): boolean;
  /**
   * 停止加载窗口页面
   */
  stop(): void;
}

/**
 * 自定义窗口的页面对象
 *
 * 通过窗口实例的 webContents 属性访问，用于控制窗口内页面并与页面通信。
 */
interface WebContents {
  /**
   * 页面唯一标识
   */
  id: number;
  /**
   * 向窗口页面发送消息
   *
   * 页面内通过 preload 中的 ipcRenderer.on(channel, ...) 接收。
   *
   * @param channel 消息通道名称
   * @param args 消息参数
   */
  send(channel: string, ...args: any[]): void;
  /**
   * 截取页面图像
   *
   * @param rect 截取区域，不传时截取整个页面
   * @param options 截图配置
   */
  capturePage(
    rect?: Rectangle,
    options?: {
      /**
       * 页面隐藏时是否仍进行截图
       * 默认为 true
       */
      stayHidden?: boolean;
      /**
       * 截图期间是否阻止系统进入休眠
       * 默认为 false
       */
      stayAwake?: boolean;
    }
  ): Promise<NativeImage>;
  /**
   * 打开开发者工具
   *
   * @param options 开发者工具配置
   */
  openDevTools(options?: {
    /**
     * 显示位置
     */
    mode: 'left' | 'right' | 'bottom' | 'undocked' | 'detach';
    /**
     * 打开时是否激活
     */
    activate?: boolean;
    /**
     * 窗口标题
     */
    title?: string;
  }): void;
  /**
   * 关闭开发者工具
   */
  closeDevTools(): void;
  /**
   * 开发者工具是否已打开
   */
  isDevToolsOpened(): boolean;
  /**
   * 开发者工具是否已获得焦点
   */
  isDevToolsFocused(): boolean;
  /**
   * 切换开发者工具的显示状态
   */
  toggleDevTools(): void;
  /**
   * 在页面中执行 JavaScript
   *
   * @param code 要执行的代码
   * @param userGesture 是否以用户手势的方式执行，默认为 false
   */
  executeJavaScript<T>(code: string, userGesture?: boolean): Promise<T>;
  /**
   * 向页面注入 CSS
   *
   * @param css 要注入的样式
   * @param options 注入配置
   */
  insertCSS(
    css: string,
    options?: {
      /**
       * 样式的来源层级
       * 默认为 'author'
       */
      cssOrigin?: 'user' | 'author';
    }
  ): Promise<string>;
  /**
   * 移除通过 insertCSS 注入的样式
   *
   * @param key insertCSS 返回的标识
   */
  removeInsertedCSS(key: string): Promise<void>;
  /**
   * 在页面中插入文本，模拟输入法输入
   *
   * @param text 文本内容
   */
  insertText(text: string): Promise<void>;
  /**
   * 复制当前选中的内容
   */
  copy(): void;
  /**
   * 剪切当前选中的内容
   */
  cut(): void;
  /**
   * 粘贴剪贴板内容
   */
  paste(): void;
  /**
   * 粘贴剪贴板内容并匹配当前样式
   */
  pasteAndMatchStyle(): void;
  /**
   * 删除当前选中的内容
   */
  delete(): void;
  /**
   * 撤销
   */
  undo(): void;
  /**
   * 重做
   */
  redo(): void;
  /**
   * 全选
   */
  selectAll(): void;
  /**
   * 取消选中
   */
  unselect(): void;
  /**
   * 替换当前选中的内容
   *
   * @param text 替换后的文本
   */
  replace(text: string): void;
  /**
   * 替换当前拼写错误的单词
   *
   * @param text 替换后的文本
   */
  replaceMisspelling(text: string): void;
  /**
   * 复制指定位置的图片
   *
   * @param x 页面横坐标
   * @param y 页面纵坐标
   */
  copyImageAt(x: number, y: number): void;
  /**
   * 在页面中查找文本
   *
   * @param text 要查找的文本
   * @param options 查找选项
   */
  findInPage(
    text: string,
    options?: {
      /**
       * 是否向前搜索
       * 默认为 true
       */
      forward?: boolean;
      /**
       * 是否开始新的查找会话，继续查找时设置为 false
       * 默认为 false
       */
      findNext?: boolean;
      /**
       * 是否区分大小写
       * 默认为 false
       */
      matchCase?: boolean;
    }
  ): number;
  /**
   * 停止页面中的查找
   *
   * @param action 停止查找后的选区处理方式
   */
  stopFindInPage(
    action: 'clearSelection' | 'keepSelection' | 'activateSelection'
  ): void;
  /**
   * 页面是否正在加载
   */
  isLoading(): boolean;
  /**
   * 页面主框架是否正在加载
   */
  isLoadingMainFrame(): boolean;
  /**
   * 页面是否正在等待响应
   */
  isWaitingForResponse(): boolean;
  /**
   * 停止加载当前页面
   */
  stop(): void;
  /**
   * 页面是否已销毁
   */
  isDestroyed(): boolean;
  /**
   * 页面是否已崩溃
   */
  isCrashed(): boolean;
  /**
   * 页面是否已获得焦点
   */
  isFocused(): boolean;
  /**
   * 页面是否正在绘制
   */
  isPainting(): boolean;
  /**
   * 页面是否处于离屏渲染状态
   */
  isOffscreen(): boolean;
  /**
   * 开始离屏渲染
   */
  startPainting(): void;
  /**
   * 停止离屏渲染
   */
  stopPainting(): void;
  /**
   * 页面是否正在被捕获
   */
  isBeingCaptured(): boolean;
  /**
   * 页面当前是否可听见声音
   */
  isCurrentlyAudible(): boolean;
  /**
   * 页面音频是否已静音
   */
  isAudioMuted(): boolean;
  /**
   * 设置页面音频静音状态
   *
   * @param muted 是否静音
   */
  setAudioMuted(muted: boolean): void;
  /**
   * 获取页面标题
   */
  getTitle(): string;
  /**
   * 获取页面地址
   */
  getURL(): string;
  /**
   * 获取页面 User-Agent
   */
  getUserAgent(): string;
  /**
   * 设置页面 User-Agent
   *
   * @param userAgent User-Agent 字符串
   */
  setUserAgent(userAgent: string): void;
  /**
   * 获取页面缩放比例
   */
  getZoomFactor(): number;
  /**
   * 设置页面缩放比例
   *
   * @param factor 缩放比例，1.0 表示不缩放
   */
  setZoomFactor(factor: number): void;
  /**
   * 页面后台节流是否已开启
   */
  getBackgroundThrottling(): boolean;
  /**
   * 设置页面后台节流
   *
   * @param allowed 是否允许后台节流
   */
  setBackgroundThrottling(allowed: boolean): void;
  /**
   * 获取页面帧率
   */
  getFrameRate(): number;
  /**
   * 设置页面帧率
   *
   * @param fps 帧率
   */
  setFrameRate(fps: number): void;
  /**
   * 获取页面的 WebRTC IP 处理策略
   */
  getWebRTCIPHandlingPolicy(): WebRTCIPHandlingPolicy;
  /**
   * 设置页面的 WebRTC IP 处理策略
   *
   * @param policy 处理策略
   */
  setWebRTCIPHandlingPolicy(policy: WebRTCIPHandlingPolicy): void;
  /**
   * 设置页面是否忽略菜单快捷键，便于在页面中自行处理按键
   *
   * @param ignore 是否忽略
   */
  setIgnoreMenuShortcuts(ignore: boolean): void;
  /**
   * 获取页面所属的 Chromium 进程 ID
   */
  getProcessId(): number;
  /**
   * 获取页面所属的操作系统进程 ID
   */
  getOSProcessId(): number;
  /**
   * 获取系统打印机列表
   */
  getPrinters(): PrinterSync[];
  /**
   * 打印页面
   *
   * @param options 打印选项
   * @param callback 打印结束回调，success 为 false 时 errorType 表示失败原因
   */
  print(
    options?: Record<string, any>,
    callback?: (success: boolean, errorType?: string) => void
  ): void;
  /**
   * 将页面导出为 PDF
   *
   * @param options PDF 选项
   */
  printToPDF(options: Record<string, any>): Promise<Uint8Array>;
  /**
   * 保存页面
   *
   * @param fullPath 保存路径
   * @param saveType 保存类型
   */
  savePage(
    fullPath: string,
    saveType: 'HTMLOnly' | 'HTMLComplete' | 'MHTML'
  ): Promise<void>;
  /**
   * 将页面堆快照保存到文件
   *
   * @param filePath 保存路径
   */
  takeHeapSnapshot(filePath: string): Promise<void>;
  /**
   * 发送输入事件
   *
   * @param e 输入事件对象
   */
  sendInputEvent(e: any): void;
  /**
   * 清除页面重绘区域的内容
   */
  invalidate(): void;
  /**
   * 让页面失去焦点
   */
  blur(): void;
  /**
   * 让页面获得焦点
   */
  focus(): void;
  /**
   * 开启设备模拟
   */
  enableDeviceEmulation(): void;
  /**
   * 关闭设备模拟
   */
  disableDeviceEmulation(): void;
}

/**
 * 打印机信息
 */
interface PrinterSync {
  /**
   * 打印机描述
   */
  description: string;
  /**
   * 打印机名称
   */
  displayName: string;
  /**
   * 是否为默认打印机
   */
  isDefault: boolean;
  /**
   * 打印机状态码
   */
  status: number;
  /**
   * 打印机选项
   */
  options?: {
    'printer-location'?: string;
    'printer-make-and-model'?: string;
    'system_driverinfo'?: string;
  };
}

/**
 * WebRTC IP 处理策略
 */
type WebRTCIPHandlingPolicy =
  | 'default'
  | 'default_public_interface_only'
  | 'default_public_and_private_interfaces'
  | 'disable_non_proxied_udp';
```

`Rectangle`、`Size`、`NativeImage` 为窗口与屏幕共用的类型，类型定义见屏幕文档：[`Rectangle`](./screen.md#rectangle)、[`Size`](./screen.md#size)、[`NativeImage`](./screen.md#native-image)。
:::

### 示例

```js
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
  }
);
```

## `utools.sendToParent(channel[, ...args])`

向创建当前自定义窗口的父窗口发送消息。

### 类型定义

```ts
function sendToParent(channel: string, ...args: any[]): void;
```

### 参数

- `channel`：消息通道名称。
- `...args`：要发送的消息参数。

### 示例

```js
// 自定义窗口调用
utools.sendToParent("pong", "hello", 123);
```

## `utools.getWindowType()`

获取当前窗口类型。

### 类型定义

```ts
function getWindowType(): "main" | "detach" | "custom";
```

### 返回

- `main`：uTools 搜索框主窗口。
- `detach`：插件应用与 uTools 搜索框主窗口分离后运行的独立窗口。
- `custom`: 插件应用创建的自定义窗口。

### 示例

```js
const windowType = utools.getWindowType();
console.log(windowType);
```

## `utools.hideMainWindow(isRestorePreWindow)`

隐藏 uTools 搜索框主窗口。

执行后，uTools 搜索框主窗口及当前在主窗口中运行的插件应用都会被隐藏；已经分离为独立窗口的插件应用不受影响。

### 类型定义

```ts
function hideMainWindow(isFocusPrevWindow?: boolean): boolean;
```

### 参数

- `isFocusPrevWindow`：是否将焦点回归到之前操作的系统窗口，默认 `true`

### 返回

- `true`：执行成功。
- `false`: 执行失败，当前执行窗口不是 uTools 搜索框主窗口。

### 示例

```js
utools.hideMainWindow();
```

## `utools.showMainWindow()`

显示 uTools 搜索框主窗口。

执行后，uTools 搜索框主窗口及当前在主窗口中运行的插件应用都会显示。

### 类型定义

```ts
function showMainWindow(): boolean;
```

### 返回

- `true`：执行成功
- `false`: 执行失败，当前执行窗口不是 uTools 搜索框主窗口

### 示例

```js
utools.showMainWindow();
```

## `utools.setExpandHeight(height)`

设置插件应用在 uTools 搜索框主窗口中的显示高度，单位为 DIP。

### 类型定义

```ts
function setExpandHeight(height: number): boolean;
```

### 参数

- `height`：插件应用在主窗口中的显示高度，单位为 DIP。

### 返回

- `true`：设置成功
- `false`：设置失败，当前执行窗口不是 uTools 搜索框主窗口

### 示例

```js
utools.setExpandHeight(300);
```

## `utools.setSubInput(onChange[, placeholder[, isFocus]])`

设置子输入框。

进入插件应用后，uTools 搜索框主窗口的主输入框将切换为子输入框，插件应用可以通过子输入框接收用户输入。

### 类型定义

```ts
function setSubInput(
  onChange: (details: { text: string }) => void,
  placeholder?: string,
  isFocus?: boolean
): boolean;
```

### 参数

- `onChange`：子输入框内容发生变化时调用的回调函数。
- `placeholder`：子输入框占位文本。
- `isFocus`：是否自动聚焦输入框，默认为 `true`。

### 返回

- `true`：设置成功
- `false`：设置失败，当前执行窗口是自定义窗口

### 示例

```js
utools.setSubInput(({ text }) => {
  console.log(text);
}, "搜索");
```

## `utools.removeSubInput()`

移除子输入框。

### 类型定义

```ts
function removeSubInput(): boolean;
```

### 返回

- `true`：移除成功。
- `false`: 移除失败，当前执行窗口是自定义窗口

### 示例

```js
utools.removeSubInput();
```

## `utools.setSubInputValue(text)`

设置子输入框的值。

### 类型定义

```ts
function setSubInputValue(text: string): boolean;
```

### 参数

- `text`：要设置的文本内容。

### 返回

- `true`：设置成功。
- `false`：设置失败，当前执行窗口是自定义窗口。

### 示例

```js
utools.setSubInputValue("hello world");
```

## `utools.subInputFocus()`

使子输入框获得焦点。

### 类型定义

```ts
function subInputFocus(): boolean;
```

### 返回

- `true`：设置成功。
- `false`: 设置失败，当前执行窗口是自定义窗口。

### 示例

```js
utools.subInputFocus();
```

## `utools.subInputBlur()`

使子输入框失去焦点，并使插件应用获得焦点。

### 类型定义

```ts
function subInputBlur(): void;
```

### 示例

```js
utools.subInputBlur();
```

## `utools.subInputSelect()`

使子输入框获得焦点，并选中输入框中的全部内容。

### 类型定义

```ts
function subInputSelect(): boolean;
```

### 返回

- `true`：操作成功。
- `false`：操作失败，当前执行窗口是自定义窗口。

### 示例

```js
utools.subInputSelect();
```

## `utools.findInPage(text[, options])`

在当前页面中查找指定文本。

### 类型定义

```ts
function findInPage(text: string, options?: FindInPageOptions): void;
```

### 参数

- `text`：要查找的文本。
- `options`：查找选项。

::: details `FindInPageOptions` 类型定义
```ts
interface FindInPageOptions {
  /**
   * 是否向前搜索
   * 默认为 true
   */
  forward?: boolean;
  /**
   * 是否开始新的查找会话
   * 首次查找时应设置为 true，继续查找时设置为 false
   * 默认为 false
   */
  findNext?: boolean;
  /**
   * 是否区分大小写
   * 默认为 false
   */
  matchCase?: boolean;
}
```
:::

### 示例

```js
utools.findInPage("hello");
```

## `utools.stopFindInPage(action)`

停止当前页面的文本查找，与 `findInPage` 配合使用。

### 类型定义

```ts
function stopFindInPage(
  action: "clearSelection" | "keepSelection" | "activateSelection"
): void;
```

### 参数

- `action`：停止查找后的选区处理方式，默认为 `clearSelection`。
  - `clearSelection`：清除选中文本。
  - `keepSelection`：保留选中文本。
  - `activateSelection`：激活选中文本。

### 示例

```js
utools.stopFindInPage("clearSelection");
```

## `utools.outPlugin([isKill])`

退出当前插件应用。

默认情况下，插件应用退出到后台，等待下次快速响应；传入 `true` 时，将结束插件应用的运行。

### 类型定义

```ts
function outPlugin(isKill?: boolean): void;
```

### 参数

- `isKill`：是否结束插件应用的运行，默认为 `false`。

### 示例

```js
// 退出到后台
utools.outPlugin();
// 结束运行
utools.outPlugin(true);
```
