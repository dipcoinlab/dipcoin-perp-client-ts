// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Solana CCTP V2 `depositForBurn`.
 *
 * Account layout matches TokenMessengerMinterV2 and
 * `ts-frontend/src/utils/cctp/solanaDepositForBurn.ts`:
 * 18 accounts, the 5th is `denylist_account`.
 * The user keypair signs directly. Sui receive is done by the relayer.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

import { SOLANA_TOKEN_MESSENGER_MINTER_V2, SUI_DOMAIN, suiAddressToBytes32PublicKey } from "./config";
import type { CctpDepositQuote, SolanaFeePayer } from "./cctpQuote";
import { assertDepositQuoteFresh } from "./cctpQuote";

const DEPOSIT_FOR_BURN_DISCRIMINATOR = Buffer.from([215, 60, 61, 46, 114, 55, 128, 176]);

type PdaResult = { publicKey: PublicKey; bump: number };

function findProgramAddress(
  label: string,
  programId: PublicKey,
  extraSeeds: (string | number[] | Buffer | PublicKey)[] = []
): PdaResult {
  const seeds: Buffer[] = [Buffer.from(label, "utf8")];
  for (const seed of extraSeeds) {
    if (typeof seed === "string") seeds.push(Buffer.from(seed, "utf8"));
    else if (Array.isArray(seed)) seeds.push(Buffer.from(seed));
    else if (Buffer.isBuffer(seed)) seeds.push(seed);
    else seeds.push(seed.toBuffer());
  }
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { publicKey, bump };
}

export type DepositForBurnToSuiParams = {
  connection: Connection;
  /** Solana keypair that holds the USDC and pays gas. */
  keypair: Keypair;
  quote: CctpDepositQuote;
  feePayer: SolanaFeePayer;
  usdcMintFallback: string;
  burnTokenAccount?: PublicKey;
};

export type DepositForBurnToSuiResult = {
  txHash: string;
  destinationDomain: number;
  mintRecipient: PublicKey;
  destinationCaller: PublicKey;
};

function encodeDepositForBurnData(opts: {
  amount: bigint;
  destinationDomain: number;
  mintRecipient: PublicKey;
  destinationCaller: PublicKey;
  maxFee: bigint;
  minFinalityThreshold: number;
}): Buffer {
  const data = Buffer.alloc(8 + 8 + 4 + 32 + 32 + 8 + 4);
  let offset = 0;
  DEPOSIT_FOR_BURN_DISCRIMINATOR.copy(data, offset);
  offset += 8;
  data.writeBigUInt64LE(opts.amount, offset);
  offset += 8;
  data.writeUInt32LE(opts.destinationDomain, offset);
  offset += 4;
  opts.mintRecipient.toBuffer().copy(data, offset);
  offset += 32;
  opts.destinationCaller.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(opts.maxFee, offset);
  offset += 8;
  data.writeUInt32LE(opts.minFinalityThreshold, offset);
  return data;
}

/**
 * Send CCTP V2 `depositForBurn`. Quote fields override the fee-payer defaults
 * for amount, fee, finality, mintRecipient and destinationCaller.
 */
export async function depositForBurnToSui(
  params: DepositForBurnToSuiParams
): Promise<DepositForBurnToSuiResult> {
  const { connection, keypair, quote, feePayer } = params;
  assertDepositQuoteFresh(quote);

  const owner = keypair.publicKey;
  const messageTransmitterProgramId = new PublicKey(feePayer.messageTransmitterProgram.trim());
  const tokenMessengerMinterProgramId = new PublicKey(SOLANA_TOKEN_MESSENGER_MINTER_V2);
  const usdcMint = new PublicKey(feePayer.usdcMint?.trim() || params.usdcMintFallback);
  const destinationDomain = quote.destinationDomain || feePayer.destinationDomain || SUI_DOMAIN;
  const mintRecipient = suiAddressToBytes32PublicKey(quote.mintRecipient);
  const destinationCaller = suiAddressToBytes32PublicKey(quote.destinationCaller);
  const burnTokenAccount =
    params.burnTokenAccount ?? getAssociatedTokenAddressSync(usdcMint, owner);

  const pdas = {
    messageTransmitterAccount: findProgramAddress("message_transmitter", messageTransmitterProgramId),
    tokenMessengerAccount: findProgramAddress("token_messenger", tokenMessengerMinterProgramId),
    tokenMinterAccount: findProgramAddress("token_minter", tokenMessengerMinterProgramId),
    localToken: findProgramAddress("local_token", tokenMessengerMinterProgramId, [usdcMint]),
    remoteTokenMessengerKey: findProgramAddress("remote_token_messenger", tokenMessengerMinterProgramId, [
      String(destinationDomain),
    ]),
    authorityPda: findProgramAddress("sender_authority", tokenMessengerMinterProgramId),
    denylist: findProgramAddress("denylist_account", tokenMessengerMinterProgramId, [owner]),
    eventAuthority: findProgramAddress("__event_authority", tokenMessengerMinterProgramId),
  };

  const messageSentEventAccount = Keypair.generate();
  const readonly = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });
  const writable = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: true });
  const signer = (pubkey: PublicKey) => ({ pubkey, isSigner: true, isWritable: true });

  const ix = new TransactionInstruction({
    programId: tokenMessengerMinterProgramId,
    data: encodeDepositForBurnData({
      amount: BigInt(quote.amount),
      destinationDomain,
      mintRecipient,
      destinationCaller,
      maxFee: BigInt(quote.maxFee),
      minFinalityThreshold: quote.minFinalityThreshold,
    }),
    keys: [
      signer(owner),
      signer(owner),
      readonly(pdas.authorityPda.publicKey),
      writable(burnTokenAccount),
      readonly(pdas.denylist.publicKey),
      writable(pdas.messageTransmitterAccount.publicKey),
      readonly(pdas.tokenMessengerAccount.publicKey),
      readonly(pdas.remoteTokenMessengerKey.publicKey),
      readonly(pdas.tokenMinterAccount.publicKey),
      writable(pdas.localToken.publicKey),
      writable(usdcMint),
      signer(messageSentEventAccount.publicKey),
      readonly(messageTransmitterProgramId),
      readonly(tokenMessengerMinterProgramId),
      readonly(TOKEN_PROGRAM_ID),
      readonly(SystemProgram.programId),
      readonly(pdas.eventAuthority.publicKey),
      readonly(tokenMessengerMinterProgramId),
    ],
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = owner;
  tx.partialSign(messageSentEventAccount, keypair);

  assertDepositQuoteFresh(quote);
  const txHash = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 5,
  });
  await confirmDepositSignature(connection, txHash, blockhash, lastValidBlockHeight);

  return { txHash, destinationDomain, mintRecipient, destinationCaller };
}

async function confirmDepositSignature(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<void> {
  try {
    const res = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    if (res.value.err) {
      throw new Error(`Solana deposit transaction failed on-chain: ${JSON.stringify(res.value.err)}`);
    }
  } catch (err) {
    const status = await connection
      .getSignatureStatus(signature, { searchTransactionHistory: true })
      .catch(() => null);
    const value = status?.value;
    if (value?.err) {
      throw new Error(`Solana deposit transaction failed on-chain: ${JSON.stringify(value.err)}`);
    }
    if (value?.confirmationStatus) return;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Solana deposit was not confirmed (signature ${signature}). ${message}`
    );
  }
}
