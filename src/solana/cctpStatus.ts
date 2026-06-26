// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Poll the DipCoin relayer for Solana CCTP completion status.
 *  - deposit: Solana burn tx -> Sui receive/sweep digest
 *  - withdraw: Sui burn tx -> Solana mint/receive tx
 *
 * Port of `ts-frontend/src/services/cctp.ts`.
 */
import { API_ENDPOINTS } from "../constants";
import type { HttpClient } from "../services/httpClient";

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface CctpStatusPollOptions {
  /** Poll interval in ms (default 3000). */
  intervalMs?: number;
  /** Overall timeout in ms (default 300000). */
  timeoutMs?: number;
  /** Return truthy to abort the polling loop early. */
  shouldAbort?: () => boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollStatus(
  httpClient: HttpClient,
  url: string,
  txHash: string,
  pickResult: (data: any) => string | undefined,
  options?: CctpStatusPollOptions
): Promise<string> {
  const interval = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (options?.shouldAbort?.()) {
      throw new Error("CCTP status polling aborted.");
    }
    try {
      const resp: any = await httpClient.get(url, {
        params: { txHash },
        publicEndpoint: true,
      });
      const data = resp?.data ?? resp;
      const status = String(data?.status ?? data?.state ?? "").toLowerCase();
      const failed = status === "failed" || status === "error" || data?.success === false;
      if (failed) {
        throw new Error(data?.message || data?.error || "CCTP transfer failed.");
      }
      const result = pickResult(data);
      if (result) return result;
    } catch (err) {
      // Transient network/5xx errors: keep polling until timeout.
      if (err instanceof Error && /CCTP transfer failed/.test(err.message)) {
        throw err;
      }
    }
    await sleep(interval);
  }
  throw new Error("Timed out waiting for CCTP transfer to complete.");
}

/** Wait for a Solana deposit to be credited on Sui; resolves with the Sui digest. */
export async function waitSolanaCctpDeposit(
  httpClient: HttpClient,
  solanaTxHash: string,
  options?: CctpStatusPollOptions
): Promise<string> {
  return pollStatus(
    httpClient,
    API_ENDPOINTS.CCTP_DEPOSIT_STATUS,
    solanaTxHash,
    (data) => data?.suiReceiveTxHash ?? data?.suiTxHash ?? data?.digest ?? data?.txHash,
    options
  );
}

/** Wait for a Sui withdraw to be minted on Solana; resolves with the Solana tx hash. */
export async function waitSolanaCctpWithdraw(
  httpClient: HttpClient,
  suiTxHash: string,
  options?: CctpStatusPollOptions
): Promise<string> {
  return pollStatus(
    httpClient,
    API_ENDPOINTS.CCTP_WITHDRAW_STATUS,
    suiTxHash,
    (data) => data?.solReceiveTxHash ?? data?.solTxHash ?? data?.txHash,
    options
  );
}
