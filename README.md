# DipCoin Perpetual Trading SDK

TypeScript SDK for DipCoin Perpetual Trading on Sui blockchain.

## Table of Contents

1. [Installation](#-installation)
2. [Quick Start](#-quick-start)
3. [Unified Demo Script](#-unified-demo-script)
4. [Usage Guide](#-usage-guide)
5. [Core Features](#core-features)
6. [API Reference](#api-reference)
7. [Examples](#examples)
8. [License](#license)

## 📦 Installation

```bash
npm install @dipcoinlab/perp-client-ts
# or
yarn add @dipcoinlab/perp-client-ts
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
PRIVATE_KEY=your-private-key-here
```

### 3. Run Example

```bash
npm run example
# or
RUN_LIMIT_ORDER=1 npm run example
```

This command executes the unified script at `examples/index.ts`.  
Each trading action (deposits, withdrawals, order placement, margin edits, TP/SL flows, etc.) is disabled by default and can be opt‑in via environment flags. See [USAGE.md](./USAGE.md) for the complete flag matrix and safety notes.

## 🎯 Unified Demo Script

The legacy example files have been consolidated into `examples/index.ts`.  
It executes a curated workflow in the following order:

1. Wallet setup & authentication (prints the derived wallet address and target network)
2. Optional on-chain funding (deposit / withdraw) driven by `DEPOSIT_AMOUNT` and `WITHDRAW_AMOUNT`
3. Account, position, and open-order snapshots for the primary `DEMO_SYMBOL`
4. Market and limit order placement with optional post-placement cancellation
5. Market data inspection (order book snapshot + ticker snapshot with spread calculations)
6. Leverage & margin utilities, including preferred leverage adjustments and isolated margin add/remove flows
7. TP/SL lifecycle management (create, list, edit, and cancel position-level TP/SL plans)

All on-chain or order-creating steps are opt-in. Enable only the pieces you wish to test:

| Flag | Purpose | Default |
| --- | --- | --- |
| `RUN_DEPOSIT` / `RUN_WITHDRAW` | Move funds between wallet & exchange | `0` |
| `RUN_MARKET_ORDER` | Submit a market order | `0` |
| `RUN_LIMIT_ORDER` | Submit a limit order (configure `LIMIT_ORDER_PRICE`) | `0` |
| `RUN_CANCEL_ORDER` | Cancel the first open order | `0` |
| `RUN_MARKET_DATA` | Print order book + ticker snapshots | `1` |
| `RUN_ADJUST_LEVERAGE` | Update preferred leverage (off-chain) | `0` |
| `RUN_MARGIN_ADD` / `RUN_MARGIN_REMOVE` | Add/remove isolated margin (on-chain) | `0` |
| `RUN_TPSL_DEMO` | Create TP/SL orders for a position | `0` |
| `RUN_TPSL_EDIT` | Edit existing TP/SL plans (needs plan IDs) | `0` |

Additional tuning variables such as `DEPOSIT_AMOUNT`, `MARKET_ORDER_QTY`, `LIMIT_ORDER_SIDE`, `MARGIN_SYMBOL`, `TPSL_SYMBOL`, etc. mirror the names from the previous standalone scripts to remain backwards compatible.

> Need a quick way to only inspect or update preferred leverage? Run `npm run example:leverage` (see `USAGE.md` for flags such as `SET_LEVERAGE`, `LEVERAGE_TARGET`, `LEVERAGE_SYMBOL`).

### Script Flow Details

Each major block inside `examples/index.ts` is wrapped in a helper such as `maybeDeposit`, `maybePlaceMarketOrder`, or `maybeRunTpSlFlow`.  
Those helpers gate their logic behind the environment switches above, print labeled sections (via `logSection`), and provide success/error emojis so you can visually trace the execution in your terminal logs. The script also:

- Fetches trading pairs and resolves the `perpId` automatically for the configured symbol (falls back to `sdk.getPerpetualID`).
- Shows wallet/account diagnostics before any trading action so you can confirm balances and exposure.
- Prints the top-of-book bids/asks plus percentage spread by using BigNumber math, making it easier to compare against the web UI.
- Surfaces TP/SL plan IDs and hashes so that subsequent edits or cancellations can reuse real identifiers without manual API calls.

### Environment Parameters

Beyond the boolean toggles, the demo reads the following configuration values (all optional, shown with defaults from the script):

| Variable | Purpose | Default |
| --- | --- | --- |
| `NETWORK` | `mainnet` or `testnet` selection passed to `initDipCoinPerpSDK`. | `testnet` |
| `DEMO_SYMBOL` | Primary symbol inspected by the snapshots and trading actions. | `BTC-PERP` |
| `PRIVATE_KEY` | Private key for signing transactions (required). | _none_ |
| `DEPOSIT_AMOUNT` / `WITHDRAW_AMOUNT` | USDC amounts for bank transfers. | `10` / `5` |
| `MARKET_ORDER_QTY`, `MARKET_ORDER_LEVERAGE`, `MARKET_ORDER_SIDE` | Market order size, leverage, and side (`BUY`/`SELL`). | `0.01`, `20`, `BUY` |
| `LIMIT_ORDER_QTY`, `LIMIT_ORDER_PRICE`, `LIMIT_ORDER_LEVERAGE`, `LIMIT_ORDER_SIDE` | Limit order parameters. | `0.01`, `85000`, `20`, `BUY` |
| `MARGIN_SYMBOL`, `MARGIN_ADD_AMOUNT`, `MARGIN_REMOVE_AMOUNT` | Target symbol and USDC sizes for margin utilities. | `DEMO_SYMBOL`, `10`, `5` |
| `MARGIN_TARGET_LEVERAGE`, `MARGIN_TYPE` | Preferred leverage update payload. | `20`, `ISOLATED` |
| `TPSL_SYMBOL`, `POSITION_ID` | Symbol/position used when fetching TP/SL plans (falls back to detected positions). | `DEMO_SYMBOL`, _auto-detected_ |
| `TPSL_EDIT_TP_PLAN_ID`, `TPSL_EDIT_SL_PLAN_ID`, `TPSL_CANCEL_HASH` | Explicit plan IDs/hashes for TP/SL edit and cancel flows. | _auto-resolved when possible_ |

Example: run just the limit-order workflow against ETH with a tighter size.

```bash
DEMO_SYMBOL=ETH-PERP RUN_LIMIT_ORDER=1 LIMIT_ORDER_QTY=0.05 LIMIT_ORDER_PRICE=3800 npm run example
```

Because the script exits on authentication failure or missing `PRIVATE_KEY`, you can safely iterate by tweaking `.env` without risking partial executions. When testing on-chain actions, double-check gas budgets and balances before enabling their flags.

### Leverage Utility Recipes

The demo exposes two leverage helpers:

- `showPreferredLeverage` → calls `sdk.getUserConfig(symbol)` to fetch the current leverage, margin type, and raw on-chain value.
- `maybeAdjustPreferredLeverage` → conditionally invokes `sdk.adjustLeverage(...)` when `RUN_ADJUST_LEVERAGE=1` (or `RUN_SET_LEVERAGE=1`) and prints the post-update config.

Run the leverage inspection on its own:

```bash
RUN_MARKET_DATA=0 RUN_ADJUST_LEVERAGE=0 npm run example
```

Update the preferred leverage for ETH perpetuals to 12x isolated:

```bash
MARGIN_SYMBOL=ETH-PERP RUN_ADJUST_LEVERAGE=1 MARGIN_TARGET_LEVERAGE=12 MARGIN_TYPE=ISOLATED npm run example
```

Behind the scenes the SDK sequence is:

```typescript
const current = await sdk.getUserConfig("ETH-PERP");
console.log("Current leverage:", current.data?.leverage);
await sdk.adjustLeverage({ symbol: "ETH-PERP", leverage: "12", marginType: "ISOLATED" });
```

### TP/SL Utility Recipes

`maybeRunTpSlFlow` orchestrates the entire lifecycle:

1. Detect or fetch `POSITION_ID` for the configured `TPSL_SYMBOL`.
2. Place TP/SL plans when `RUN_TPSL_DEMO=1` via `sdk.placePositionTpSlOrders`.
3. Read back the plan list with `sdk.getPositionTpSl(positionId, "position")`.
4. Edit existing plans when `RUN_TPSL_EDIT=1` and `TPSL_EDIT_TP_PLAN_ID` / `TPSL_EDIT_SL_PLAN_ID` are provided (or auto-detected).
5. Cancel a specific plan by hash with `sdk.cancelTpSlOrders`.

Minimal command to list current TP/SL plans for BTC and stop after the fetch:

```bash
RUN_TPSL_DEMO=0 RUN_TPSL_EDIT=0 TPSL_SYMBOL=BTC-PERP POSITION_ID=<position-id> npm run example
```

Demo new TP/SL orders on ETH using the auto-detected position and Perpetual ID:

```bash
TPSL_SYMBOL=ETH-PERP RUN_TPSL_DEMO=1 npm run example
```

Edit an existing TP plan and cancel another by hash:

```bash
RUN_TPSL_EDIT=1 TPSL_EDIT_TP_PLAN_ID=<plan-id> TPSL_CANCEL_HASH=<plan-hash> npm run example
```

These flows map directly to the SDK calls shown in the [Manage Existing Position TP/SL Orders](#manage-existing-position-tpsl-orders) section if you prefer to script them manually.

## 📖 Usage Guide

### Initialize SDK

```typescript
import { initDipCoinPerpSDK } from "@dipcoinlab/perp-client-ts";

// Initialize with private key string
const sdk = initDipCoinPerpSDK("your-private-key-string", {
  network: "mainnet", // or "testnet"
  apiBaseUrl: "https://api.dipcoin.io", // Optional, defaults based on network
});

// Or initialize with Keypair
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
const keypair = Ed25519Keypair.fromSecretKey(/* your secret key */);
const sdk = initDipCoinPerpSDK(keypair, {
  network: "mainnet",
});
```

## Core Features

### Authentication (Onboarding)

Before using the SDK, you need to authenticate first. The SDK will automatically handle authentication when you call any API method, but you can also authenticate manually:

```typescript
// Manual authentication
const authResult = await sdk.authenticate();
if (authResult.status) {
  console.log("Authenticated! JWT Token:", authResult.data);
} else {
  console.error("Authentication failed:", authResult.error);
}

// Get JWT token (authenticates if needed)
const tokenResult = await sdk.getJWTToken();
if (tokenResult.status) {
  console.log("JWT Token:", tokenResult.data);
}

// Force refresh token
const refreshResult = await sdk.getJWTToken(true);

// Clear authentication (logout)
sdk.clearAuth();
```

**Note:** All API methods automatically authenticate if needed, so you don't need to call `authenticate()` manually in most cases.

### Account Information

Get account balance and trading information:

```typescript
const accountInfo = await sdk.getAccountInfo();

if (accountInfo.status && accountInfo.data) {
  console.log("Wallet Balance:", accountInfo.data.walletBalance);
  console.log("Account Value:", accountInfo.data.accountValue);
  console.log("Free Collateral:", accountInfo.data.freeCollateral);
  console.log("Unrealized PnL:", accountInfo.data.totalUnrealizedProfit);
}
```

### Deposit and Withdraw

Deposit USDC to the exchange bank account for trading collateral, or withdraw USDC back to your wallet:

```typescript
// Deposit USDC to bank (deposit funds for trading)
const depositResult = await sdk.depositToBank(100); // Deposit 100 USDC
if (depositResult) {
  console.log("Deposit successful!");
}

// Withdraw USDC from bank (withdraw funds to wallet)
const withdrawResult = await sdk.withdrawFromBank(50); // Withdraw 50 USDC
if (withdrawResult) {
  console.log("Withdraw successful!");
}
```

**Note:** These methods execute on-chain transactions on Sui blockchain. Make sure you have sufficient USDC balance in your wallet before depositing, and sufficient balance in your exchange account before withdrawing.

### Adjust Preferred Leverage

Match the web client's leverage settings through the same REST API:

```typescript
await sdk.adjustLeverage({
  symbol: "BTC-PERP",
  leverage: "5", // 5x leverage
  marginType: "ISOLATED", // optional, defaults to ISOLATED
});
```

### Add or Remove Position Margin (On-chain)

Interact with the on-chain contracts to add or remove isolated margin. These actions spend gas and require sufficient balances.

```typescript
// Add 2 USDC margin to BTC-PERP
await sdk.addMargin({
  amount: 2,
  symbol: "BTC-PERP",
});

// Remove 1 USDC margin from BTC-PERP
await sdk.removeMargin({
  amount: 1,
  symbol: "BTC-PERP",
});
```

> ⚠️ Margin operations are on-chain transactions. Double-check the amount and symbol before running them.

### Place Order

Place a market or limit order:

```typescript
import { OrderSide, OrderType } from "@dipcoinlab/perp-client-ts";

// Market order
const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.1", // 0.1 BTC
  leverage: "10", // 10x leverage
});

// Limit order
const limitResult = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  quantity: "0.1",
  price: "50000", // Limit price
  leverage: "10",
  reduceOnly: false, // Optional: only reduce position
});

if (result.status) {
  console.log("Order placed successfully:", result.data);
} else {
  console.error("Order failed:", result.error);
}
```

### Place Order with TP/SL

Place an order with take profit and stop loss:

```typescript
const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.1",
  leverage: "10",
  // Take profit
  tpTriggerPrice: "55000",
  tpOrderType: OrderType.MARKET,
  // Stop loss
  slTriggerPrice: "45000",
  slOrderType: OrderType.MARKET,
});
```

### Manage Existing Position TP/SL Orders

```typescript
await sdk.placePositionTpSlOrders({
  symbol: "BTC-PERP",
  market: "<perpetual-id>",
  side: OrderSide.SELL,
  isLong: false,
  leverage: "10",
  quantity: "0.05",
  tp: {
    triggerPrice: "90000",
    orderType: OrderType.LIMIT,
    orderPrice: "90000",
    tpslType: "position",
  },
  sl: {
    triggerPrice: "70000",
    orderType: OrderType.MARKET,
    tpslType: "position",
  },
});

const tpSlOrders = await sdk.getPositionTpSl("<position-id>", "position");

await sdk.cancelTpSlOrders({
  symbol: "BTC-PERP",
  orderHashes: ["0xabc..."],
});
```

### Market Data (Ticker & Order Book)

```typescript
const ticker = await sdk.getTicker("BTC-PERP");
const orderBook = await sdk.getOrderBook("BTC-PERP");
```

### Cancel Order

Cancel one or more orders:

```typescript
const result = await sdk.cancelOrder({
  symbol: "BTC-PERP",
  orderHashes: ["0x1234...", "0x5678..."], // Array of order hashes
});

if (result.status) {
  console.log("Orders cancelled successfully");
} else {
  console.error("Cancel failed:", result.error);
}
```

### Get Positions

Get current positions:

```typescript
// Get all positions
const positions = await sdk.getPositions();

// Get positions for specific symbol
const btcPositions = await sdk.getPositions("BTC-PERP");

if (positions.status && positions.data) {
  positions.data.forEach((position) => {
    console.log("Symbol:", position.symbol);
    console.log("Side:", position.side);
    console.log("Quantity:", position.quantity);
    console.log("Entry Price:", position.avgEntryPrice);
    console.log("Unrealized PnL:", position.unrealizedProfit);
    console.log("Liquidation Price:", position.liquidationPrice);
  });
}
```

### Get Open Orders

Get current open orders:

```typescript
// Get all open orders
const orders = await sdk.getOpenOrders();

// Get open orders for specific symbol
const btcOrders = await sdk.getOpenOrders("BTC-PERP");

if (orders.status && orders.data) {
  orders.data.forEach((order) => {
    console.log("Symbol:", order.symbol);
    console.log("Side:", order.side);
    console.log("Type:", order.orderType);
    console.log("Price:", order.price);
    console.log("Quantity:", order.quantity);
    console.log("Filled:", order.filledQty);
  });
}
```

## API Reference

### DipCoinPerpSDK

Main SDK class for interacting with DipCoin Perpetual Trading.

#### Methods

##### `placeOrder(params: PlaceOrderParams): Promise<SDKResponse<OrderResponse>>`

Place a new order.

**Parameters:**
- `symbol`: Trading symbol (e.g., "BTC-PERP")
- `side`: Order side (`OrderSide.BUY` or `OrderSide.SELL`)
- `orderType`: Order type (`OrderType.MARKET` or `OrderType.LIMIT`)
- `quantity`: Order quantity (number or string)
- `price`: Order price (required for LIMIT orders)
- `leverage`: Leverage multiplier (number or string)
- `market`: Optional market ID
- `reduceOnly`: Optional, only reduce position
- `clientId`: Optional client order ID
- `tpTriggerPrice`: Optional take profit trigger price
- `tpOrderType`: Optional take profit order type
- `tpOrderPrice`: Optional take profit order price
- `slTriggerPrice`: Optional stop loss trigger price
- `slOrderType`: Optional stop loss order type
- `slOrderPrice`: Optional stop loss order price

##### `cancelOrder(params: CancelOrderParams): Promise<SDKResponse<OrderResponse>>`

Cancel one or more orders.

**Parameters:**
- `symbol`: Trading symbol
- `orderHashes`: Array of order hashes to cancel
- `parentAddress`: Optional parent address (defaults to wallet address)

##### `getAccountInfo(): Promise<SDKResponse<AccountInfo>>`

Get account information including balance, collateral, and PnL.

##### `getPositions(symbol?: string): Promise<SDKResponse<Position[]>>`

Get current positions. Optionally filter by symbol.

##### `getOpenOrders(symbol?: string): Promise<SDKResponse<OpenOrder[]>>`

Get current open orders. Optionally filter by symbol.

##### `depositToBank(amount: number): Promise<any>`

Deposit USDC from wallet to exchange bank account for trading collateral.

**Parameters:**
- `amount`: Deposit amount in USDC (standard units, e.g., 100 means 100 USDC)

**Returns:** On-chain transaction result

**Note:** This is an on-chain transaction on Sui blockchain. Ensure you have sufficient USDC balance in your wallet.

##### `withdrawFromBank(amount: number): Promise<any>`

Withdraw USDC from exchange bank account back to wallet.

**Parameters:**
- `amount`: Withdraw amount in USDC (standard units, e.g., 50 means 50 USDC)

**Returns:** On-chain transaction result

**Note:** This is an on-chain transaction on Sui blockchain. Ensure you have sufficient balance in your exchange account.

## Types

### OrderSide

```typescript
enum OrderSide {
  BUY = "BUY",
  SELL = "SELL",
}
```

### OrderType

```typescript
enum OrderType {
  MARKET = "MARKET",
  LIMIT = "LIMIT",
}
```

### AccountInfo

```typescript
interface AccountInfo {
  walletBalance: string;
  totalUnrealizedProfit: string;
  accountValue: string;
  freeCollateral: string;
  totalMargin: string;
}
```

### Position

```typescript
interface Position {
  symbol: string;
  side: string;
  quantity: string;
  avgEntryPrice: string;
  leverage: string;
  margin: string;
  unrealizedProfit: string;
  liquidationPrice: string;
  // ... more fields
}
```

### OpenOrder

```typescript
interface OpenOrder {
  hash: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  quantity: string;
  filledQty: string;
  leverage: string;
  status: string;
  // ... more fields
}
```

## Error Handling

All SDK methods return a `SDKResponse` object with the following structure:

```typescript
interface SDKResponse<T> {
  status: boolean; // Operation success status
  data?: T; // Response data if successful
  error?: string; // Error message if failed
}
```

Always check the `status` field before accessing `data`:

```typescript
const result = await sdk.placeOrder(/* ... */);

if (result.status) {
  // Success - use result.data
  console.log(result.data);
} else {
  // Error - use result.error
  console.error(result.error);
}
```

## Examples

### Complete Trading Flow

```typescript
import { initDipCoinPerpSDK, OrderSide, OrderType } from "@dipcoinlab/perp-client-ts";

// Initialize SDK
const sdk = initDipCoinPerpSDK("your-private-key", {
  network: "testnet",
});

async function tradingFlow() {
  // 1. Deposit funds to exchange bank account
  console.log("Depositing 100 USDC to bank...");
  await sdk.depositToBank(100);

  // 2. Check account balance
  const account = await sdk.getAccountInfo();
  if (account.status) {
    console.log("Account Value:", account.data?.accountValue);
  }

  // 3. Check existing positions
  const positions = await sdk.getPositions();
  if (positions.status) {
    console.log("Current Positions:", positions.data);
  }

  // 4. Place a market order
  const orderResult = await sdk.placeOrder({
    symbol: "BTC-PERP",
    side: OrderSide.BUY,
    orderType: OrderType.MARKET,
    quantity: "0.1",
    leverage: "10",
  });

  if (orderResult.status) {
    console.log("Order placed:", orderResult.data);
  }

  // 5. Adjust preferred leverage for BTC perpetuals
  const leverageUpdate = await sdk.adjustLeverage({
    symbol: "BTC-PERP",
    leverage: "12",
    marginType: "ISOLATED",
  });

  if (leverageUpdate.status) {
    console.log("Leverage updated:", leverageUpdate.data);
  } else {
    console.warn("Leverage update failed:", leverageUpdate.error);
  }

  // 6. Create and manage TP/SL plans for the active BTC position
  const tpSlResult = await sdk.placePositionTpSlOrders({
    symbol: "BTC-PERP",
    side: OrderSide.SELL,
    isLong: true,
    leverage: "10",
    quantity: "0.1",
    tp: {
      triggerPrice: "55000",
      orderType: OrderType.LIMIT,
      orderPrice: "55000",
      tpslType: "position",
    },
    sl: {
      triggerPrice: "45000",
      orderType: OrderType.MARKET,
      tpslType: "position",
    },
  });

  if (tpSlResult.status) {
    console.log("TP/SL plans placed:", tpSlResult.data);
    const positionId = tpSlResult.data?.positionId ?? "<position-id>";
    const plans = await sdk.getPositionTpSl(positionId, "position");

    if (plans.status) {
      console.log("Current TP/SL plans:", plans.data);

      if (plans.data && plans.data.length > 0) {
        const cancelTpSl = await sdk.cancelTpSlOrders({
          symbol: "BTC-PERP",
          orderHashes: [plans.data[0].hash],
        });
        console.log("Cancelled TP/SL plan:", cancelTpSl);
      }
    }
  } else {
    console.warn("TP/SL placement failed:", tpSlResult.error);
  }

  // 7. Check open orders
  const openOrders = await sdk.getOpenOrders("BTC-PERP");
  if (openOrders.status) {
    console.log("Open Orders:", openOrders.data);
  }

  // 8. Cancel an order (if needed)
  if (openOrders.status && openOrders.data && openOrders.data.length > 0) {
    const cancelResult = await sdk.cancelOrder({
      symbol: "BTC-PERP",
      orderHashes: [openOrders.data[0].hash],
    });
    console.log("Cancel result:", cancelResult);
  }

  // 9. Withdraw funds from exchange bank account
  console.log("Withdrawing 50 USDC from bank...");
  await sdk.withdrawFromBank(50);

  
}

tradingFlow();
```

### Example Scripts

- `npm run example` – Runs `examples/index.ts`. Enable extra steps with env flags such as `RUN_LIMIT_ORDER=1`, `RUN_MARGIN_ADD=1`, `RUN_TPSL_DEMO=1`, etc.

## Extended API Surface

In addition to the core trading flow above, the SDK exposes a comprehensive set of REST and on-chain helpers that mirror the full functionality of the reference frontend (`ts-frontend`).

### Public Market Data

```typescript
const config = await sdk.getGlobalConfig();          // global trading config
const vols = await sdk.getVolumes();                  // 24h / 7d notional volume
const ticker = await sdk.getTicker("BTC-PERP");
const book = await sdk.getOrderBook("BTC-PERP");
const fr = await sdk.getFundingRateDetail("BTC-PERP");
const frChart = await sdk.getFundingRateChart("BTC-PERP");
const frHistory = await sdk.getFundingRateHistory({ pageNum: 1, pageSize: 50 });
const bars = await sdk.getKlineHistory({ symbol: "BTC-PERP", interval: "5m" });
const announcements = await sdk.getAnnouncements();
const notices = await sdk.getNotice();
const signedFeed = await sdk.getLatestSignedPriceFeed(); // SignedPriceFeedData passthrough
```

### Trading History (paginated)

```typescript
const orders   = await sdk.getHistoryOrders({ pageNum: 1, pageSize: 20, symbol: "BTC-PERP" });
const funding  = await sdk.getFundingSettlements({ pageNum: 1, pageSize: 20 });
const balance  = await sdk.getBalanceChanges({ pageNum: 1, pageSize: 20 });
```

Each response is shaped as `{ items, total, pageNum, pageSize, totalPages }`.

### Plan / TP-SL Cancellation

```typescript
await sdk.cancelPlanOrder({ planId: 12345 });            // cancel by id
await sdk.cancelPlanOrder({ hash: "0xabc...", symbol: "BTC-PERP" });
```

### One-Click Trading (1CT) Sub-Account Management

End-to-end helper that generates a fresh sub-account keypair, registers it with the backend, and authorizes it on chain in a single call:

```typescript
const enable = await sdk.enableOneClickTrading();
// enable.data => { address, jwt, privateKey, txResponse }

// After this call, sdk.placeOrder() / cancelOrder() / cancelPlanOrder()
// automatically route through the sub-account JWT and signing keypair.

// Disable when done
await sdk.disableOneClickTrading();
```

You can also wire up an existing sub-account manually:

```typescript
sdk.setOneClickTradingCredentials({
  address: subAddress,
  jwt: subJwt,
  privateKey: subPrivateKey, // optional — required only for sub-account-side signing
});

// Vault-scoped 1CT (delegates to a vault's sub-trader instead of the main wallet):
await sdk.enableOneClickTrading({ parentAddress: vaultId });
```

Lower-level building blocks are also exposed:

```typescript
await sdk.listApiAccounts();
await sdk.createApiAccount({ address, signature });
await sdk.removeApiAccount(address);
await sdk.getExpired1CTAccounts();          // for the main account
await sdk.getExpired1CTAccounts(vaultId);   // for a vault sub-trader
await sdk.setSubAccount({ account, status: true });
```

### Sponsor (gas-free) Service

```typescript
const valid = await sdk.sponsorValid();
const sponsorTx = await sdk.sponsorCreate({ /* tx payload */ });
const submitted = await sdk.sponsorSubmit({ /* signed payload */ });
```

### Vault REST APIs

```typescript
await sdk.getVaultOverview();
await sdk.getVaultConfig();
await sdk.getVaultList();
await sdk.getVaultDetail(vaultId);
await sdk.getVaultPerformance(vaultId);
await sdk.getVaultValueChart(vaultId);
await sdk.getVaultPNLChart(vaultId);
await sdk.getVaultAccount(vaultId);
await sdk.getVaultPositions(vaultId);
await sdk.getVaultPendingOrders(vaultId);
await sdk.getVaultFilledOrders(vaultId);
await sdk.getVaultFundingHistory(vaultId);
await sdk.getVaultDepositsAndWithdraws(vaultId);
await sdk.getVaultDepositors(vaultId);
await sdk.checkVaultWhitelist();

// Authenticated:
await sdk.getVaultMyHoldings();
await sdk.getVaultMyPerformance(vaultId);
await sdk.getVaultMyPnlChart(vaultId);
await sdk.getVaultTransactions();
await sdk.updateVaultDescription({ vaultId, description: "Strategy: long BTC trend" });
```

### Vault On-Chain Operations

These operations require an up-to-date `SignedPriceFeedData`. The SDK fetches it automatically when not supplied:

```typescript
await sdk.depositToVault({ vaultId, amount: 100 });          // deposit 100 USDC
await sdk.requestWithdrawFromVault({ vaultId, shares: 50 }); // request redemption
await sdk.claimClosedVaultFunds({ vaultId });                // claim from closed vault
await sdk.closeVault({ vaultId });                           // creator only
```

### On-Chain Helpers

```typescript
const balances = await sdk.getChainBalances();         // { sui, usdc, bank }
const oracle   = await sdk.getOraclePrice("BTC-PERP");
const pos      = await sdk.getOnChainPosition("BTC-PERP");
await sdk.closeOnChainPosition({ symbol: "BTC-PERP" });    // close full pos with MARKET reduceOnly
await sdk.withdrawAllMarginFromBank();
await sdk.setSubAccount({ account: subAddr, status: true });
const perpId = sdk.getDeploymentPerpetualID("BTC-PERP");   // resolve from local config
```

For advanced use cases the underlying primitives are exposed:

```typescript
sdk.onChain;       // ExchangeOnChain instance
sdk.sui;           // SuiClient
sdk.txBuilder;     // TransactionBuilder
```

### Point / Referral

```typescript
await sdk.getReferralLink();
await sdk.changeReferralCode("DIP123");
await sdk.getInviteeList({ pageNum: 1, pageSize: 20 });
await sdk.getSeasonInfo();
await sdk.getTeamBoost();
await sdk.getUserPoints();
await sdk.getUserDailyPoints();
await sdk.getSeasonPoints();
await sdk.getReferralPoints();
await sdk.getTeamInfo();

// Commission program:
await sdk.getReferralProfile();
await sdk.getReferralDashboard();
await sdk.getReferralApplication();
await sdk.postReferralApplication({ name, telegram });
await sdk.getReferralHistory({ pageNum: 1 });
await sdk.getReferralCommission({ pageNum: 1 });
await sdk.postReferralClaim();
await sdk.getReferralClaimHistory({ pageNum: 1 });
```

### WebSocket

The SDK ships a lightweight WebSocket client that auto-replays subscriptions on reconnect and supports both browser and Node.js (>=22 — install the `ws` package on older Node):

```typescript
const ws = sdk.createWsClient({ url: "wss://ws.dipcoin.io/v1" });
ws.onMessage((msg) => console.log("ws:", msg));
await ws.connect();
ws.subscribe({ channel: "ticker", symbol: "BTC-PERP" });
ws.subscribe({ channel: "orderBook", symbol: "BTC-PERP" });
ws.subscribe({ channel: "kline", symbol: "BTC-PERP", interval: "1m" });
// Private channels are auto-authenticated using the SDK's JWT + wallet address.
ws.subscribe({ channel: "account" });
ws.subscribe({ channel: "position" });
```

### Sub-Account Aware Reads

`getAccountInfo` / `getPositions` / `getOpenOrders` accept an optional `parentAddress` parameter so you can read a vault or sub-account's state without instantiating a separate SDK:

```typescript
await sdk.getAccountInfo(vaultId);
await sdk.getPositions("BTC-PERP", vaultId);
await sdk.getOpenOrders(undefined, vaultId);
```

## Method Index

| Category              | Methods                                                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth / 1CT            | `authenticate`, `getJWTToken`, `clearAuth`, `setOneClickTradingCredentials`, `getOneClickTradingCredentials`, `enableOneClickTrading`, `disableOneClickTrading`                                                                                                                                     |
| Trading               | `placeOrder`, `cancelOrder`, `cancelPlanOrder`, `placePositionTpSlOrders`, `getPositionTpSl`, `cancelTpSlOrders`, `adjustLeverage`, `getUserConfig`                                                                                                                                                 |
| Account / orders      | `getAccountInfo`, `getPositions`, `getOpenOrders`, `getHistoryOrders`, `getFundingSettlements`, `getBalanceChanges`                                                                                                                                                                                |
| Market                | `getTradingPairs`, `getPerpetualID`, `getOrderBook`, `getTicker`, `getGlobalConfig`, `getVolumes`, `getFundingRateDetail`, `getFundingRateChart`, `getFundingRateHistory`, `getKlineHistory`, `getAnnouncements`, `getNotice`, `getLatestSignedPriceFeed`                                           |
| API accounts          | `listApiAccounts`, `createApiAccount`, `removeApiAccount`, `getExpired1CTAccounts`                                                                                                                                                                                                                 |
| Sponsor               | `sponsorValid`, `sponsorCreate`, `sponsorSubmit`                                                                                                                                                                                                                                                   |
| Vault REST (public)   | `getVaultOverview`, `getVaultConfig`, `getVaultList`, `getVaultDetail`, `getVaultPerformance`, `getVaultValueChart`, `getVaultPNLChart`, `getVaultAccount`, `getVaultPositions`, `getVaultPendingOrders`, `getVaultFilledOrders`, `getVaultFundingHistory`, `getVaultDepositsAndWithdraws`, `getVaultDepositors`, `checkVaultWhitelist` |
| Vault REST (auth)     | `getVaultMyHoldings`, `getVaultMyPerformance`, `getVaultMyPnlChart`, `getVaultTransactions`, `updateVaultDescription`                                                                                                                                                                              |
| Vault on-chain        | `depositToVault`, `requestWithdrawFromVault`, `claimClosedVaultFunds`, `closeVault`                                                                                                                                                                                                                |
| On-chain helpers      | `depositToBank`, `withdrawFromBank`, `withdrawAllMarginFromBank`, `addMargin`, `removeMargin`, `getChainBalances`, `getOraclePrice`, `getOnChainPosition`, `closeOnChainPosition`, `setSubAccount`, `getDeploymentPerpetualID`, `onChain`, `sui`, `txBuilder`                                       |
| Points / referral     | `getReferralLink`, `changeReferralCode`, `getInviteeList`, `getSeasonInfo`, `getTeamBoost`, `joinTeam`, `checkTeamNickname`, `getUserPoints`, `getUserDailyPoints`, `getSeasonPoints`, `getReferralPoints`, `getTeamInfo`, `getReferralProfile`, `getReferralDashboard`, `getReferralApplication`, `postReferralApplication`, `getReferralHistory`, `getReferralCommission`, `postReferralClaim`, `getReferralClaimHistory` |
| WebSocket             | `createWsClient` (constructs a pre-authed `WsClient`)                                                                                                                                                                                                                                              |

## License

Apache License 2.0
