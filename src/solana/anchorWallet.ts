// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Node / headless Anchor wallet built directly from a `@solana/web3.js`
 * `Keypair` (no browser wallet-adapter). Mirrors
 * `ts-frontend/src/utils/cctp/anchorWalletAdapter.ts` but signs with the local
 * keypair and derives Anchor instruction discriminators via Node `crypto`.
 */
import { createHash } from "crypto";
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { AnchorProvider, Idl, Wallet } from "@coral-xyz/anchor";

/** Anchor `Wallet` implementation backed by a local keypair. */
export class KeypairAnchorWallet implements Wallet {
  constructor(public readonly payer: Keypair) {}

  get publicKey() {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) {
      tx.sign([this.payer]);
    } else {
      tx.partialSign(this.payer);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> {
    return txs.map((tx) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([this.payer]);
      } else {
        tx.partialSign(this.payer);
      }
      return tx;
    });
  }
}

/** Build an `AnchorProvider` from a local keypair. */
export function createAnchorProviderFromKeypair(
  connection: Connection,
  keypair: Keypair
): AnchorProvider {
  const wallet = new KeypairAnchorWallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions());
}

/**
 * Normalize a (possibly legacy) on-chain Anchor IDL so the modern
 * `@coral-xyz/anchor` runtime can consume it: fills in instruction
 * discriminators, renames `publicKey` -> `pubkey`, and back-fills
 * `writable` / `signer` from the legacy `isMut` / `isSigner`.
 */
export function normalizeLegacyAnchorIdl(idl: Idl, programId: { toString(): string }): Idl {
  const toSnakeCase = (value: string): string =>
    value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

  const instructionDiscriminator = (name: string): number[] => {
    const digest = createHash("sha256")
      .update(`global:${toSnakeCase(name)}`)
      .digest();
    return Array.from(digest.subarray(0, 8));
  };

  const normalized = structuredClone({ ...idl, address: programId.toString() }) as Record<
    string,
    unknown
  >;
  delete normalized.accounts;
  delete normalized.events;

  if (Array.isArray(normalized.instructions)) {
    for (const instruction of normalized.instructions) {
      const record = instruction as Record<string, unknown>;
      if (typeof record.name === "string" && !Array.isArray(record.discriminator)) {
        record.discriminator = instructionDiscriminator(record.name);
      }
    }
  }

  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of ["type", "returns", "option", "vec", "alias"]) {
      if (record[key] === "publicKey") record[key] = "pubkey";
    }
    if (Array.isArray(record.array)) {
      record.array = record.array.map((item) => (item === "publicKey" ? "pubkey" : item));
    }
    if (typeof record.defined === "string") {
      record.defined = { name: record.defined };
    }
    if (record.writable === undefined && typeof record.isMut === "boolean") {
      record.writable = record.isMut;
    }
    if (record.signer === undefined && typeof record.isSigner === "boolean") {
      record.signer = record.isSigner;
    }
    Object.values(record).forEach(visit);
  };
  visit(normalized);
  return normalized as Idl;
}
