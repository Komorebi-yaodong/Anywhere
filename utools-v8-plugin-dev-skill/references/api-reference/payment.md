# 支付

uTools 支持插件应用向用户提供付费功能。开发者需要开通支付权限后，才能使用相关支付 API。

如需开通支付能力，请联系我们。

::: tip

插件应用可以根据业务需求选择以下付费模式：

- **基础功能免费，高级功能付费**：用户可以免费使用基础功能，购买后解锁高级功能。**推荐使用此模式**。
- **完全付费**：用户购买授权后，才能使用插件应用的功能。

用户购买商品后，将获得对应的授权。授权在有效期内可以使用对应的付费功能。

如果商品配置为永久授权，则用户购买后可以永久使用对应功能。**推荐使用永久授权**。
:::

## `utools.isPurchasedUser()`

获取当前用户的购买授权状态。

### 类型定义

```ts
function isPurchasedUser(): boolean | string
```

### 返回

- `false`：用户未购买，或当前授权已失效。
- `true`：用户拥有永久授权。
- `string`：用户拥有有效期授权，返回授权到期时间，格式为 `yyyy-MM-dd HH:mm:ss`。

该 API 返回的是当前用户的授权状态，插件应用可以据此判断用户是否可以使用需要付费授权的功能。

### 示例

```js
const purchasedUser = utools.isPurchasedUser();

if (purchasedUser) {
  // 已获得有效授权，可使用付费功能

  if (purchasedUser === true) {
    // 永久授权
  } else {
    // 有效期授权
    console.log(`授权到期时间：${purchasedUser}`);
  }
} else {
  // 未获得有效授权，打开插件应用的购买弹窗
  utools.openPurchase({
    goodsId: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }, () => {
    console.log("购买成功");
  });
}
```

## `utools.openPurchase(options, callback)`

打开插件应用的购买弹窗。

### 类型定义

```ts
function openPurchase(
  options: OpenPurchaseOptions,
  callback?: () => void
): void
```

### 参数

- `options`：购买参数。
- `callback`：购买成功后的回调函数。

::: details `OpenPurchaseOptions` 类型定义

```ts
interface OpenPurchaseOptions {
  /**
   * 商品 ID，在「uTools 开发者工具」中创建。
   */
  goodsId: string;
  /**
   * 第三方服务生成的订单号，长度为 6～64 个字符。
   */
  outOrderId?: string;
  /**
   * 第三方服务附加数据。
   * 在订单查询 API 和支付通知中原样返回，可用于传递自定义参数。
   * 最多 256 个字符。
   */
  attach?: string;
}
```

:::

### 示例

```js
utools.openPurchase({
  goodsId: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}, () => {
  const purchasedUser = utools.isPurchasedUser();

  if (purchasedUser) {
    console.log("用户已获得有效授权");
  }
});
```
