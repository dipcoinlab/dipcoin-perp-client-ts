# Usage

Runnable demo: `npm run example` (`examples/index.ts`).

Trading and on-chain steps are off unless the matching `RUN_*` flag is `1`.
Read-only market data runs by default (`RUN_MARKET_DATA=1`).

## Required

| Variable | Purpose |
| --- | --- |
| `PRIVATE_KEY` | Sui private key. Required when `CHAIN=sui` (the default). |
| `SOLANA_PRIVATE_KEY` | Solana key (base58, hex, or JSON bytes). Required when `CHAIN=solana`. Falls back to `PRIVATE_KEY`. |
| `NETWORK` | `testnet` (default) or `mainnet`. |

## Flags

| Flag | What it does | Default |
| --- | --- | --- |
| `RUN_DEPOSIT` / `DEPOSIT_AMOUNT` | Sui wallet → Bank | off / `10` |
| `RUN_WITHDRAW` / `WITHDRAW_AMOUNT` | Bank → Sui wallet | off / `5` |
| `RUN_MARKET_ORDER` | Market order | off |
| `RUN_LIMIT_ORDER` | Limit order (`LIMIT_ORDER_PRICE`) | off |
| `RUN_CANCEL_ORDER` | Cancel the first open order | off |
| `RUN_MARKET_DATA` | Order book and ticker | on |
| `RUN_ADJUST_LEVERAGE` | Preferred leverage (`MARGIN_TARGET_LEVERAGE`, `MARGIN_TYPE`) | off |
| `RUN_MARGIN_ADD` / `RUN_MARGIN_REMOVE` | Isolated margin | off |
| `RUN_TPSL_DEMO` / `RUN_TPSL_EDIT` | Position TP/SL | off |
| `CHAIN=solana` | Solana signer | `sui` |
| `RUN_SOLANA_DEPOSIT` / `SOLANA_DEPOSIT_AMOUNT` | CCTP V2 deposit into the Sui Bank | off / `10` |
| `RUN_SOLANA_WITHDRAW` / `SOLANA_WITHDRAW_AMOUNT` | Quoted withdraw back to Solana | off / `5` |

Order size, side, and leverage use `MARKET_ORDER_*` and `LIMIT_ORDER_*`.
Symbol defaults to `DEMO_SYMBOL=BTC-PERP`.

## Solana CCTP V2

`depositToBankFromSolana` does not use `main_contract.json`'s old `CctpDepositBox`.

1. `GET /api/perp-relayer/v1/cctp/deposit/quote` supplies `mintRecipient`, `destinationCaller`, `maxFee`, and `minFinalityThreshold`.
2. `GET /api/perp-relayer/v1/sponsor/solana/fee-payer` supplies the MessageTransmitter program and USDC mint.
3. The SDK sends TokenMessengerMinterV2 `depositForBurn` from the Solana key.
4. It registers the burn and polls `/cctp/deposit/status` until the Bank is credited.

`withdrawFromBankToSolana` loads `/cctp/withdraw/quote`, signs `Payload.withdrawal_solana` for the quoted bank and token account, and puts `quoteId` on the relay request only. The signed amount is the amount you asked to withdraw.

## EVM chains

`chain: "evm"` plus `evmChain` covers Ethereum, Arbitrum, OP Mainnet, Base, and Polygon.
The same address on each chain is a separate Bank account. Deposit and withdraw must use that same chain.
Polygon has no Fast transfer.

```typescript
const sdk = initDipCoinPerpSDK(process.env.EVM_PRIVATE_KEY!, {
  chain: "evm",
  evmChain: "base",
  network: "testnet",
});
await sdk.depositToBankFromEvm({ amount: 10, transferMode: "STANDARD" });
await sdk.withdrawFromBankToEvm({ amount: 5 });
```

Example flags: `CHAIN=evm`, `EVM_CHAIN=base`, `EVM_PRIVATE_KEY`, `RUN_EVM_DEPOSIT`, `RUN_EVM_WITHDRAW`.

`transferMode` is `STANDARD` unless you pass `FAST`:

```typescript
await sdk.depositToBankFromSolana({ amount: 10, transferMode: "FAST" });
```

Standard does not charge a Circle protocol fee. Fast uses the fee in the quote. A withdraw whose estimated receive is not positive is rejected before signing.

## Leverage only

```bash
RUN_MARKET_DATA=0 npm run example
MARGIN_SYMBOL=ETH-PERP RUN_ADJUST_LEVERAGE=1 MARGIN_TARGET_LEVERAGE=12 MARGIN_TYPE=ISOLATED npm run example
```

Keep `NETWORK=testnet` until the account and amounts are the ones you mean to use.
