// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { Keypair } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import {
  decodeSuiPrivateKey,
  LEGACY_PRIVATE_KEY_SIZE,
  PRIVATE_KEY_SIZE,
} from "@mysten/sui/cryptography";
import { fromBase64 } from "@mysten/sui/utils";
import BigNumber from "bignumber.js";
import { parseSerializedSignature } from "@mysten/sui/cryptography";
import { Buffer } from "buffer";

/**
 * Signature scheme types
 */
export enum SignerTypes {
  KP_SECP256 = "0",
  KP_ED25519 = "1",
  UI_ED25519 = "2",
  ZK_ED25519 = "3",
}

/**
 * Legacy exported keypair format
 */
export type LegacyExportedKeyPair = {
  schema: "ED25519" | "Secp256k1" | "Secp256r1";
  privateKey: string;
};

/**
 * Create keypair from private key string or legacy format
 * @param secret Private key string or legacy keypair object
 * @param legacySupport Whether to support legacy format
 * @returns Keypair instance
 */
export function fromExportedKeypair(
  secret: LegacyExportedKeyPair | string,
  legacySupport = false
): Keypair {
  let schema: "ED25519" | "Secp256k1" | "Secp256r1";
  let secretKey: Uint8Array;

  if (typeof secret === "object") {
    if (!legacySupport) {
      throw new Error("Invalid secret key format");
    }
    secretKey = fromBase64(secret.privateKey);
    schema = secret.schema;
  } else {
    const decoded = decodeSuiPrivateKey(secret);
    schema = decoded.schema as "ED25519" | "Secp256k1" | "Secp256r1";
    secretKey = decoded.secretKey;
  }

  switch (schema) {
    case "ED25519": {
      let pureSecretKey = secretKey;
      if (secretKey.length === LEGACY_PRIVATE_KEY_SIZE) {
        // Legacy secret key, strip public key bytes
        pureSecretKey = secretKey.slice(0, PRIVATE_KEY_SIZE);
      }
      return Ed25519Keypair.fromSecretKey(pureSecretKey);
    }
    case "Secp256k1":
      return Secp256k1Keypair.fromSecretKey(secretKey);
    case "Secp256r1":
      return Secp256r1Keypair.fromSecretKey(secretKey);
    default:
      throw new Error(`Invalid keypair schema: ${schema}`);
  }
}

/**
 * Sign a message using keypair
 * @param keypair Keypair to sign with
 * @param messageBytes Message bytes to sign
 * @returns Signature string
 */
export async function signMessage(
  keypair: Keypair,
  messageBytes: Uint8Array
): Promise<string> {
  const signatureResult = await keypair.signPersonalMessage(messageBytes);
  // signPersonalMessage returns an object with a signature field
  // The signature field is a serialized signature string
  const serializedSignature =
    typeof signatureResult === "string" ? signatureResult : signatureResult.signature;
  return buildSignature(serializedSignature, true);
}

/**
 * Build signature string from Sui signature
 * @param signature Sui signature object
 * @param isKeyPair Whether this is from keypair (not UI wallet)
 * @returns Formatted signature string
 */
export function buildSignature(signature: string, isKeyPair = false): string {
  const signatureData = parseSerializedSignature(signature);
  let signatureHex = Buffer.from(signatureData.signature as any).toString("hex");
  let publicKey = Buffer.from(signatureData.publicKey as any).toString("base64");
  let flag = SignerTypes.KP_SECP256;

  if (
    signatureData.signatureScheme === "Secp256k1" ||
    signatureData.signatureScheme === "Secp256r1"
  ) {
    flag = SignerTypes.KP_SECP256;
  } else if (signatureData.signatureScheme === "ED25519") {
    flag = isKeyPair ? SignerTypes.KP_ED25519 : SignerTypes.UI_ED25519;
  } else if (signatureData.signatureScheme === "ZkLogin") {
    flag = SignerTypes.ZK_ED25519;
    // ZkLogin signature handling would go here if needed
  } else {
    throw new Error(`Unsupported signature scheme: ${signatureData.signatureScheme}`);
  }

  return `${signatureHex}${flag}${publicKey}`;
}

/**
 * Format number to wei (with decimals)
 * @param value Value to format
 * @param decimals Number of decimals (default 18)
 * @returns Formatted string
 */
export function formatNormalToWei(value: number | string, decimals = 18): string {
  const bn = new BigNumber(value);
  return bn.multipliedBy(new BigNumber(10).pow(decimals)).toFixed(0);
}

/**
 * Format number to BigNumber with wei precision
 * @param value Value to format
 * @param decimals Number of decimals (default 18)
 * @returns BigNumber instance
 */
export function formatNormalToWeiBN(value: number | string, decimals = 18): BigNumber {
  const bn = new BigNumber(value);
  return bn.multipliedBy(new BigNumber(10).pow(decimals));
}

/**
 * Format error to string
 * @param error Error object
 * @returns Error message string
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

