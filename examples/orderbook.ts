// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * OrderBook Example for DipCoin Perpetual Trading SDK
 * 
 * This example demonstrates how to get the order book for a trading pair.
 * OrderBook shows the current buy (bids) and sell (asks) orders in the market.
 * 
 * Usage:
 *   1. Create a .env file in the project root with: PRIVATE_KEY=your-private-key
 *   2. Run: ts-node --project tsconfig.example.json examples/orderbook.ts
 *   3. Or: PRIVATE_KEY=your-key npm run example:orderbook
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
    console.error("  3. Inline: PRIVATE_KEY=your-key ts-node examples/orderbook.ts");
    console.error("\nExample .env file:");
    console.error("  PRIVATE_KEY=suiprivkey1...");
    return;
  }

  const sdk = initDipCoinPerpSDK(privateKey, {
    network: "testnet", // or "mainnet"
  });

  console.log("Wallet Address:", sdk.address);

  try {
    // 0. Authenticate first (onboarding)
    // Note: OrderBook is a market data endpoint and may not require authentication,
    // but we authenticate for consistency
    console.log("\n=== Authenticating (Onboarding) ===");
    const authResult = await sdk.authenticate();
    if (authResult.status) {
      console.log("✅ Authentication successful!");
      console.log("JWT Token:", authResult.data?.substring(0, 20) + "...");
    } else {
      console.error("❌ Authentication failed:", authResult.error);
      // Continue anyway as OrderBook might work without auth
      console.log("⚠️  Continuing without authentication (OrderBook may work without auth)");
    }

    // 1. Get trading pairs to see available symbols
    console.log("\n=== Getting Trading Pairs ===");
    const tradingPairsResult = await sdk.getTradingPairs();
    if (tradingPairsResult.status && tradingPairsResult.data) {
      console.log(`✅ Found ${tradingPairsResult.data.length} trading pairs`);
      console.log("\nAvailable trading pairs (first 10):");
      tradingPairsResult.data.slice(0, 10).forEach((pair) => {
        console.log(`  - ${pair.symbol}`);
      });
      if (tradingPairsResult.data.length > 10) {
        console.log(`  ... and ${tradingPairsResult.data.length - 10} more`);
      }
    } else {
      console.error("❌ Failed to get trading pairs:", tradingPairsResult.error);
    }

    // 2. Get OrderBook for a specific trading pair
    const symbolToQuery = "BTC-PERP";
    console.log(`\n=== Getting OrderBook for ${symbolToQuery} ===`);
    const orderBookResult = await sdk.getOrderBook(symbolToQuery);

    if (orderBookResult.status && orderBookResult.data) {
      const orderBook = orderBookResult.data;
      console.log("✅ OrderBook retrieved successfully!");
      console.log(`\nSymbol: ${symbolToQuery}`);
      if (orderBook.timestamp) {
        console.log(`Timestamp: ${new Date(orderBook.timestamp).toISOString()}`);
      }

      // Display bids (buy orders) - sorted from highest to lowest price
      console.log(`\n📊 Bids (Buy Orders) - ${orderBook.bids.length} levels:`);
      if (orderBook.bids.length > 0) {
        console.log("   Price        | Quantity");
        console.log("   " + "-".repeat(30));
        // Show top 10 bids
        orderBook.bids.slice(0, 10).forEach((bid, index) => {
          const price = parseFloat(bid.price).toFixed(2);
          const quantity = parseFloat(bid.quantity).toFixed(4);
          const marker = index === 0 ? "🏆" : "  ";
          console.log(`${marker} ${price.padStart(12)} | ${quantity.padStart(12)}`);
        });
        if (orderBook.bids.length > 10) {
          console.log(`   ... and ${orderBook.bids.length - 10} more bid levels`);
        }

        // Calculate total bid volume
        const totalBidVolume = orderBook.bids.reduce(
          (sum, bid) => sum + parseFloat(bid.quantity),
          0
        );
        console.log(`\n   Total Bid Volume: ${totalBidVolume.toFixed(4)}`);
      } else {
        console.log("   No bids available");
      }

      // Display asks (sell orders) - sorted from lowest to highest price
      console.log(`\n📊 Asks (Sell Orders) - ${orderBook.asks.length} levels:`);
      if (orderBook.asks.length > 0) {
        console.log("   Price        | Quantity");
        console.log("   " + "-".repeat(30));
        // Show top 10 asks
        orderBook.asks.slice(0, 10).forEach((ask, index) => {
          const price = parseFloat(ask.price).toFixed(2);
          const quantity = parseFloat(ask.quantity).toFixed(4);
          const marker = index === 0 ? "🏆" : "  ";
          console.log(`${marker} ${price.padStart(12)} | ${quantity.padStart(12)}`);
        });
        if (orderBook.asks.length > 10) {
          console.log(`   ... and ${orderBook.asks.length - 10} more ask levels`);
        }

        // Calculate total ask volume
        const totalAskVolume = orderBook.asks.reduce(
          (sum, ask) => sum + parseFloat(ask.quantity),
          0
        );
        console.log(`\n   Total Ask Volume: ${totalAskVolume.toFixed(4)}`);
      } else {
        console.log("   No asks available");
      }

      // Calculate spread and mid price
      if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBid = parseFloat(orderBook.bids[0].price);
        const bestAsk = parseFloat(orderBook.asks[0].price);
        const spread = bestAsk - bestBid;
        const spreadPercent = ((spread / bestBid) * 100).toFixed(4);
        const midPrice = (bestBid + bestAsk) / 2;

        console.log("\n📈 Market Summary:");
        console.log(`   Best Bid: ${bestBid.toFixed(2)}`);
        console.log(`   Best Ask: ${bestAsk.toFixed(2)}`);
        console.log(`   Spread: ${spread.toFixed(2)} (${spreadPercent}%)`);
        console.log(`   Mid Price: ${midPrice.toFixed(2)}`);
      }

      // 3. Get OrderBook for multiple symbols
      console.log("\n=== Getting OrderBook for Multiple Symbols ===");
      const symbolsToQuery = ["BTC-PERP", "ETH-PERP"];
      
      for (const symbol of symbolsToQuery) {
        const result = await sdk.getOrderBook(symbol);
        if (result.status && result.data) {
          const ob = result.data;
          if (ob.bids.length > 0 && ob.asks.length > 0) {
            const bestBid = parseFloat(ob.bids[0].price);
            const bestAsk = parseFloat(ob.asks[0].price);
            const midPrice = ((bestBid + bestAsk) / 2).toFixed(2);
            console.log(`✅ ${symbol}: Mid Price = ${midPrice}`);
          } else {
            console.log(`⚠️  ${symbol}: No orders available`);
          }
        } else {
          console.error(`❌ ${symbol}: Failed to get order book - ${result.error}`);
        }
      }
    } else {
      console.error("❌ Failed to get order book:", orderBookResult.error);
      if (orderBookResult.error) {
        console.error("Error details:", orderBookResult.error);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require.main === module) {
  main().catch(console.error);
}

