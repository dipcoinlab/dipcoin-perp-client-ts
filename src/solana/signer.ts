// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Solana Ed25519 signing helpers for the headless SDK.
 *
 * Two distinct output shapes are used by the DipCoin backend / relayer:
 *
 *  1. Payload / relay / on-chain `verify` form ({@link SolanaSignedPayload}):
 *       signature = hex(64-byte sig) + "5"   (SIGNER_TYPES.SOLANA_ED25519)
 *       publicKey = base64(32-byte ed25519 pubkey)
 *     -> matches `PayloadSigner.signPayloadSolana` in perp-ts-library.
 *
 *  2. Authorize / order REST form ({@link buildSolanaApiSignature}):
 *       `${hex(sig)}-5-${base64(pubkey)}`     (single dash-joined string)
 *     -> matches `buildSolanaSignature` in ts-frontend.
 */
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  SIGNER_TYPES,
  UnifiedAddressChainId,
  suiAddressFromChain,
  unifiedAddressDisplay,
} from "@dipcoinlab/perp-ts-library";

/** perp-ts-library / contract "signed payload" shape for non-Sui wallets. */
export interface SolanaSignedPayload {
  /** The exact UTF-8 message that was signed (debug / re-verify only). */
  message: string;
  /** hex(sig) + scheme flag ("5" for Solana Ed25519). */
  signature: string;
  /** base64(raw 32-byte ed25519 public key). */
  publicKey: string;
  /** Scheme flag, always SIGNER_TYPES.SOLANA_ED25519. */
  signatureScheme: string;
}

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** Detached Ed25519 signature over the UTF-8 bytes of `payload`. */
function signRaw(
  payload: string | Uint8Array,
  keypair: Keypair
): { signatureBytes: Uint8Array; publicKeyBytes: Uint8Array } {
  const messageBytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  return { signatureBytes, publicKeyBytes: keypair.publicKey.toBytes() };
}

/**
 * Sign a canonical `Payload.<action>(...)` string for the relayer / on-chain
 * verify. Output matches `PayloadSigner.signPayloadSolana`.
 */
export function signSolanaPayload(payload: string, keypair: Keypair): SolanaSignedPayload {
  const { signatureBytes, publicKeyBytes } = signRaw(payload, keypair);
  return {
    message: payload,
    signature: toHex(signatureBytes) + SIGNER_TYPES.SOLANA_ED25519,
    publicKey: toBase64(publicKeyBytes),
    signatureScheme: SIGNER_TYPES.SOLANA_ED25519,
  };
}

/**
 * Sign a message for the authorize / order REST endpoints. Output is the
 * dash-joined `${hex}-5-${base64}` single string used by the DipCoin backend.
 */
export function buildSolanaApiSignature(message: string | Uint8Array, keypair: Keypair): string {
  const { signatureBytes, publicKeyBytes } = signRaw(message, keypair);
  return `${toHex(signatureBytes)}-${SIGNER_TYPES.SOLANA_ED25519}-${toBase64(publicKeyBytes)}`;
}

/** `Solana:<base58>` unified-address display string (order `creator`, payload `user`). */
export function solanaUnifiedDisplay(base58Address: string): string {
  return unifiedAddressDisplay(UnifiedAddressChainId.Solana, base58Address);
}

/**
 * On-chain Sui-format identity derived from a Solana pubkey (blake2b), used as
 * the `X-Wallet-Address` equivalent for on-chain reads (bank / positions).
 */
export function solanaUnifiedSuiAddress(base58Address: string): string {
  return suiAddressFromChain(UnifiedAddressChainId.Solana, base58Address);
}
