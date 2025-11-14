# DipCoin Perpetual Trading SDK - 使用指南

本文档详细说明如何在本地使用和运行 SDK。

## 📋 目录

1. [环境准备](#环境准备)
2. [安装依赖](#安装依赖)
3. [配置环境变量](#配置环境变量)
4. [运行示例](#运行示例)
5. [验证功能](#验证功能)
6. [常见问题](#常见问题)

## 🔧 环境准备

### 系统要求

- Node.js >= 16.0.0
- npm >= 7.0.0 或 yarn >= 1.22.0
- TypeScript >= 5.0.0

### 检查环境

```bash
# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version

# 检查 TypeScript（如果已全局安装）
tsc --version
```

## 📦 安装依赖

### 1. 克隆或进入项目目录

```bash
cd dipcoin-perp-client-ts
```

### 2. 安装项目依赖

```bash
# 使用 npm
npm install

# 或使用 yarn
yarn install
```

### 3. 构建项目（可选，用于开发）

```bash
# 构建 TypeScript 代码
npm run build

# 或
yarn build
```

## 🔐 配置环境变量

### 1. 创建环境变量文件

在项目根目录创建 `.env` 文件（如果不存在）：

```bash
# 在项目根目录
touch .env
```

### 2. 配置私钥

编辑 `.env` 文件，添加你的私钥：

```bash
# .env 文件内容
PRIVATE_KEY=your-private-key-here
```

**⚠️ 重要提示：**
- 私钥格式：Sui 私钥字符串（例如：`suiprivkey1...`）
- **永远不要**将 `.env` 文件提交到 Git
- 使用测试网私钥进行测试，避免使用主网私钥

### 3. 私钥格式说明

Sui 私钥支持以下格式：

1. **标准格式**（推荐）：
   ```
   suiprivkey1qzy3x9q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8
   ```

2. **Base64 格式**（旧格式）：
   ```json
   {
     "schema": "ED25519",
     "privateKey": "base64-encoded-key"
   }
   ```

### 4. 获取测试私钥

如果你没有测试私钥，可以通过以下方式获取：

1. **使用 Sui CLI**：
   ```bash
   sui client new-address ed25519
   ```

2. **使用 Sui 钱包**：
   - 安装 Sui Wallet 浏览器扩展
   - 创建新钱包
   - 导出私钥

## 🚀 运行示例

### 方法一：使用 npm script（推荐）

```bash
# 运行示例文件
npm run example

# 或使用 yarn
yarn example
```

这个命令会：
1. 自动读取 `.env` 文件中的 `PRIVATE_KEY`
2. 使用 `ts-node` 直接运行 TypeScript 文件
3. 连接到测试网（testnet）

### 方法二：直接使用 ts-node

```bash
# 设置环境变量并运行
PRIVATE_KEY=your-private-key ts-node --project tsconfig.example.json examples/basic-usage.ts

# 或使用 dotenv（需要安装 dotenv-cli）
npx dotenv -e .env -- ts-node --project tsconfig.example.json examples/basic-usage.ts
```

### 方法三：使用 Node.js 运行编译后的代码

```bash
# 1. 构建项目
npm run build

# 2. 运行编译后的代码
PRIVATE_KEY=your-private-key node dist/examples/basic-usage.js
```

## ✅ 验证功能

### 1. 验证账户信息查询

示例文件会依次执行以下操作：

```typescript
// 1. 获取账户信息
const accountInfo = await sdk.getAccountInfo();
// 预期输出：
// - Wallet Address: 0x...
// - Wallet Balance: ...
// - Account Value: ...
// - Free Collateral: ...
```

**验证点：**
- ✅ 能成功获取账户信息
- ✅ 返回的数据格式正确
- ✅ 钱包地址与私钥匹配

### 2. 验证仓位查询

```typescript
// 2. 获取仓位
const positions = await sdk.getPositions();
// 预期输出：
// - Found X positions
// - 或空数组（如果没有仓位）
```

**验证点：**
- ✅ 能成功查询仓位
- ✅ 返回数组格式
- ✅ 仓位数据字段完整

### 3. 验证挂单查询

```typescript
// 3. 获取挂单
const openOrders = await sdk.getOpenOrders();
// 预期输出：
// - Found X open orders
// - 或空数组（如果没有挂单）
```

**验证点：**
- ✅ 能成功查询挂单
- ✅ 返回数组格式
- ✅ 订单数据字段完整

### 4. 验证下单功能（谨慎测试）

⚠️ **注意：下单会实际执行交易，请谨慎测试！**

取消示例文件中的注释来测试下单：

```typescript
// 在 examples/basic-usage.ts 中取消注释
console.log("\n=== Placing Market Order ===");
const orderResult = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.01", // 小数量测试
  leverage: "10",
});
```

**验证点：**
- ✅ 订单成功提交
- ✅ 返回订单 ID 或交易哈希
- ✅ 订单出现在挂单列表中

### 5. 验证撤单功能

```typescript
// 取消示例文件中的撤单代码注释
if (openOrders.status && openOrders.data && openOrders.data.length > 0) {
  const cancelResult = await sdk.cancelOrder({
    symbol: openOrders.data[0].symbol,
    orderHashes: [openOrders.data[0].hash],
  });
}
```

**验证点：**
- ✅ 撤单成功
- ✅ 订单从挂单列表中消失

## 📝 完整测试流程

### 步骤 1：基础功能测试

```bash
# 1. 确保环境变量已配置
cat .env | grep PRIVATE_KEY

# 2. 运行示例（只查询，不下单）
npm run example
```

**预期结果：**
- 显示钱包地址
- 显示账户信息
- 显示仓位列表（可能为空）
- 显示挂单列表（可能为空）

### 步骤 2：下单测试（可选）

1. 编辑 `examples/basic-usage.ts`
2. 取消下单代码的注释
3. 修改为小数量测试（如 0.01）
4. 运行示例：

```bash
npm run example
```

5. 验证订单是否成功：
   - 检查返回的订单结果
   - 再次运行示例查看挂单列表

### 步骤 3：撤单测试（可选）

1. 确保有挂单存在
2. 取消撤单代码的注释
3. 运行示例：

```bash
npm run example
```

4. 验证订单是否被取消：
   - 检查撤单返回结果
   - 再次运行示例确认挂单已消失

## 🐛 常见问题

### 问题 1：找不到 PRIVATE_KEY 环境变量

**错误信息：**
```
Please set PRIVATE_KEY environment variable
```

**解决方法：**
1. 检查 `.env` 文件是否存在
2. 确认 `.env` 文件中有 `PRIVATE_KEY=...` 配置
3. 确认 `.env` 文件在项目根目录

### 问题 2：私钥格式错误

**错误信息：**
```
Invalid secret key format
```

**解决方法：**
1. 确认私钥格式正确（Sui 标准格式）
2. 检查私钥是否完整（没有截断）
3. 确认私钥没有多余的空格或换行

### 问题 3：网络连接错误

**错误信息：**
```
Request failed / Network error
```

**解决方法：**
1. 检查网络连接
2. 确认 API 地址正确（测试网/主网）
3. 检查防火墙设置
4. 尝试使用 VPN（如果在受限网络环境）

### 问题 4：账户未激活（Onboarding）

**错误信息：**
```
Failed to get account info: ...
```

**解决方法：**
1. 确认账户已完成 Onboarding
2. 在测试网环境中首次使用需要完成身份验证
3. 检查账户是否有足够的余额

### 问题 5：TypeScript 编译错误

**错误信息：**
```
Cannot find module '...'
```

**解决方法：**
1. 重新安装依赖：`npm install`
2. 检查 `tsconfig.json` 配置
3. 确认所有依赖都已正确安装

### 问题 6：签名错误

**错误信息：**
```
Signature verification failed
```

**解决方法：**
1. 确认私钥与钱包地址匹配
2. 检查私钥格式是否正确
3. 确认使用的是正确的网络（testnet/mainnet）

## 🔍 调试技巧

### 1. 启用详细日志

在代码中添加日志：

```typescript
// 在 sdk.ts 或示例文件中
console.log("Request params:", requestParams);
console.log("Response:", response);
```

### 2. 使用调试器

```bash
# 使用 Node.js 调试器
node --inspect-brk node_modules/.bin/ts-node --project tsconfig.example.json examples/basic-usage.ts
```

### 3. 检查网络请求

在 `src/services/httpClient.ts` 中添加请求日志：

```typescript
this.instance.interceptors.request.use((config) => {
  console.log("Request:", config.method, config.url, config.data);
  return config;
});
```

## 📚 更多示例

查看 `examples/` 目录获取更多示例代码。

## 🆘 获取帮助

如果遇到问题：

1. 检查本文档的常见问题部分
2. 查看项目 README.md
3. 检查 API 文档
4. 提交 Issue 到项目仓库

## ⚠️ 安全提示

1. **永远不要**将私钥提交到 Git
2. **永远不要**在代码中硬编码私钥
3. 使用 `.env` 文件管理敏感信息
4. 确保 `.env` 在 `.gitignore` 中
5. 测试时使用测试网私钥
6. 生产环境使用环境变量或密钥管理服务

