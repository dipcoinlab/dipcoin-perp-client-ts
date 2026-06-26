// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { Keypair } from "@solana/web3.js";
// Use Anchor's typed base58 codec (avoids the untyped `bs58` package).
import { utils as anchorUtils } from "@coral-xyz/anchor";

const bs58 = anchorUtils.bytes.bs58;

/**
 * Parse a Solana private key into a `@solana/web3.js` `Keypair`.
 *
 * Accepts the common export formats:
 *  - base58 string (64-byte secret key OR 32-byte seed)
 *  - JSON byte array, e.g. `"[12,34,...]"` or an actual `number[]`
 *  - hex string (64-byte secret key OR 32-byte seed, with/without `0x`)
 *  - a raw `Uint8Array` / `number[]`
 *  - an existing `Keypair` (returned as-is)
 */
export function solanaKeypairFromPrivateKey(
  secret: string | Uint8Array | number[] | Keypair
): Keypair {
  if (secret instanceof Keypair) return secret;

  const bytes = toSecretBytes(secret);
  if (bytes.length === 64) {
    return Keypair.fromSecretKey(bytes);
  }
  if (bytes.length === 32) {
    return Keypair.fromSeed(bytes);
  }
  throw new Error(
    `Invalid Solana private key length: ${bytes.length} bytes (expected 32 seed or 64 secret).`
  );
}

function toSecretBytes(secret: string | Uint8Array | number[]): Uint8Array {
  if (secret instanceof Uint8Array) return secret;
  if (Array.isArray(secret)) return Uint8Array.from(secret);

  const trimmed = secret.trim();

  // JSON byte array, e.g. "[12, 34, ...]"
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return Uint8Array.from(parsed.map((n: any) => Number(n)));
    } catch {
      // fall through
    }
    throw new Error("Invalid JSON byte-array Solana private key.");
  }

  // hex string
  const hex = trimmed.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0 && (hex.length === 64 || hex.length === 128)) {
    return Uint8Array.from(Buffer.from(hex, "hex"));
  }

  // base58 (default Solana export format)
  try {
    return bs58.decode(trimmed);
  } catch {
    throw new Error("Unrecognized Solana private key format (expected base58, hex, or JSON array).");
  }
}
