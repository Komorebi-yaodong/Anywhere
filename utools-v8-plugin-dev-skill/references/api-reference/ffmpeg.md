# FFmpeg 音视频处理

uTools 以独立扩展的形式提供 FFmpeg 能力。首次调用 `utools.runFFmpeg()` 时，如果本地尚未安装 FFmpeg，uTools 会引导用户下载并安装 FFmpeg。

当前提供 **FFmpeg v8.1.2**，仅包含 `ffmpeg`，不包含 `ffprobe` 和 `ffplay`。

## `utools.runFFmpeg(args[, onProgress])`

执行 FFmpeg 命令。

### 类型定义

```ts
function runFFmpeg(
  args: string[],
  onProgress?: (progress: RunFFmpegProgress) => void
): FFmpegProcess;

function runFFmpeg(
  args: string[],
  options?: RunFFmpegOptions
 ): FFmpegProcess;

```

### 参数

- `args`: 传递给 FFmpeg 的命令行参数。每个参数作为数组中的一个元素传入，不需要包含 `ffmpeg` 命令本身。
- `onProgress`: FFmpeg 处理过程中周期性触发的进度回调。
- `options`: FFmpeg 执行选项。
  - `onProgress`：FFmpeg 处理过程中周期性触发的进度回调。
  - `onLog`：接收 FFmpeg 执行过程中的日志输出。

### 返回

返回一个 FFmpegProcess 对象。

`FFmpegProcess` 是 `Promise<void>` 的扩展，除支持标准 `Promise` 操作外，还提供 `kill()` 和 `quit()` 方法，用于控制正在运行的 FFmpeg 任务。

::: details `FFmpegProcess` 类型定义

```ts
interface FFmpegProcess extends Promise<void> {
  /**
   * 强制终止 FFmpeg 进程。
   */
  kill(): void;
  /**
   * 请求 FFmpeg 正常退出。
   */
  quit(): void;
}
```
:::

::: details `RunFFmpegOptions` 类型定义

```ts
interface RunFFmpegOptions {
  /**
   * FFmpeg 处理过程中周期性触发的进度回调。
   */
  onProgress?: (progress: RunFFmpegProgress) => void;
  /**
   * 接收 FFmpeg 执行过程中的日志输出。
   */
  onLog?: (text: string) => void;
}
```
:::

::: details `RunFFmpegProgress` 类型定义

```ts
interface RunFFmpegProgress {
  /**
   * 当前处理媒体的比特率，例如 `"1926 kb/s"`。
   */
  bitrate: string;
  /**
   * 当前处理帧率，单位为 FPS。
   */
  fps: number;
  /**
   * 已处理的帧数。
   */
  frame: number;
  /**
   * 处理完成百分比。
   *
   * 仅在能够确定输入媒体总时长时提供，否则可能为 undefined。
   */
  percent?: number;
  /**
   * 当前编码质量指标。
   * 对不同编码器，其含义可能不同。
   */
  q: number | string;
  /**
   * 当前已生成输出数据的大小，例如 `"1.2 MiB"`。
   */
  size: string;
  /**
   * 当前处理速度，例如 `"1.5x"`。
   */
  speed: string;
  /**
   * 已处理的媒体时间，例如 `"00:01:23.45"`。
   */
  time: string;
}
```

:::

### 示例

```js
// 视频压缩
utools.runFFmpeg(
  [
    "-i", "/path/to/input.mp4",
    "-c:v", "libx264",
    "-crf", "30",
    "-preset", "fast",
    "-tag:v", "avc1",
    "-movflags", "faststart",
    "-c:a", "aac",
    "-b:a", "128k",
    "-map", "0:v",
    "-map", "0:a?",
    "/path/to/output.mp4"
  ],
  (progress) => {
    if (progress.percent !== undefined) {
      console.log(`压缩中 ${progress.percent}%`);
    } else {
      console.log("压缩中");
    }
  }
)
.then(() => {
  console.log("压缩完成");
})
.catch((error) => {
  console.error(error.message);
});
```

```js
// 视频转 GIF
const process = utools.runFFmpeg([
  "-i", "/path/to/input.mp4",
  "-vf", "fps=15,scale=200:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
  "-loop", "0",
  "/path/to/output.gif"
], (progress) => {
  if (progress.percent !== undefined) {
    console.log(`转换中 ${progress.percent}%`);
  } else {
    console.log("转换中");
  }
});
process
.then(() => {
  console.log("转换完成");
})
.catch((error) => {
  console.error(error.message);
});
// 执行 process.kill() 强制取消转换。
```

```js
// 音频提取
utools.runFFmpeg([
  "-i", "/path/to/input.mp4",
  "-q:a", "0",
  "-map", "a",
  "/path/to/output.mp3"
])
.then(() => {
  console.log("提取完成");
})
.catch((error) => {
  console.error(error.message);
});
```
