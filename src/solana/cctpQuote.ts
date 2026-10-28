// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * CCTP V2 quote + Solana fee-payer.
 * Mirrors `ts-frontend/src/services/cctp.ts` and `privyRelayer.getSolanaSponsorFeePayer`.
 *
 * Burn parameters (mintRecipient, destinationCaller, maxFee, finality) come from
 * the deposit quote. Program accounts (MessageTransmitter, USDC mint) come from
 * fee-payer. Neither is computed in the SDK.
 */
import { API_ENDPOINTS } from "../constants";
import type { HttpClient } from "../services/httpClient";

export type CctpTransferMode = "STANDARD" | "FAST";

export interface CctpDepositQuote {
  quoteId: string;
  expiresAt: number;
  transactionFee: string;
  estimatedReceive: string;
  /** USDC min units to burn. */
  amount: string;
  maxFee: string;
  minFinalityThreshold: number;
  destinationDomain: number;
  mintRecipient: string;
  destinationCaller: string;
  sourceChainId: number;
  transferMode: CctpTransferMode;
}

export interface CctpWithdrawQuote {
  quoteId: string;
  expiresAt: number;
  transactionFee: string;
  estimatedReceive: string;
  bankId: string;
  coinType: string;
  walletAddress: string;
  tokenAccount: string;
  amount: string;
}

export interface SolanaFeePayer {
  feePayer: string;
  usdcMint: string;
  mintRecipient: string;
  destinationCaller: string;
  destinationDomain: number;
  maxFee: string | number;
  minFinalityThreshold: number;
  messageTransmitterProgram: string;
}

function asText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function unwrap<T>(res: any, fallback: string): T {
  if (res?.code !== undefined && res.code !== 200) {
    throw new Error(res.message || fallback);
  }
  const data = res?.data ?? res;
  if (!data || typeof data !== "object") {
    throw new Error(fallback);
  }
  return data as T;
}

export async function getCctpDepositQuote(
  http: HttpClient,
  params: { sourceChainId: number; amount: string; transferMode: CctpTransferMode }
): Promise<CctpDepositQuote> {
  const raw = unwrap<Record<string, unknown>>(
    await http.get(API_ENDPOINTS.CCTP_DEPOSIT_QUOTE, { params }),
    "Deposit quote failed"
  );
  const quote: CctpDepositQuote = {
    quoteId: asText(raw.quoteId),
    expiresAt: Number(raw.expiresAt),
    transactionFee: asText(raw.transactionFee),
    estimatedReceive: asText(raw.estimatedReceive),
    amount: asText(raw.amount),
    maxFee: asText(raw.maxFee),
    minFinalityThreshold: Number(raw.minFinalityThreshold),
    destinationDomain: Number(raw.destinationDomain),
    mintRecipient: asText(raw.mintRecipient),
    destinationCaller: asText(raw.destinationCaller),
    sourceChainId: Number(raw.sourceChainId ?? params.sourceChainId),
    transferMode: (asText(raw.transferMode) || params.transferMode) as CctpTransferMode,
  };
  if (
    !quote.quoteId ||
    !quote.mintRecipient ||
    !quote.destinationCaller ||
    !quote.amount ||
    !Number.isFinite(quote.minFinalityThreshold) ||
    !Number.isFinite(quote.destinationDomain)
  ) {
    throw new Error("Deposit quote is missing CCTP V2 fields.");
  }
  return quote;
}

export function assertDepositQuoteFresh(quote: { expiresAt: number }): void {
  if (!(quote.expiresAt > Date.now())) {
    throw new Error("Deposit quote expired. Request a new quote and retry.");
  }
}

export async function submitCctpDeposit(
  http: HttpClient,
  body: { sourceChainId: number; txHash: string }
): Promise<void> {
  await http.post(API_ENDPOINTS.CCTP_DEPOSIT_SUBMIT, body).catch(() => undefined);
}

export async function getSolanaFeePayer(http: HttpClient): Promise<SolanaFeePayer> {
  const raw = unwrap<SolanaFeePayer>(
    await http.get(API_ENDPOINTS.SOLANA_FEE_PAYER),
    "Failed to get Solana fee payer"
  );
  if (!raw.messageTransmitterProgram?.trim() || !raw.usdcMint?.trim()) {
    throw new Error("Solana fee-payer response is missing program accounts.");
  }
  return raw;
}

function coinTypeForSign(coinType: string): string {
  const parts = coinType.split("::");
  if (!parts[0]) return coinType;
  const address = parts[0].startsWith("0x") ? parts[0] : `0x${parts[0]}`;
  return [address, ...parts.slice(1)].join("::");
}

export async function getCctpWithdrawQuote(
  http: HttpClient,
  params: { targetChainId: number; amount: string }
): Promise<CctpWithdrawQuote> {
  const raw = unwrap<Record<string, unknown>>(
    await http.get(API_ENDPOINTS.CCTP_WITHDRAW_QUOTE, { params }),
    "Withdraw quote failed"
  );
  const quote: CctpWithdrawQuote = {
    quoteId: asText(raw.quoteId),
    expiresAt: Number(raw.expiresAt),
    transactionFee: asText(raw.transactionFee),
    estimatedReceive: asText(raw.estimatedReceive),
    bankId: asText(raw.bankId),
    coinType: coinTypeForSign(asText(raw.coinType)),
    walletAddress: asText(raw.walletAddress),
    tokenAccount: asText(raw.tokenAccount),
    amount: asText(raw.amount),
  };
  if (!quote.quoteId || !quote.bankId || !quote.coinType || !quote.walletAddress || !quote.tokenAccount) {
    throw new Error("Withdraw quote is missing CCTP fields.");
  }
  if (!(quote.expiresAt > Date.now())) {
    throw new Error("Withdraw quote expired. Request a new quote and retry.");
  }
  return quote;
}
