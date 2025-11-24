// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * TP/SL management example
 *
 * Demonstrates how to:
 * 1. Fetch a trading pair perpId
 * 2. Add or edit TP/SL orders for a position
 * 3. Fetch TP/SL orders for a position
 * 4. Cancel TP/SL orders (if you have order hashes)
 *
 * IMPORTANT:
 * - This script performs authenticated requests that may create or cancel real orders.
 * - By default the TP/SL placement step is skipped to avoid accidental submissions.
 * - Set RUN_TPSL_DEMO=1 to place TP/SL orders intentionally.
 * - Provide POSITION_ID (and optionally TPSL_CANCEL_HASH) to query or cancel orders.
 */

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch {
  // dotenv is optional
}

import { initDipCoinPerpSDK, OrderSide, OrderType } from "../src";

async function main() {
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("❌ PRIVATE_KEY env variable is required");
    return;
  }

  const network = (process.env.NETWORK as "mainnet" | "testnet") || "testnet";
  const symbol = process.env.TPSL_SYMBOL || "BTC-PERP";
  const sdk = initDipCoinPerpSDK(privateKey, { network });

  console.log("Wallet:", sdk.address);
  const auth = await sdk.authenticate();
  if (!auth.status) {
    console.error("❌ Authentication failed:", auth.error);
    return;
  }

  const perpId = await sdk.getPerpetualID(symbol);
  if (!perpId) {
    console.error(`❌ Unable to find PerpetualID for ${symbol}`);
    return;
  }
  console.log(`PerpetualID for ${symbol}: ${perpId}`);

  // Optional: place TP/SL orders only when RUN_TPSL_DEMO=1 is set
  if (process.env.RUN_TPSL_DEMO === "1") {
    console.log("\n=== Placing TP/SL orders (demo) ===");
    const tpSlResult = await sdk.placePositionTpSlOrders({
      symbol,
      market: perpId,
      side: OrderSide.SELL, // Close long position example
      isLong: false,
      leverage: "5",
      quantity: "0.01",
      tp: {
        triggerPrice: "89000",
        orderType: OrderType.LIMIT,
        orderPrice: "90000",
        tpslType: "position",
      },
      sl: {
        triggerPrice: "85000",
        orderType: OrderType.MARKET,
        tpslType: "position",
      },
    });

    if (tpSlResult.status) {
      console.log("✅ TP/SL request sent:", tpSlResult.data);
    } else {
      console.error("❌ Failed to place TP/SL orders:", tpSlResult.error);
    }
  } else {
    console.log(
      "\nℹ️ Skipping TP/SL placement. Set RUN_TPSL_DEMO=1 to place TP/SL orders."
    );
  }

  // Fetch TP/SL orders for a position if POSITION_ID is provided
  const positionId = process.env.POSITION_ID;
  if (positionId) {
    console.log("\n=== Fetching TP/SL orders for position ===");
    const tpSlList = await sdk.getPositionTpSl(positionId, "position");
    if (tpSlList.status && tpSlList.data) {
      console.log(`Found ${tpSlList.data.length} TP/SL orders:`);
      tpSlList.data.forEach((order) => {
        console.log(
          `- ${order.planOrderType}: trigger=${order.triggerPrice} price=${order.price} hash=${order.hash}`
        );
      });
    } else {
      console.error("Failed to fetch TP/SL orders:", tpSlList.error);
    }
  } else {
    console.log(
      "\nℹ️ Set POSITION_ID to fetch TP/SL orders for a specific position."
    );
  }

  // Optional: edit TP/SL orders when plan IDs are provided
  const editTpPlanId = process.env.TPSL_EDIT_TP_PLAN_ID;
  const editSlPlanId = process.env.TPSL_EDIT_SL_PLAN_ID;
  if (process.env.RUN_TPSL_EDIT === "1" && (editTpPlanId || editSlPlanId)) {
    console.log("\n=== Editing TP/SL orders ===");
    const editResult = await sdk.placePositionTpSlOrders({
      symbol,
      market: perpId,
      side: OrderSide.SELL,
      isLong: false,
      leverage: "5",
      quantity: "0.01",
      tp: editTpPlanId
        ? {
            planId: editTpPlanId,
            triggerPrice: "91000",
            orderType: OrderType.LIMIT,
            orderPrice: "91000",
            tpslType: "position",
          }
        : undefined,
      sl: editSlPlanId
        ? {
            planId: editSlPlanId,
            triggerPrice: "83000",
            orderType: OrderType.MARKET,
            tpslType: "position",
          }
        : undefined,
    });

    if (editResult.status) {
      console.log("✅ TP/SL edit request sent:", editResult.data);
    } else {
      console.error("❌ Failed to edit TP/SL orders:", editResult.error);
    }
  } else {
    console.log(
      "\nℹ️ To edit TP/SL orders set RUN_TPSL_EDIT=1 and TPSL_EDIT_TP_PLAN_ID / TPSL_EDIT_SL_PLAN_ID."
    );
  }

  // Cancel TP/SL order if hash is provided
  const cancelHash = process.env.TPSL_CANCEL_HASH;
  if (cancelHash) {
    console.log("\n=== Cancelling TP/SL order ===");
    const cancelResult = await sdk.cancelTpSlOrders({
      symbol,
      orderHashes: [cancelHash],
    });
    if (cancelResult.status) {
      console.log("✅ TP/SL order cancelled:", cancelResult.data);
    } else {
      console.error("❌ Failed to cancel TP/SL order:", cancelResult.error);
    }
  } else {
    console.log(
      "\nℹ️ Set TPSL_CANCEL_HASH to cancel a specific TP/SL order by hash."
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

