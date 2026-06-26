// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import { getSolanaUsdcMintPublicKey } from "./associatedToken";
import type { CctpNetwork } from "./config";

/** Native SOL balance (in SOL, 9-decimal precision). */
export async function fetchSolBalance(connection: Connection, address: string): Promise<string> {
  try {
    const lamports = await connection.getBalance(new PublicKey(address), "confirmed");
    return new BigNumber(lamports)
      .dividedBy(LAMPORTS_PER_SOL)
      .decimalPlaces(9, BigNumber.ROUND_DOWN)
      .toString(10);
  } catch {
    return "0";
  }
}

/**
 * USDC balance for a Solana owner. Aggregates all token accounts for the mint;
 * returns "0" when no accounts exist (no error thrown for empty owners).
 */
export async function fetchSolanaUsdcBalance(
  connection: Connection,
  address: string,
  network: CctpNetwork
): Promise<string> {
  try {
    const owner = new PublicKey(address);
    const mint = getSolanaUsdcMintPublicKey(network);
    const res = await connection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
    if (!res?.value?.length) return "0";
    return res.value
      .reduce((sum, { account }) => {
        const info = (account?.data as any)?.parsed?.info?.tokenAmount;
        const uiAmount = info?.uiAmountString ?? info?.uiAmount ?? "0";
        return sum.plus(new BigNumber(uiAmount || "0"));
      }, new BigNumber(0))
      .toString(10);
  } catch {
    return "0";
  }
}
