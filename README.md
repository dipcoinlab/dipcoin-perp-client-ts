# DipCoin Perpetual Trading SDK

TypeScript SDK for DipCoin Perpetual Trading on Sui blockchain.

## 📦 Installation

```bash
npm install @dipcoinlab/perp-sui-sdk
# or
yarn add @dipcoinlab/perp-sui-sdk
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
```

For detailed usage instructions, see [USAGE.md](./USAGE.md).

## 📖 Usage Guide

### Initialize SDK

```typescript
import { initDipCoinPerpSDK } from "@dipcoinlab/perp-sui-sdk";

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

### Place Order

Place a market or limit order:

```typescript
import { OrderSide, OrderType } from "@dipcoinlab/perp-sui-sdk";

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
import { initDipCoinPerpSDK, OrderSide, OrderType } from "@dipcoinlab/perp-sui-sdk";

// Initialize SDK
const sdk = initDipCoinPerpSDK("your-private-key", {
  network: "testnet",
});

async function tradingFlow() {
  // 1. Check account balance
  const account = await sdk.getAccountInfo();
  if (account.status) {
    console.log("Account Value:", account.data?.accountValue);
  }

  // 2. Check existing positions
  const positions = await sdk.getPositions();
  if (positions.status) {
    console.log("Current Positions:", positions.data);
  }

  // 3. Place a market order
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

  // 4. Check open orders
  const openOrders = await sdk.getOpenOrders("BTC-PERP");
  if (openOrders.status) {
    console.log("Open Orders:", openOrders.data);
  }

  // 5. Cancel an order (if needed)
  if (openOrders.status && openOrders.data && openOrders.data.length > 0) {
    const cancelResult = await sdk.cancelOrder({
      symbol: "BTC-PERP",
      orderHashes: [openOrders.data[0].hash],
    });
    console.log("Cancel result:", cancelResult);
  }
}

tradingFlow();
```

## License

Apache License 2.0
