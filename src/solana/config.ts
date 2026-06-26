// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Circle CCTP V1 (Solana <-> Sui) constants and helpers.
 *
 * Values mirror `perp-ts-library/examples/cctp/sol2sui.ts` and the dApp
 * (`ts-frontend/src/utils/cctp/config.ts`):
 *  - Circle's official contract ids on Sui / Solana (testnet / mainnet)
 *  - CCTP domain ids: Sui = 8, Solana = 5
 *  - destinationCaller = keccak256("{packageId}::cctp::CctpReceiveAuth")
 *
 * Unlike the dApp, the network is always passed explicitly (the headless SDK
 * already knows its `network` from {@link DipCoinPerpSDKOptions}).
 */
import { PublicKey } from "@solana/web3.js";
import { keccak256, toUtf8Bytes } from "ethers";

/** SDK network kind. Matches `DipCoinPerpSDKOptions.network`. */
export type CctpNetwork = "testnet" | "mainnet";

/** Solana CCTP domain id (written into the message header). */
export const SOLANA_DOMAIN = 5;
/** Sui CCTP domain id. */
export const SUI_DOMAIN = 8;

/** Sui system Deny List object id (required by USDC mint). */
export const SUI_DENY_LIST_ID = "0x403";

/** Default Iris attestation polling parameters (used by status helpers). */
export const DEFAULT_ATTESTATION_POLL_INTERVAL_MS = 2_000;
export const DEFAULT_ATTESTATION_MAX_ATTEMPTS = 120;

/** Circle's official Sui-side CCTP + USDC package addresses. */
export type SuiCctpAddresses = {
  messageTransmitterId: string;
  messageTransmitterStateId: string;
  tokenMessengerMinterId: string;
  tokenMessengerMinterStateId: string;
  usdcPackageId: string;
  treasuryId: string;
};

export const SUI_CCTP_ADDRESSES: Record<CctpNetwork, SuiCctpAddresses> = {
  testnet: {
    messageTransmitterId: "0x4931e06dce648b3931f890035bd196920770e913e43e45990b383f6486fdd0a5",
    messageTransmitterStateId:
      "0x98234bd0fa9ac12cc0a20a144a22e36d6a32f7e0a97baaeaf9c76cdc6d122d2e",
    tokenMessengerMinterId: "0x31cc14d80c175ae39777c0238f20594c6d4869cfab199f40b69f3319956b8beb",
    tokenMessengerMinterStateId:
      "0x5252abd1137094ed1db3e0d75bc36abcd287aee4bc310f8e047727ef5682e7c2",
    usdcPackageId: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29",
    treasuryId: "0x7170137d4a6431bf83351ac025baf462909bffe2877d87716374fb42b9629ebe",
  },
  mainnet: {
    messageTransmitterId: "0x08d87d37ba49e785dde270a83f8e979605b03dc552b5548f26fdf2f49bf7ed1b",
    messageTransmitterStateId:
      "0xf68268c3d9b1df3215f2439400c1c4ea08ac4ef4bb7d6f3ca6a2a239e17510af",
    tokenMessengerMinterId: "0x2aa6c5d56376c371f88a6cc42e852824994993cb9bab8d3e6450cbe3cb32b94e",
    tokenMessengerMinterStateId:
      "0x45993eecc0382f37419864992c12faee2238f5cfe22b98ad3bf455baf65c8a2f",
    usdcPackageId: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7",
    treasuryId: "0x57d6725e7a8b49a7b2a612f6bd66ab5f39fc95332ca48be421c3229d514a6de7",
  },
};

/** Circle's official Solana-side program ids (same across testnet / mainnet). */
export const SOLANA_CCTP_PROGRAMS = {
  messageTransmitter: "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd",
  tokenMessengerMinter: "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3",
};

/** Solana-side USDC mint (testnet uses Circle's devnet test USDC). */
export const SOLANA_USDC_MINTS: Record<CctpNetwork, string> = {
  testnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

/** Default public Solana RPC endpoints (override via `solanaRpcUrl`). */
export const DEFAULT_SOLANA_RPC_URLS: Record<CctpNetwork, string> = {
  // Public mainnet node that is browser- and server-friendly.
  mainnet: "https://solana-rpc.publicnode.com",
  // Circle's CCTP test USDC lives on Solana devnet.
  testnet: "https://api.devnet.solana.com",
};

const stripHexPrefix = (value: string): string => value.replace(/^0x/i, "");

/** Normalize a Sui address to `0x` + 64 hex chars. */
export function normalizeSuiAddress(address: string): string {
  const hex = stripHexPrefix(address).toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length > 64) {
    throw new Error(`Invalid Sui address: ${address}`);
  }
  return `0x${hex.padStart(64, "0")}`;
}

/** Build `"{packageId}::{module}::{type}"` (strips 0x then pads to 64). */
export function suiTypeName(packageId: string, moduleName: string, typeName: string): string {
  return `${stripHexPrefix(normalizeSuiAddress(packageId))}::${moduleName}::${typeName}`;
}

/**
 * destinationCaller = keccak256("{packageId}::cctp::CctpReceiveAuth").
 *
 * CCTP uses these 32 bytes to enforce "only the business contract may receive
 * this message", preventing front-running the Sui-side receive.
 */
export function cctpReceiveDestinationCaller(packageId: string): string {
  return keccak256(toUtf8Bytes(suiTypeName(packageId, "cctp", "CctpReceiveAuth")));
}

const hexToBuffer = (value: string): Buffer => Buffer.from(stripHexPrefix(value), "hex");

/**
 * Treat a 32-byte Sui address (or hex string) as a Solana `PublicKey`.
 * Both `mintRecipient` and `destinationCaller` are 32 bytes, so the Solana
 * `PublicKey` container is the most convenient representation.
 */
export function suiAddressToBytes32PublicKey(address: string): PublicKey {
  const bytes = hexToBuffer(normalizeSuiAddress(address));
  if (bytes.length !== 32) {
    throw new Error(`Sui address must be 32 bytes, got ${bytes.length} bytes.`);
  }
  return new PublicKey(bytes);
}
