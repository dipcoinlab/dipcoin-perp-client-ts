// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * EVM CCTP V2 chains supported by the dApp: Ethereum, Arbitrum, OP, Base, Polygon.
 * Addresses match `perp-ts-library/examples/cctp/lib/evm.ts` and
 * `ts-frontend/src/config/evmChains.ts`. Protocol chain ids are UnifiedAddressChainId,
 * not the wallet network id.
 */
import { UnifiedAddressChainId } from "@dipcoinlab/perp-ts-library";
import type { CctpNetwork } from "../solana/config";

export type EvmChainName = "ethereum" | "arbitrum" | "optimism" | "base" | "polygon";

export interface EvmChainConfig {
  name: EvmChainName;
  /** Wallet network id (1, 42161, … or the testnet id). */
  networkId: number;
  /** Protocol chain id sent to the relayer (Ethereum 1, Arbitrum 3, …). */
  protocolId: UnifiedAddressChainId;
  rpcUrl: string;
  usdc: string;
  tokenMessengerV2: string;
}

const TOKEN_MESSENGER_V2: Record<CctpNetwork, string> = {
  testnet: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  mainnet: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
};

type Defaults = {
  protocolId: UnifiedAddressChainId;
  networkId: Record<CctpNetwork, number>;
  rpcUrl: Record<CctpNetwork, string>;
  usdc: Record<CctpNetwork, string>;
};

const CHAINS: Record<EvmChainName, Defaults> = {
  ethereum: {
    protocolId: UnifiedAddressChainId.Ethereum,
    networkId: { testnet: 11155111, mainnet: 1 },
    rpcUrl: {
      testnet: "https://ethereum-sepolia-rpc.publicnode.com",
      mainnet: "https://ethereum-rpc.publicnode.com",
    },
    usdc: {
      testnet: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
  },
  arbitrum: {
    protocolId: UnifiedAddressChainId.Arbitrum,
    networkId: { testnet: 421614, mainnet: 42161 },
    rpcUrl: {
      testnet: "https://arbitrum-sepolia-rpc.publicnode.com",
      mainnet: "https://arbitrum-one-rpc.publicnode.com",
    },
    usdc: {
      testnet: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      mainnet: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
  },
  optimism: {
    protocolId: UnifiedAddressChainId.Optimism,
    networkId: { testnet: 11155420, mainnet: 10 },
    rpcUrl: {
      testnet: "https://optimism-sepolia-rpc.publicnode.com",
      mainnet: "https://optimism-rpc.publicnode.com",
    },
    usdc: {
      testnet: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
      mainnet: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    },
  },
  base: {
    protocolId: UnifiedAddressChainId.Base,
    networkId: { testnet: 84532, mainnet: 8453 },
    rpcUrl: {
      testnet: "https://base-sepolia-rpc.publicnode.com",
      mainnet: "https://base-rpc.publicnode.com",
    },
    usdc: {
      testnet: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      mainnet: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
  },
  polygon: {
    protocolId: UnifiedAddressChainId.Polygon,
    networkId: { testnet: 80002, mainnet: 137 },
    rpcUrl: {
      testnet: "https://polygon-amoy-bor-rpc.publicnode.com",
      mainnet: "https://polygon-bor-rpc.publicnode.com",
    },
    usdc: {
      testnet: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
      mainnet: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    },
  },
};

export function isEvmChainName(value: string): value is EvmChainName {
  return value in CHAINS;
}

export function getEvmChainConfig(
  name: EvmChainName,
  network: CctpNetwork,
  rpcUrl?: string
): EvmChainConfig {
  const defaults = CHAINS[name];
  return {
    name,
    networkId: defaults.networkId[network],
    protocolId: defaults.protocolId,
    rpcUrl: rpcUrl?.trim() || defaults.rpcUrl[network],
    usdc: defaults.usdc[network],
    tokenMessengerV2: TOKEN_MESSENGER_V2[network],
  };
}
