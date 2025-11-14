// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Basic usage example for DipCoin Perpetual Trading SDK
 * 
 * This is a reference example. In production, never expose your private key.
 * 
 * Usage:
 *   1. Create a .env file in the project root with: PRIVATE_KEY=your-private-key
 *   2. Run: npm run example
 *   3. Or: PRIVATE_KEY=your-key npm run example
 */

// Try to load .env file if dotenv is available (optional)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch (e) {
  // dotenv is optional, continue without it
}

import { initDipCoinPerpSDK } from "../src";

async function main() {
  // Initialize SDK with private key
  // WARNING: Never expose your private key in production code
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("❌ Error: PRIVATE_KEY environment variable is not set");
    console.error("\nPlease set it in one of the following ways:");
    console.error("  1. Create a .env file with: PRIVATE_KEY=your-private-key");
    console.error("  2. Export it: export PRIVATE_KEY=your-private-key");
    console.error("  3. Inline: PRIVATE_KEY=your-key npm run example");
    console.error("\nExample .env file:");
    console.error("  PRIVATE_KEY=suiprivkey1...");
    return;
  }

  const sdk = initDipCoinPerpSDK(privateKey, {
    network: "testnet", // or "mainnet"
  });

  console.log("Wallet Address:", sdk.address);

  try {
    // 1. Get account information
    console.log("\n=== Getting Account Info ===");
    const accountInfo = await sdk.getAccountInfo();
    if (accountInfo.status && accountInfo.data) {
      console.log("Wallet Balance:", accountInfo.data.walletBalance);
      console.log("Account Value:", accountInfo.data.accountValue);
      console.log("Free Collateral:", accountInfo.data.freeCollateral);
      console.log("Unrealized PnL:", accountInfo.data.totalUnrealizedProfit);
    } else {
      console.error("Failed to get account info:", accountInfo.error);
    }

    // 2. Get positions
    console.log("\n=== Getting Positions ===");
    const positions = await sdk.getPositions();
    if (positions.status && positions.data) {
      console.log(`Found ${positions.data.length} positions`);
      positions.data.forEach((pos) => {
        console.log(`- ${pos.symbol}: ${pos.side} ${pos.quantity} @ ${pos.avgEntryPrice}`);
      });
    } else {
      console.error("Failed to get positions:", positions.error);
    }

    // 3. Get open orders
    console.log("\n=== Getting Open Orders ===");
    const openOrders = await sdk.getOpenOrders();
    if (openOrders.status && openOrders.data) {
      console.log(`Found ${openOrders.data.length} open orders`);
      openOrders.data.forEach((order) => {
        console.log(
          `- ${order.symbol}: ${order.side} ${order.orderType} ${order.quantity} @ ${order.price}`
        );
      });
    } else {
      console.error("Failed to get open orders:", openOrders.error);
    }

    // 4. Place a market order (commented out to prevent accidental orders)
    /*
    console.log("\n=== Placing Market Order ===");
    const orderResult = await sdk.placeOrder({
      symbol: "BTC-PERP",
      side: OrderSide.BUY,
      orderType: OrderType.MARKET,
      quantity: "0.01",
      leverage: "10",
    });

    if (orderResult.status) {
      console.log("Order placed successfully:", orderResult.data);
    } else {
      console.error("Failed to place order:", orderResult.error);
    }
    */

    // 5. Cancel an order (example)
    /*
    if (openOrders.status && openOrders.data && openOrders.data.length > 0) {
      console.log("\n=== Cancelling Order ===");
      const cancelResult = await sdk.cancelOrder({
        symbol: openOrders.data[0].symbol,
        orderHashes: [openOrders.data[0].hash],
      });

      if (cancelResult.status) {
        console.log("Order cancelled successfully");
      } else {
        console.error("Failed to cancel order:", cancelResult.error);
      }
    }
    */
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require.main === module) {
  main().catch(console.error);
}

