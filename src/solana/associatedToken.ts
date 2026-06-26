// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { PublicKey } from "@solana/web3.js";
import { SOLANA_USDC_MINTS, type CctpNetwork } from "./config";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

/** USDC mint public key for the given network. */
export function getSolanaUsdcMintPublicKey(network: CctpNetwork): PublicKey {
  return new PublicKey(SOLANA_USDC_MINTS[network]);
}

/** Derive the associated token account (ATA) for `(mint, owner)`. */
export function getAssociatedTokenAddressSync(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

/**
 * Base58 USDC ATA for a Solana owner (base58 wallet address), or `null` if the
 * owner address cannot be parsed.
 */
export function getSolanaUsdcAssociatedTokenAccountBase58(
  ownerAddress: string,
  network: CctpNetwork
): string | null {
  try {
    const owner = new PublicKey(ownerAddress);
    const mint = getSolanaUsdcMintPublicKey(network);
    return getAssociatedTokenAddressSync(mint, owner).toBase58();
  } catch {
    return null;
  }
}
