// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

export * from "./config";
export * from "./sdk";
export { HttpClient } from "./services/httpClient";
export * from "./types";
export * from "./utils";

// Main SDK initialization function
import { Keypair } from "@mysten/sui/cryptography";
import { initSDKOptions } from "./config";
import { DipCoinPerpSDK } from "./sdk";
import { DipCoinPerpSDKOptions } from "./types";

/**
 * Initialize DipCoin Perpetual Trading SDK
 * @param privateKey Private key string or Keypair instance
 * @param options SDK configuration options
 * @returns Initialized SDK instance
 */
export function initDipCoinPerpSDK(
  privateKey: string | Keypair,
  options: Partial<DipCoinPerpSDKOptions> & { network: "mainnet" | "testnet" }
): DipCoinPerpSDK {
  const sdkOptions = initSDKOptions(options);
  return new DipCoinPerpSDK(privateKey, sdkOptions);
}

// Default export
export default DipCoinPerpSDK;

