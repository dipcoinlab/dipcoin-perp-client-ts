# DipCoin Perpetual Trading SDK - Usage Guide

This document provides detailed instructions on how to use and run the SDK locally.

## 📋 Table of Contents

1. [Environment Setup](#environment-setup)
2. [Install Dependencies](#install-dependencies)
3. [Configure Environment Variables](#configure-environment-variables)
4. [Run Examples](#run-examples)
5. [Verify Functionality](#verify-functionality)
6. [Common Issues](#common-issues)

## 🔧 Environment Setup

### System Requirements

- Node.js >= 16.0.0
- npm >= 7.0.0 or yarn >= 1.22.0
- TypeScript >= 5.0.0

### Check Environment

```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Check TypeScript (if installed globally)
tsc --version
```

## 📦 Install Dependencies

### 1. Clone or Navigate to Project Directory

```bash
cd dipcoin-perp-client-ts
```

### 2. Install Project Dependencies

```bash
# Using npm
npm install

# Or using yarn
yarn install
```

### 3. Build Project (Optional, for development)

```bash
# Build TypeScript code
npm run build

# Or
yarn build
```

## 🔐 Configure Environment Variables

### 1. Create Environment Variable File

Create a `.env` file in the project root directory (if it doesn't exist):

```bash
# In project root directory
touch .env
```

### 2. Configure Private Key

Edit the `.env` file and add your private key:

```bash
# .env file content
PRIVATE_KEY=your-private-key-here
```

**⚠️ Important Notes:**
- Private key format: Sui private key string (e.g., `suiprivkey1...`)
- **Never** commit the `.env` file to Git
- Use testnet private keys for testing, avoid using mainnet private keys

### 3. Private Key Format

Sui private keys support the following formats:

1. **Standard Format** (Recommended):
   ```
   suiprivkey1qzy3x9q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8q7wq8
   ```

2. **Base64 Format** (Legacy):
   ```json
   {
     "schema": "ED25519",
     "privateKey": "base64-encoded-key"
   }
   ```

### 5. Optional Environment Variables for TP/SL Examples

The `examples/tpsl-example.ts` script accepts the following optional variables:

| Variable               | Description                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `RUN_TPSL_DEMO`        | Set to `1` to actually place TP/SL orders (default: orders are not created)   |
| `RUN_TPSL_EDIT`        | Set to `1` to edit existing TP/SL orders when plan IDs are provided           |
| `TPSL_SYMBOL`          | Override trading pair symbol (default: `BTC-PERP`)                             |
| `POSITION_ID`          | Position ID used when fetching TP/SL orders                                    |
| `TPSL_CANCEL_HASH`     | Existing TP/SL order hash to cancel                                            |
| `TPSL_EDIT_TP_PLAN_ID` | Plan ID of an existing take-profit order to edit (used with `RUN_TPSL_EDIT`)   |
| `TPSL_EDIT_SL_PLAN_ID` | Plan ID of an existing stop-loss order to edit (used with `RUN_TPSL_EDIT`)     |

These variables let you test TP/SL flows safely without accidentally creating
orders until you explicitly opt in.

### 4. Get Test Private Key

If you don't have a test private key, you can obtain one through the following methods:

1. **Using Sui CLI**:
   ```bash
   sui client new-address ed25519
   ```

2. **Using Sui Wallet**:
   - Install Sui Wallet browser extension
   - Create a new wallet
   - Export private key

## 🚀 Run Examples

### Method 1: Using npm script (Recommended)

```bash
# Run example file
npm run example

# Or using yarn
yarn example

# Other available scripts
npm run example:limit      # Limit order demo
npm run example:orderbook  # Order book snapshot
npm run example:tpsl       # Position TP/SL demo (requires RUN_TPSL_DEMO=1)
```

This command will:
1. Automatically read `PRIVATE_KEY` from `.env` file
2. Use `ts-node` to directly run TypeScript files
3. Connect to testnet

### Method 2: Directly Using ts-node

```bash
# Set environment variable and run
PRIVATE_KEY=your-private-key ts-node --project tsconfig.example.json examples/basic-usage.ts

# Or using dotenv (requires dotenv-cli)
npx dotenv -e .env -- ts-node --project tsconfig.example.json examples/basic-usage.ts
```

### Method 3: Using Node.js to Run Compiled Code

```bash
# 1. Build project
npm run build

# 2. Run compiled code
PRIVATE_KEY=your-private-key node dist/examples/basic-usage.js
```

## ✅ Verify Functionality

### 0. Verify Authentication

The example file will first perform authentication:

```typescript
// Authentication (Onboarding)
const authResult = await sdk.authenticate();
// Expected output:
// - ✅ Authentication successful!
// - JWT Token: ...
```

**Verification Points:**
- ✅ Successfully complete authentication
- ✅ Return JWT Token
- ✅ Token format is correct

**If authentication fails:**
- Check if private key is correct
- Check network connection
- Check API address configuration

### 1. Verify Account Information Query

The example file will execute the following operations in sequence:

```typescript
// 1. Get account information
const accountInfo = await sdk.getAccountInfo();
// Expected output:
// - Wallet Address: 0x...
// - Wallet Balance: ...
// - Account Value: ...
// - Free Collateral: ...
```

**Verification Points:**
- ✅ Successfully get account information
- ✅ Returned data format is correct
- ✅ Wallet address matches private key

### 2. Verify Position Query

```typescript
// 2. Get positions
const positions = await sdk.getPositions();
// Expected output:
// - Found X positions
// - Or empty array (if no positions)
```

**Verification Points:**
- ✅ Successfully query positions
- ✅ Return array format
- ✅ Position data fields are complete

### 3. Verify Open Orders Query

```typescript
// 3. Get open orders
const openOrders = await sdk.getOpenOrders();
// Expected output:
// - Found X open orders
// - Or empty array (if no open orders)
```

**Verification Points:**
- ✅ Successfully query open orders
- ✅ Return array format
- ✅ Order data fields are complete

### 4. Verify Order Placement (Test with Caution)

⚠️ **Note: Placing orders will execute actual trades, please test with caution!**

Uncomment the code in the example file to test order placement:

```typescript
// Uncomment in examples/basic-usage.ts
console.log("\n=== Placing Market Order ===");
const orderResult = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.01", // Small quantity for testing
  leverage: "10",
});
```

**Verification Points:**
- ✅ Order successfully submitted
- ✅ Return order ID or transaction hash
- ✅ Order appears in open orders list

### 5. Verify Order Cancellation

```typescript
// Uncomment order cancellation code in example file
if (openOrders.status && openOrders.data && openOrders.data.length > 0) {
  const cancelResult = await sdk.cancelOrder({
    symbol: openOrders.data[0].symbol,
    orderHashes: [openOrders.data[0].hash],
  });
}
```

**Verification Points:**
- ✅ Order cancellation successful
- ✅ Order disappears from open orders list

### 6. Verify Position TP/SL Management (Optional)

1. (Optional) Export environment variables:

```bash
export RUN_TPSL_DEMO=1          # Actually place TP/SL orders
export TPSL_SYMBOL=BTC-PERP     # Optional override
export POSITION_ID=123456789    # Use a valid position ID to query TP/SL orders
```

2. Run the TP/SL example:

```bash
npm run example:tpsl
```

3. Follow the console output:
   - ✅ TP/SL placement response (only when `RUN_TPSL_DEMO=1`)
   - ✅ Existing TP/SL orders listed when `POSITION_ID` is provided
   - ✅ TP/SL cancellation result when `TPSL_CANCEL_HASH` is set

4. Confirm in the UI or via subsequent API calls that the TP/SL orders were
   created/updated/cancelled as expected.

## 📝 Complete Testing Workflow

### Step 1: Basic Functionality Test

```bash
# 1. Ensure environment variables are configured
cat .env | grep PRIVATE_KEY

# 2. Run example (query only, no order placement)
npm run example
```

**Expected Results:**
- Display wallet address
- Display account information
- Display positions list (may be empty)
- Display open orders list (may be empty)

### Step 2: Order Placement Test (Optional)

1. Edit `examples/basic-usage.ts`
2. Uncomment order placement code
3. Modify to use small quantity for testing (e.g., 0.01)
4. Run example:

```bash
npm run example
```

5. Verify if order was successful:
   - Check returned order result
   - Run example again to check open orders list

### Step 3: Order Cancellation Test (Optional)

1. Ensure there are open orders
2. Uncomment order cancellation code
3. Run example:

```bash
npm run example
```

4. Verify if order was cancelled:
   - Check cancellation return result
   - Run example again to confirm order has disappeared

## 🐛 Common Issues

### Issue 1: PRIVATE_KEY Environment Variable Not Found

**Error Message:**
```
Please set PRIVATE_KEY environment variable
```

**Solution:**
1. Check if `.env` file exists
2. Confirm `.env` file contains `PRIVATE_KEY=...` configuration
3. Confirm `.env` file is in project root directory

### Issue 2: Invalid Private Key Format

**Error Message:**
```
Invalid secret key format
```

**Solution:**
1. Confirm private key format is correct (Sui standard format)
2. Check if private key is complete (not truncated)
3. Confirm private key has no extra spaces or line breaks

### Issue 3: Network Connection Error

**Error Message:**
```
Request failed / Network error
```

**Solution:**
1. Check network connection
2. Confirm API address is correct (testnet/mainnet)
3. Check firewall settings
4. Try using VPN (if in restricted network environment)

### Issue 4: Account Not Activated (Onboarding)

**Error Message:**
```
Failed to get account info: ...
```

**Solution:**
1. Confirm account has completed Onboarding
2. First-time use in testnet environment requires identity verification
3. Check if account has sufficient balance

### Issue 5: TypeScript Compilation Error

**Error Message:**
```
Cannot find module '...'
```

**Solution:**
1. Reinstall dependencies: `npm install`
2. Check `tsconfig.json` configuration
3. Confirm all dependencies are correctly installed

### Issue 6: Signature Error

**Error Message:**
```
Signature verification failed
```

**Solution:**
1. Confirm private key matches wallet address
2. Check if private key format is correct
3. Confirm you're using the correct network (testnet/mainnet)

## 🔍 Debugging Tips

### 1. Enable Detailed Logging

Add logging in code:

```typescript
// In sdk.ts or example file
console.log("Request params:", requestParams);
console.log("Response:", response);
```

### 2. Use Debugger

```bash
# Use Node.js debugger
node --inspect-brk node_modules/.bin/ts-node --project tsconfig.example.json examples/basic-usage.ts
```

### 3. Check Network Requests

Add request logging in `src/services/httpClient.ts`:

```typescript
this.instance.interceptors.request.use((config) => {
  console.log("Request:", config.method, config.url, config.data);
  return config;
});
```

## 📚 More Examples

Check the `examples/` directory for more example code.

## 🆘 Get Help

If you encounter issues:

1. Check the Common Issues section of this document
2. Review project README.md
3. Check API documentation
4. Submit an Issue to the project repository

## ⚠️ Security Tips

1. **Never** commit private keys to Git
2. **Never** hardcode private keys in code
3. Use `.env` file to manage sensitive information
4. Ensure `.env` is in `.gitignore`
5. Use testnet private keys for testing
6. Use environment variables or key management services in production
