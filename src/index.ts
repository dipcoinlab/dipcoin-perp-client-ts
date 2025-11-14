// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

export * from "./sdk";
export * from "./types";
export * from "./config";
export * from "./utils";
export { HttpClient } from "./services/httpClient";

// Main SDK initialization function
import { DipCoinPerpSDK } from "./sdk";
import { DipCoinPerpSDKOptions } from "./types";
import { Keypair } from "@mysten/sui/cryptography";
import { initSDKOptions } from "./config";

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

