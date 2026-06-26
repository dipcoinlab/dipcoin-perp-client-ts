// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * `/api/perp-relayer/v1/relay` client + on-chain address helpers.
 *
 * Non-Sui wallets (Solana) cannot pay Sui gas, so signed payloads are submitted
 * to the DipCoin relayer which executes them on Sui. Faithful port of
 * `ts-frontend/src/services/relay.ts` (decoupled from the dApp store).
 */
import { PublicKey } from "@solana/web3.js";
import { UnifiedAddressChainId } from "@dipcoinlab/perp-ts-library";
import { API_ENDPOINTS } from "../constants";
import type { HttpClient, PerpRequestConfig } from "../services/httpClient";

/** Relay action names (must match payload.move / the relayer contract). */
export type RelayAction =
  | "AddMargin"
  | "RemoveMargin"
  | "SetSubAccount"
  | "Withdraw"
  | "AdjustLeverage"
  | "ClosePosition"
  | "CancelOrder"
  | "VaultCreate"
  | "VaultDeposit"
  | "VaultRequestWithdraw"
  | "VaultClaimClosedFunds"
  | "VaultSetTrader"
  | "VaultSetSubTrader"
  | "VaultSetDepositStatus"
  | "VaultSetMaxCap"
  | "VaultSetFollowerMaxCap"
  | "VaultSetMinDepositAmount"
  | "VaultSetAutoCloseOnWithdraw"
  | "VaultClose";

/** 0 = Sui, 1 = EVM, 2 = Solana (aligns with UnifiedAddressChainId). */
export type RelayChainId = 0 | 1 | 2;

export interface RelayUser {
  chainId: RelayChainId;
  /** hex (Sui 32B / Solana 32B / EVM 20B). */
  rawAddress: string;
}

export interface RelayRequest<TParams = Record<string, unknown>> {
  action: RelayAction;
  user: RelayUser;
  params: TParams;
  /** hex + trailing scheme flag (Solana = 5). */
  signature: string;
  publicKey: string;
}

export interface RelayResponse {
  code?: number;
  message?: string;
  data?: { digest?: string; txDigest?: string; [key: string]: unknown };
  txDigest?: string;
}

/** Any raw address -> the relayer's `{ chainId, rawAddress(hex) }` shape. */
export function toRelayUser(chain: "sui" | "solana", address: string): RelayUser {
  const trimmed = address.trim();

  if (chain === "solana") {
    const raw = trimmed.startsWith("Solana:") ? trimmed.slice("Solana:".length) : trimmed;
    const bytes = new PublicKey(raw).toBytes();
    return {
      chainId: UnifiedAddressChainId.Solana as RelayChainId,
      rawAddress: Buffer.from(bytes).toString("hex"),
    };
  }

  let hex = trimmed.startsWith("Sui:") ? trimmed.slice("Sui:".length) : trimmed;
  hex = hex.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  return {
    chainId: UnifiedAddressChainId.Sui as RelayChainId,
    rawAddress: hex,
  };
}

/** Wallet signature -> relayer's unified `0x` hex. */
function toRelaySignature(signature: string): string {
  const t = signature.trim();
  return (t.startsWith("0x") || t.startsWith("0X") ? t : `0x${t}`).toLowerCase();
}

/** publicKey may be base64 / bare hex / `0x`-prefixed -> unified `0x` hex. */
function toRelayPublicKey(publicKey: string): string {
  const t = publicKey.trim();
  if (t.startsWith("0x") || t.startsWith("0X")) return t.toLowerCase();
  if (/^[0-9a-fA-F]+$/.test(t) && t.length === 64) return `0x${t.toLowerCase()}`;
  return `0x${Buffer.from(t, "base64").toString("hex")}`;
}

function parseAbortErrorCode(message?: string): number | undefined {
  if (!message) return undefined;
  const match = message.match(/\(\s*code\s+(\d+)\s*\)/i);
  return match ? Number(match[1]) : undefined;
}

function resolveRelayErrorMessage(res: RelayResponse): string {
  const code = parseAbortErrorCode(res?.message);
  if (code !== undefined) {
    return `${res?.message || "Relay request failed"} (code ${code})`;
  }
  return res?.message || "Relay request failed";
}

/** Submit a signed payload to the relayer. Throws on non-200 relay responses. */
export async function postRelay<TParams>(
  httpClient: HttpClient,
  body: RelayRequest<TParams>,
  config?: PerpRequestConfig
): Promise<RelayResponse> {
  const res = (await httpClient.post(
    API_ENDPOINTS.RELAY,
    {
      ...body,
      signature: toRelaySignature(body.signature),
      publicKey: toRelayPublicKey(body.publicKey),
    },
    config
  )) as unknown as RelayResponse;

  if (res?.code !== undefined && res.code !== 200) {
    throw new Error(resolveRelayErrorMessage(res));
  }
  return res;
}

/** Extract the Sui tx digest from a successful relay response. */
export function extractRelayTxDigest(res: RelayResponse): string | undefined {
  return res.data?.digest ?? res.data?.txDigest ?? res.txDigest;
}
