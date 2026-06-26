// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Initiate a Solana CCTP `depositForBurnWithCaller` that bridges USDC to the
 * DipCoin Sui Bank.
 *
 *   1. Derive the CCTP PDAs.
 *   2. Fetch + normalize Circle's on-chain Anchor IDLs.
 *   3. Build, sign (local keypair) and send the burn transaction.
 *
 * Once the Solana tx finalizes the SDK's work is done: the DipCoin backend
 * watches the CCTP event and completes the Sui-side `receive_message` /
 * `sweep_deposit_box` to credit the user's Bank. Poll
 * {@link waitSolanaCctpDeposit} for the resulting Sui digest.
 *
 * Faithful port of `ts-frontend/src/utils/cctp/solanaDepositForBurn.ts`
 * (wallet-adapter -> local keypair).
 */
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

import {
  SOLANA_CCTP_PROGRAMS,
  SOLANA_USDC_MINTS,
  SUI_DOMAIN,
  type CctpNetwork,
  cctpReceiveDestinationCaller,
  suiAddressToBytes32PublicKey,
} from "./config";
import { createAnchorProviderFromKeypair, normalizeLegacyAnchorIdl } from "./anchorWallet";

const { BN } = anchor;

type PdaResult = { publicKey: PublicKey; bump: number };

function findProgramAddress(
  label: string,
  programId: PublicKey,
  extraSeeds: (string | number[] | Buffer | PublicKey)[] = []
): PdaResult {
  const seeds: Buffer[] = [Buffer.from(label, "utf8")];
  for (const seed of extraSeeds) {
    if (typeof seed === "string") {
      seeds.push(Buffer.from(seed, "utf8"));
    } else if (Array.isArray(seed)) {
      seeds.push(Buffer.from(seed));
    } else if (Buffer.isBuffer(seed)) {
      seeds.push(seed);
    } else {
      seeds.push(seed.toBuffer());
    }
  }
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { publicKey, bump };
}

/** Equivalent of `getDepositForBurnPdas` in `examples/cctp/sol2sui.ts`. */
function getDepositForBurnPdas(
  messageTransmitterProgramId: PublicKey,
  tokenMessengerMinterProgramId: PublicKey,
  usdcMint: PublicKey,
  destinationDomain: number
) {
  return {
    messageTransmitterAccount: findProgramAddress("message_transmitter", messageTransmitterProgramId),
    tokenMessengerAccount: findProgramAddress("token_messenger", tokenMessengerMinterProgramId),
    tokenMinterAccount: findProgramAddress("token_minter", tokenMessengerMinterProgramId),
    localToken: findProgramAddress("local_token", tokenMessengerMinterProgramId, [usdcMint]),
    remoteTokenMessengerKey: findProgramAddress(
      "remote_token_messenger",
      tokenMessengerMinterProgramId,
      [destinationDomain.toString()]
    ),
    authorityPda: findProgramAddress("sender_authority", tokenMessengerMinterProgramId),
  };
}

type SolanaCctpPrograms = {
  messageTransmitterProgram: anchor.Program;
  tokenMessengerMinterProgram: anchor.Program;
};

// IDL fetch/normalize is a cold path; cache per <rpc, mt-id, ttm-id>.
const programCache = new Map<string, Promise<SolanaCctpPrograms>>();

async function loadSolanaCctpPrograms(provider: anchor.AnchorProvider): Promise<SolanaCctpPrograms> {
  const messageTransmitterProgramId = new PublicKey(SOLANA_CCTP_PROGRAMS.messageTransmitter);
  const tokenMessengerMinterProgramId = new PublicKey(SOLANA_CCTP_PROGRAMS.tokenMessengerMinter);
  const cacheKey = `${provider.connection.rpcEndpoint}|${messageTransmitterProgramId.toString()}|${tokenMessengerMinterProgramId.toString()}`;
  const cached = programCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const [mtIdl, ttmIdl] = await Promise.all([
      anchor.Program.fetchIdl(messageTransmitterProgramId, provider),
      anchor.Program.fetchIdl(tokenMessengerMinterProgramId, provider),
    ]);
    if (!mtIdl) {
      throw new Error(
        `IDL not found for MessageTransmitter program: ${messageTransmitterProgramId.toString()}`
      );
    }
    if (!ttmIdl) {
      throw new Error(
        `IDL not found for TokenMessengerMinter program: ${tokenMessengerMinterProgramId.toString()}`
      );
    }

    const mtNormalized = normalizeLegacyAnchorIdl(mtIdl, messageTransmitterProgramId);
    const ttmNormalized = normalizeLegacyAnchorIdl(ttmIdl, tokenMessengerMinterProgramId);

    return {
      messageTransmitterProgram: new anchor.Program(mtNormalized, provider),
      tokenMessengerMinterProgram: new anchor.Program(ttmNormalized, provider),
    };
  })();
  programCache.set(cacheKey, promise);
  promise.catch(() => programCache.delete(cacheKey));
  return promise;
}

export type DepositForBurnToSuiParams = {
  /** Solana RPC connection. */
  connection: Connection;
  /** Local Solana keypair holding the USDC (pays gas + event rent). */
  keypair: Keypair;
  /** CCTP network ("mainnet" / "testnet"). */
  network: CctpNetwork;
  /**
   * Latest business `packageId` (last entry of `packages` in
   * `main_contract.json`), used to compute
   * `destinationCaller = keccak256("{packageId}::cctp::CctpReceiveAuth")`.
   */
  packageId: string;
  /** Sui-side `CctpDepositBox` shared object id, used as the CCTP `mintRecipient`. */
  cctpDepositBoxId: string;
  /** USDC amount in min units (6 decimals; 1 USDC = 1_000_000). */
  amount: string | number | bigint;
  /** Optional USDC mint override (defaults per network). */
  usdcMint?: string;
  /** Optional burn token account override (defaults to owner's ATA). */
  burnTokenAccount?: PublicKey;
};

export type DepositForBurnToSuiResult = {
  /** Finalized Solana transaction hash (base58). */
  txHash: string;
  /** Destination domain written into the message (Sui = 8). */
  destinationDomain: number;
  /** mintRecipient written into the message (= depositBox 32 bytes). */
  mintRecipient: PublicKey;
  /** destinationCaller written into the message. */
  destinationCaller: PublicKey;
};

/**
 * Send a single Solana CCTP `depositForBurnWithCaller` that bridges USDC to the
 * DipCoin Sui Bank.
 */
export async function depositForBurnToSui(
  params: DepositForBurnToSuiParams
): Promise<DepositForBurnToSuiResult> {
  const {
    connection,
    keypair,
    network,
    packageId,
    cctpDepositBoxId,
    amount,
    usdcMint: usdcMintOverride,
    burnTokenAccount: burnTokenAccountOverride,
  } = params;

  const owner = keypair.publicKey;
  const usdcMint = new PublicKey(usdcMintOverride ?? SOLANA_USDC_MINTS[network]);
  const burnTokenAccount = burnTokenAccountOverride ?? getAssociatedTokenAddressSync(usdcMint, owner);

  const mintRecipient = suiAddressToBytes32PublicKey(cctpDepositBoxId);
  const destinationCaller = suiAddressToBytes32PublicKey(cctpReceiveDestinationCaller(packageId));

  const provider = createAnchorProviderFromKeypair(connection, keypair);
  const { messageTransmitterProgram, tokenMessengerMinterProgram } =
    await loadSolanaCctpPrograms(provider);

  const destinationDomain = SUI_DOMAIN;
  const pdas = getDepositForBurnPdas(
    messageTransmitterProgram.programId,
    tokenMessengerMinterProgram.programId,
    usdcMint,
    destinationDomain
  );

  // CCTP requires a fresh one-time account to carry the `MessageSent` event.
  const messageSentEventAccount = Keypair.generate();
  const amountBN = new BN(amount.toString());

  const txHash: string = await tokenMessengerMinterProgram.methods
    .depositForBurnWithCaller({
      amount: amountBN,
      destinationDomain,
      mintRecipient,
      destinationCaller,
    })
    .accounts({
      owner,
      eventRentPayer: owner,
      senderAuthorityPda: pdas.authorityPda.publicKey,
      burnTokenAccount,
      messageTransmitter: pdas.messageTransmitterAccount.publicKey,
      tokenMessenger: pdas.tokenMessengerAccount.publicKey,
      remoteTokenMessenger: pdas.remoteTokenMessengerKey.publicKey,
      tokenMinter: pdas.tokenMinterAccount.publicKey,
      localToken: pdas.localToken.publicKey,
      burnTokenMint: usdcMint,
      messageTransmitterProgram: messageTransmitterProgram.programId,
      tokenMessengerMinterProgram: tokenMessengerMinterProgram.programId,
      messageSentEventData: messageSentEventAccount.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([messageSentEventAccount])
    .rpc();

  return { txHash, destinationDomain, mintRecipient, destinationCaller };
}
