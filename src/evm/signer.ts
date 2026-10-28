// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * EVM personal_sign helpers.
 * Authorize / orders use the dash-joined API form (`hex-4-base64(address)`).
 * Relayer payloads use scheme 0x04 plus the compressed secp256k1 public key.
 */
import { SigningKey, Wallet, hashMessage } from "ethers";
import { SIGNER_TYPES, UnifiedAddressChainId } from "@dipcoinlab/perp-ts-library";
import type { RelayUser } from "../solana/relay";

export async function buildEvmApiSignature(message: string, wallet: Wallet): Promise<string> {
  const signature = await wallet.signMessage(message);
  const signatureHex = signature.startsWith("0x") ? signature.slice(2) : signature;
  const addressHex = wallet.address.slice(2).toLowerCase();
  const publicKey = Buffer.from(addressHex, "hex").toString("base64");
  return `${signatureHex}-${SIGNER_TYPES.EVM_WALLET}-${publicKey}`;
}

/** personal_sign plus scheme 0x04. Public key is compressed secp256k1, not the address. */
export function evmRelaySignature(message: string, signature: string): {
  signature: string;
  publicKey: string;
} {
  const sig = signature.startsWith("0x") ? signature : `0x${signature}`;
  const uncompressed = SigningKey.recoverPublicKey(hashMessage(message), sig);
  return {
    signature: `${sig.slice(2)}04`,
    publicKey: SigningKey.computePublicKey(uncompressed, true),
  };
}

export function toEvmRelayUser(protocolId: UnifiedAddressChainId, address: string): RelayUser {
  const trimmed = address.trim();
  const withPrefix = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed : `0x${trimmed}`;
  return {
    chainId: protocolId,
    rawAddress: withPrefix.toLowerCase(),
  };
}
