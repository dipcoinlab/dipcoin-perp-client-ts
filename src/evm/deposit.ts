// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * EVM CCTP V2 burn: approve USDC if needed, then TokenMessengerV2.depositForBurn.
 * Quote supplies mintRecipient, destinationCaller, maxFee, and finality.
 */
import { Contract, JsonRpcProvider, Wallet, zeroPadValue } from "ethers";
import type { EvmChainConfig } from "./chains";
import type { CctpDepositQuote } from "../solana/cctpQuote";
import { assertDepositQuoteFresh } from "../solana/cctpQuote";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];
const BURN_ABI = [
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
];

function toBytes32(hexAddress: string): string {
  const raw = hexAddress.trim().replace(/^Sui:/i, "");
  const value = raw.startsWith("0x") ? raw : `0x${raw}`;
  return zeroPadValue(value, 32);
}

export function connectEvmWallet(privateKey: string, chain: EvmChainConfig): Wallet {
  const provider = new JsonRpcProvider(chain.rpcUrl, chain.networkId);
  return new Wallet(privateKey, provider);
}

export async function depositEvmUsdcForBurn(opts: {
  wallet: Wallet;
  chain: EvmChainConfig;
  quote: CctpDepositQuote;
}): Promise<string> {
  const amount = BigInt(opts.quote.amount);
  if (amount <= 0n) throw new Error("Invalid deposit amount");
  const destinationCaller = toBytes32(opts.quote.destinationCaller);
  if (BigInt(destinationCaller) === 0n) {
    throw new Error("destinationCaller must not be the zero address");
  }

  const usdc = new Contract(opts.chain.usdc, ERC20_ABI, opts.wallet);
  const allowance = (await usdc.allowance(opts.wallet.address, opts.chain.tokenMessengerV2)) as bigint;
  if (allowance < amount) {
    const approveTx = await usdc.approve(opts.chain.tokenMessengerV2, amount);
    const approveReceipt = await approveTx.wait();
    if (approveReceipt?.status !== 1) {
      throw new Error(`USDC approval failed: ${approveTx.hash}`);
    }
  }

  assertDepositQuoteFresh(opts.quote);
  const messenger = new Contract(opts.chain.tokenMessengerV2, BURN_ABI, opts.wallet);
  const burnTx = await messenger.depositForBurn(
    amount,
    opts.quote.destinationDomain,
    toBytes32(opts.quote.mintRecipient),
    opts.chain.usdc,
    destinationCaller,
    BigInt(opts.quote.maxFee),
    opts.quote.minFinalityThreshold
  );
  const receipt = await burnTx.wait();
  if (receipt?.status !== 1) {
    throw new Error(`EVM depositForBurn failed: ${burnTx.hash}`);
  }
  return burnTx.hash as string;
}
