# 定时任务

插件应用可以通过 `utools.requestSchedule()` 向用户请求创建定时任务。用户允许后，uTools 会按照任务的触发规则执行任务，并在触发时通过 `onScheduleTrigger` 通知插件应用。

## `utools.requestSchedule(schedule)`

向用户请求创建定时任务。

::: warning 注意

`requestSchedule()` 仅用于请求创建定时任务，最终是否创建由用户决定。

用户允许创建后，当达到任务触发条件时，uTools 会触发 `onScheduleTrigger` 事件。插件应用需要根据任务的 `code` 在事件回调中执行对应的任务逻辑。

`Promise` 表示请求流程完成，不代表定时任务一定创建成功。用户拒绝创建时，任务不会生成。

详情参考 [onScheduleTrigger 事件](events.md#utoolsonscheduletriggercallback)

:::

### 类型定义

```ts
function requestSchedule(schedule: Schedule): Promise<void>;
```

### 参数

- `schedule`: 定时任务配置。

::: details `Schedule` 类型定义

```ts
/**
 * 请求创建的定时任务配置
 */
interface Schedule {
  /**
   * 任务唯一标识
   *
   * 用于在 onScheduleTrigger 事件中识别具体任务
   */
  code: string;
  /**
   * 任务名称
   *
   * 用于向用户展示
   */
  label: string;
  /**
   * 任务触发规则
   *
   * - 传入时间戳：一次性任务，在指定时间触发一次后自动删除
   * - 传入 ScheduleTrigger：重复任务，按 Cron 规则重复触发
   */
  trigger: number | ScheduleTrigger;
}
```

```ts
/**
 * 重复任务触发规则
 *
 * 按 Cron 规则重复触发
 */
interface ScheduleTrigger {
  /**
   * Cron 表达式
   *
   * 仅支持标准 5 位 Cron 格式：分 时 日 月 周
   */
  cron: string;
  /**
   * 可选，任务开始生效时间
   *
   * Unix 时间戳，单位为毫秒，该时间之前不会触发任务
   */
  startTime?: number;
  /**
   * 可选，任务结束生效时间
   *
   * Unix 时间戳，单位为毫秒，超过该时间后不再触发任务，并自动删除
   */
  endTime?: number;
}
```

:::

### 触发规则

`trigger` 支持以下两种形式：

#### 一次性任务

直接传入 Unix 时间戳，任务在指定时间触发一次。任务结束后会自动删除。

```js
utools.requestSchedule({
  code: 'once-test',
  label: '一次性任务测试',
  trigger: Date.now() + 60000
});
```

#### 重复任务

传入 `ScheduleTrigger`，按照 Cron 表达式重复触发。

例如，每天 9:00 至 18:00，每小时触发一次：

```js
utools.requestSchedule({
  code: 'drink-water',
  label: '提示喝水',
  trigger: {
    cron: '0 9-18 * * *'
  }
});
```

如果指定了 `startTime` 和 `endTime`，任务仅在该时间范围内按照 Cron 规则触发。

例如，仅在 2026 年 9 月 1 日至 9 月 30 日期间，每天 9:00 触发：

```js
utools.requestSchedule({
  code: 'daily-report',
  label: '每日生成报告',
  trigger: {
    cron: '0 9 * * *',
    startTime: new Date('2026-09-01 00:00:00').getTime(),
    endTime: new Date('2026-09-30 23:59:59').getTime()
  }
});
```

超过 `endTime` 后，定时任务会自动删除。

#### 处理任务触发

定时任务触发后，uTools 会调用通过 `utools.onScheduleTrigger()` 注册的回调，并传入任务 `code`。

插件应用应根据 `code` 判断需要执行的任务逻辑：

```js
utools.onScheduleTrigger(({ code }) => {
  if (code === 'once-test') {
    utools.showNotification('一次性任务通知');
    return;
  }

  if (code === 'drink-water') {
    utools.showNotification('该去喝水啦');
  }
});
```

建议为每个定时任务使用具有明确含义且稳定的 `code`。


::: tip

任务执行结果根据 `onScheduleTrigger` 回调状态判断：

- 回调正常完成，记录为成功。
- 回调抛出异常或返回 rejected Promise，记录为失败。

执行结果会更新 `successCount`、`failureCount` 和 `lastExecuteAt`。

:::


## `utools.getSchedules()`

获取当前插件应用已创建的定时任务列表。

### 类型定义

```ts
function getSchedules(): ScheduleInfo[];
```

::: details `ScheduleInfo` 类型定义

```ts
/**
 * 已创建的定时任务信息
 */
interface ScheduleInfo {
  /**
   * 任务唯一标识
   */
  code: string;
  /**
   * 任务名称
   */
  label: string;
  /**
   * 任务触发规则
   */
  trigger: number | ScheduleTrigger;
  /**
   * onScheduleTrigger 回调正常完成的次数
   */
  successCount: number;
  /**
   * onScheduleTrigger 回调执行过程中抛出异常或返回 rejected Promise 的次数
   */
  failureCount: number;
  /**
   * 最近一次执行时间
   *
   * Unix 时间戳，单位为毫秒，未执行过时不存在
   */
  lastExecuteAt?: number;
  /**
   * 最近一次任务执行状态
   *
   * success 表示执行成功，failure 表示执行失败
   */
  lastStatus?: 'success' | 'failure';
}
```

:::

### 示例

```js
const schedules = utools.getSchedules();
console.log(schedules)
```

## `utools.removeSchedule(code)`

删除指定的定时任务。如果任务不存在，将抛出异常。

### 类型定义

```ts
function removeSchedule(code:string): void;
```

### 参数

- `code`: 要删除的任务唯一标识。

### 示例

```js
utools.removeSchedule('once-test');
```