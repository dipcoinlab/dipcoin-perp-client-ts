// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * SDK Configuration Interface
 */
export interface DipCoinPerpSDKOptions {
  /** API base URL for perp trading */
  apiBaseUrl: string;
  /** Network type, either mainnet or testnet */
  network: "mainnet" | "testnet";
  /** Optional custom RPC endpoint for Sui */
  customRpc?: string;
}

/**
 * Order side (BUY or SELL)
 */
export enum OrderSide {
  BUY = "BUY",
  SELL = "SELL",
}

/**
 * Trading pair information
 */
export interface TradingPair {
  symbol: string;
  perpId: string; // PerpetualID
  coinName?: string;
  maxLeverage?: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Trading pairs response
 */
export interface TradingPairsResponse {
  code: number;
  data: TradingPair[];
  message?: string;
}

/**
 * User configuration (preferred leverage, margin type, etc.)
 */
export interface UserConfig {
  /** Trading symbol the config applies to */
  symbol: string;
  /** Preferred leverage in normal units (human-readable) */
  leverage: string;
  /** Margin type, e.g. ISOLATED or CROSS */
  marginType?: string;
  /** Raw leverage value returned by backend (wei string) */
  leverageWei?: string;
  /** Other backend specific fields */
  [key: string]: any;
}

/**
 * Order type (MARKET or LIMIT)
 */
export enum OrderType {
  MARKET = "MARKET",
  LIMIT = "LIMIT",
}

/**
 * Parameters for placing an order
 */
export interface PlaceOrderParams {
  /** Trading symbol (e.g., "BTC-PERP") */
  symbol: string;
  /** Order side: BUY or SELL */
  side: OrderSide;
  /** Order type: MARKET or LIMIT */
  orderType: OrderType;
  /** Order quantity */
  quantity: number | string;
  /** Order price (required for LIMIT orders) */
  price?: number | string;
  /** Leverage multiplier */
  leverage: number | string;
  /** Market ID (PerpetualID) - REQUIRED. This is the PerpetualID for the trading pair (e.g., "0xc1b1cf3d774bcfcbd6d71158a4259f2d99fccbf64ffc34f32700f8a771587d99") */
  market: string;
  /** Reduce only flag - order will only reduce position, not increase */
  reduceOnly?: boolean;
  /** Client order ID for tracking */
  clientId?: string;
  /** Take profit trigger price */
  tpTriggerPrice?: number | string;
  /** Take profit order type */
  tpOrderType?: OrderType;
  /** Take profit order price */
  tpOrderPrice?: number | string;
  /** Stop loss trigger price */
  slTriggerPrice?: number | string;
  /** Stop loss order type */
  slOrderType?: OrderType;
  /** Stop loss order price */
  slOrderPrice?: number | string;
}

/**
 * Parameters for canceling an order
 */
export interface CancelOrderParams {
  /** Trading symbol */
  symbol: string;
  /** Array of order hashes to cancel */
  orderHashes: string[];
  /** Parent address (optional, defaults to wallet address) */
  parentAddress?: string;
}

/**
 * Parameters for adjusting preferred leverage on server
 */
export interface AdjustLeverageParams {
  /** Trading symbol */
  symbol: string;
  /** Desired leverage in normal units (e.g. 5 means 5x) */
  leverage: number | string;
  /** Margin type (defaults to ISOLATED to match frontend) */
  marginType?: string;
}

/**
 * Account information
 */
export interface AccountInfo {
  /** Wallet balance in USDC */
  walletBalance: string;
  /** Total unrealized profit/loss */
  totalUnrealizedProfit: string;
  /** Account value */
  accountValue: string;
  /** Free collateral available for trading */
  freeCollateral: string;
  /** Total margin used */
  totalMargin: string;
}

/**
 * Position data
 */
export interface Position {
  /** Position ID */
  id?: string;
  positionId?: string;
  /** User address */
  userAddress: string;
  /** Trading symbol */
  symbol: string;
  /** Average entry price */
  avgEntryPrice: string;
  /** Margin amount */
  margin: string;
  /** Leverage */
  leverage: string;
  /** Position quantity */
  quantity: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Selected leverage for position */
  positionSelectedLeverage: string;
  /** Margin type */
  marginType: string;
  /** Oracle price */
  oraclePrice: string;
  /** Mid market price */
  midMarketPrice: string;
  /** Liquidation price */
  liquidationPrice: string;
  /** Position side (LONG or SHORT) */
  side: string;
  /** Position value */
  positionValue: string;
  /** Unrealized profit/loss */
  unrealizedProfit: string;
  /** Return on equity */
  roe: string;
  /** Funding due */
  fundingDue: string;
  /** Next funding fee */
  fundingFeeNext: string;
  /** Settlement funding fee */
  settlementFundingFee: string;
  /** Net margin */
  netMargin: string;
  /** Is delisted */
  isDeliste: number;
  /** Is long position */
  isLong: boolean;
  /** Unrealized PnL */
  unrealizedPnL: string;
  /** Liquidation price (alias) */
  liqPrice: string;
  /** Funding */
  funding: string;
  /** Reducible position quantity */
  positionQtyReducible: string;
  /** Take profit price */
  tpPrice?: string;
  /** Stop loss price */
  slPrice?: string;
  /** TP/SL order count */
  tpslNum?: number;
}

/**
 * Open order data
 */
export interface OpenOrder {
  /** Order hash */
  hash: string;
  /** Trading symbol */
  symbol: string;
  /** Order side */
  side: string;
  /** Order type */
  orderType: string;
  /** Order price */
  price: string;
  /** Order quantity */
  quantity: string;
  /** Filled quantity */
  filledQty: string;
  /** Leverage */
  leverage: string;
  /** Order status */
  status: string;
  /** Creation timestamp */
  createdAt: number;
  /** Update timestamp */
  updatedAt: number;
  /** Is long */
  isLong: boolean;
  /** Reduce only flag */
  reduceOnly: boolean;
}

/**
 * Generic SDK response wrapper
 */
export interface SDKResponse<T = any> {
  /** Operation success status */
  status: boolean;
  /** Response data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
}

/**
 * API response structure
 */
export interface ApiResponse<T = any> {
  /** Response code */
  code: number;
  /** Response data */
  data: T;
  /** Response message */
  message?: string;
}

/**
 * Order response
 */
export interface OrderResponse {
  /** Response code */
  code: number;
  /** Response data */
  data?: any;
  /** Response message */
  message?: string;
}

/**
 * Account info response data
 */
export interface AccountInfoResponse {
  walletBalance: string;
  totalUnrealizedProfit: string;
  accountValue: string;
  freeCollateral: string;
  totalMargin?: string;
}

/**
 * Positions list response
 */
export interface PositionsResponse {
  data: Position[];
  pageNum?: number;
  pageSize?: number;
  total?: number;
}

/**
 * Open orders list response
 */
export interface OpenOrdersResponse {
  data: OpenOrder[];
  pageNum?: number;
  pageSize?: number;
  total?: number;
}

/**
 * Margin adjustment payload for on-chain operations
 */
export interface MarginAdjustmentParams {
  /** Amount of USDC margin to add/remove (in normal units) */
  amount: number | string;
  /** Trading symbol (alias for market) */
  symbol?: string;
  /** Market symbol, e.g. BTC-PERP */
  market?: string;
  /** Optional PerpetualID (if already known) */
  perpId?: string;
  /** Override account address (defaults to SDK wallet) */
  accountAddress?: string;
  /** Optional sub account table ID */
  subAccountsMapId?: string;
  /** Optional gas budget for transaction */
  gasBudget?: number;
  /** Optional tx hash tag */
  txHash?: string;
}

/**
 * Order book entry (price and quantity)
 */
export interface OrderBookEntry {
  /** Price level */
  price: string;
  /** Quantity at this price level */
  quantity: string;
}

/**
 * Order book data
 */
export interface OrderBook {
  /** Buy orders (bids) - sorted from highest to lowest price */
  bids: OrderBookEntry[];
  /** Sell orders (asks) - sorted from lowest to highest price */
  asks: OrderBookEntry[];
  /** Optional timestamp */
  timestamp?: number;
  /** Optional symbol */
  symbol?: string;
}

/**
 * Order book response
 */
export interface OrderBookResponse {
  code: number;
  data: OrderBook;
  message?: string;
}

/**
 * TP/SL order mode
 */
export type TpSlMode = "position" | "normal";

/**
 * TP/SL order configuration
 */
export interface TpSlOrderConfig {
  /** Trigger price (required) */
  triggerPrice: number | string;
  /** Optional order price (required for LIMIT orders) */
  orderPrice?: number | string;
  /** Order type */
  orderType?: OrderType;
  /** Quantity override (defaults to parent quantity) */
  quantity?: number | string;
  /** Trigger source (defaults to "oracle") */
  triggerWay?: string;
  /** TP/SL mode: position-wide or normal */
  tpslType?: TpSlMode;
  /** Existing plan ID for edits */
  planId?: string | number;
  /** Optional custom salt */
  salt?: string | number;
}

/**
 * Parameters for placing or editing TP/SL orders
 */
export interface PlaceTpSlOrdersParams {
  /** Trading symbol */
  symbol: string;
  /** Market ID (PerpetualID) */
  market: string;
  /** Closing side (BUY to close short, SELL to close long) */
  side: OrderSide;
  /** Whether the existing position is long */
  isLong: boolean;
  /** Base quantity used when TP/SL configs omit quantity */
  quantity: number | string;
  /** Position leverage */
  leverage: number | string;
  /** Reduce only flag (defaults true) */
  reduceOnly?: boolean;
  /** Post only flag */
  postOnly?: boolean;
  /** Orderbook only flag */
  orderbookOnly?: boolean;
  /** IOC flag */
  ioc?: boolean;
  /** Take profit configuration */
  tp?: TpSlOrderConfig;
  /** Stop loss configuration */
  sl?: TpSlOrderConfig;
}

/**
 * Result of placing TP/SL orders
 */
export interface PlaceTpSlOrdersResult {
  tpResult?: ApiResponse;
  slResult?: ApiResponse;
}

/**
 * Position TP/SL order information
 */
export interface PositionTpSlOrder {
  id?: string | number;
  planBatchId?: string | number;
  planOrderType?: string;
  orderType?: string;
  symbol?: string;
  side?: string;
  status?: string;
  hash?: string;
  quantity: string;
  price?: string;
  triggerPrice?: string;
  tpTriggerPrice?: string;
  tpOrderPrice?: string;
  slTriggerPrice?: string;
  slOrderPrice?: string;
  tpPlanId?: string | number | null;
  slPlanId?: string | number | null;
  tpslType?: TpSlMode;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;
}

/**
 * Query parameters for fetching TP/SL orders on a position
 */
export interface PositionTpSlQueryParams {
  positionId: string | number;
  tpslType?: TpSlMode;
}

/**
 * Cancel TP/SL orders request (alias of CancelOrderParams)
 */
export type CancelTpSlOrdersParams = CancelOrderParams;

/**
 * Ticker information for a trading pair
 * Match Java client: TickerResponse
 */
export interface Ticker {
  /** Trading pair symbol */
  symbol: string;
  /** Last traded price */
  lastPrice: string;
  /** Mark price */
  markPrice?: string;
  /** Best ask price */
  bestAskPrice?: string;
  /** Best bid price */
  bestBidPrice?: string;
  /** 24-hour highest price */
  high24h: string;
  /** 24-hour lowest price */
  low24h: string;
  /** 24-hour opening price */
  open24h?: string;
  /** 24-hour trading amount (in base currency) */
  amount24h: string;
  /** 24-hour trading volume (in USDC) */
  volume24h: string;
  /** Best ask amount */
  bestAskAmount?: string;
  /** Best bid amount */
  bestBidAmount?: string;
  /** Timestamp */
  timestamp?: number;
  /** 24-hour price change */
  change24h?: string;
  /** 24-hour price change rate (percentage) */
  rate24h?: string;
  /** Open price */
  openPrice?: string;
  /** Oracle price */
  oraclePrice?: string;
  /** Funding rate */
  fundingRate?: string;
  /** Open interest */
  openInterest?: string;
  /** Mid price (calculated from best bid and ask) */
  midPrice?: string;
}

/**
 * Ticker response
 */
export interface TickerResponse {
  code: number;
  data: Ticker;
  message?: string;
}

// ---------------- Pagination ----------------

/**
 * Standard pagination metadata returned by the backend.
 */
export interface PageInfo {
  pageNum: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Generic paginated response wrapper.
 */
export interface Paginated<T> extends PageInfo {
  items: T[];
}

/**
 * Common query params for paginated REST endpoints.
 */
export interface PaginatedQuery {
  pageNum?: number;
  pageSize?: number;
  /** Trading symbol filter (e.g. BTC-PERP) */
  symbol?: string;
  /** Start time in milliseconds */
  startTime?: number;
  /** End time in milliseconds */
  endTime?: number;
  /** Optional parent address when querying for a sub-account / vault */
  parentAddress?: string;
  /** Forward additional fields the backend may accept */
  [key: string]: any;
}

// ---------------- Trading history ----------------

export interface HistoryOrder {
  hash?: string;
  symbol?: string;
  side?: string;
  status?: string;
  orderType?: string;
  /** Quantity in normal units (formatted from wei) */
  quantity: string;
  /** Filled quantity */
  filledQty?: string;
  /** Average fill price in normal units */
  avgPrice?: string;
  price?: string;
  leverage?: string;
  realizedPnl?: string;
  fee?: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;
}

export interface FundingSettlement {
  symbol?: string;
  side?: string;
  /** Settlement amount in normal units */
  settlementAmount: string;
  quantity: string;
  fundingRate?: string;
  time?: number;
  [key: string]: any;
}

export interface BalanceChange {
  /** USDC delta in normal units (negative for outflow) */
  amount: string;
  event?: string;
  status?: string;
  txn?: string;
  time?: number;
  [key: string]: any;
}

// ---------------- Funding rate ----------------

export interface FundingRateDetail {
  symbol: string;
  fundingRate?: string;
  predictedRate?: string;
  nextFundingTime?: number;
  intervalSeconds?: number;
  [key: string]: any;
}

export interface FundingRateChartPoint {
  time: number;
  fundingRate: string;
  [key: string]: any;
}

export interface FundingRateHistoryItem {
  time: number;
  fundingRate: string;
  symbol?: string;
  [key: string]: any;
}

// ---------------- K-line ----------------

export interface KlineQueryParams {
  symbol: string;
  /** Interval string e.g. 1m, 5m, 1h, 1d */
  interval: string;
  /** Start time in seconds (per backend contract) */
  from?: number;
  /** End time in seconds */
  to?: number;
  /** Optional bar count */
  countback?: number;
}

export interface KlineBar {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

// ---------------- Volumes ----------------

export interface VolumesSummary {
  /** 24h notional USD volume */
  volume24h?: string;
  /** Total notional USD volume over 7d */
  volume7d?: string;
  /** Optional time series of daily volumes */
  daily?: Array<{ time: number; volume: string }>;
  [key: string]: any;
}

// ---------------- Latest signed price feed ----------------

/**
 * Signed price feed payload returned by `/api/perp-market-api/price/latest`.
 * The base64-encoded fields can be passed directly to
 * `TransactionBuilder.buildSignedPriceFeedTx`.
 */
export interface LatestPrice {
  payload: string;
  signature: string;
  publicKey: string;
  [key: string]: any;
}

// ---------------- Notice / announcement ----------------

export interface AnnouncementItem {
  id?: string | number;
  title?: string;
  content?: string;
  url?: string;
  createdAt?: number;
  [key: string]: any;
}

export interface NoticeItem {
  id?: string | number;
  level?: string;
  message?: string;
  startTime?: number;
  endTime?: number;
  [key: string]: any;
}

// ---------------- Global config ----------------

export interface GlobalConfig {
  [key: string]: any;
}

// ---------------- Plan order cancellation ----------------

export interface CancelPlanOrderParams {
  /** Plan order id (preferred) */
  planId?: string | number;
  /** Plan order hash */
  hash?: string;
  /** Trading symbol */
  symbol?: string;
  /** Optional parent address */
  parentAddress?: string;
}

// ---------------- API account / 1CT registry ----------------

export interface ApiAccount {
  id?: string | number;
  address: string;
  alias?: string;
  status?: string | number;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;
}

export interface CreateApiAccountParams {
  /** Sub-account address (Ed25519 public address) */
  address: string;
  /** Signature over the onboarding message produced by the sub-account */
  signature: string;
  /** Optional friendly name */
  alias?: string;
  /** Optional flag */
  isTermAccepted?: boolean;
}

// ---------------- Sponsor (gas-free) ----------------

export interface SponsorSignResponse {
  /** Base64 transaction bytes pre-signed by the sponsor */
  txBytes?: string;
  /** Base64 sponsor signature */
  sponsorSignature?: string;
  /** Server-side reservation id for the sponsored tx */
  reservationId?: string;
  [key: string]: any;
}

export interface SponsorSubmitResponse {
  digest?: string;
  status?: string;
  [key: string]: any;
}

// ---------------- On-chain helpers ----------------

export interface ChainBalances {
  /** Native SUI balance in normal units */
  sui: string;
  /** USDC wallet balance (token-defined decimals) in normal units */
  usdc: string;
  /** Bank (exchange) balance in normal units */
  bank: string;
}

export interface OnChainPosition {
  /** Position quantity (signed) in normal units */
  quantity: string;
  /** True if the position is long */
  isLong: boolean;
  /** Average open price in normal units */
  avgOpen: string;
  /** Current oracle price in normal units */
  oraclePrice: string;
  /** Margin in normal units */
  margin: string;
  /** Leverage in normal units */
  leverage: string;
  /** Selected leverage (per-position) in normal units */
  selectedLeverage?: string;
  /** Raw on-chain object for advanced access */
  raw?: any;
}

export interface CloseOnChainPositionParams {
  /** Trading symbol, e.g. BTC-PERP */
  symbol: string;
  /** Optional override quantity (in normal units). Defaults to full position. */
  quantity?: number | string;
  /** Optional gas budget */
  gasBudget?: number;
}

export interface SubAccountAuthParams {
  /** Sub-account address to authorize/revoke on-chain */
  account: string;
  /** True to enable, false to revoke */
  status: boolean;
  /** Optional gas budget */
  gasBudget?: number;
}

// ---------------- 1CT credentials ----------------

export interface OneClickTradingCredentials {
  /** Sub-account Sui address */
  address: string;
  /** Backend issued JWT for this sub-account */
  jwt: string;
  /** Optional: Sub-account secret key (Ed25519 exported string).
   *  Required only if you also want the SDK to sign trade payloads with the
   *  sub-account keypair (see `setOneClickTradingCredentials`). */
  privateKey?: string;
}

// ---------------- Vault ----------------

export interface VaultOverview {
  tvl: string;
  depositorTotal: string;
  [key: string]: any;
}

export interface VaultConfig {
  maxCap: string;
  vaultCreatingFee: string;
  [key: string]: any;
}

export interface VaultListItem {
  vaultId?: string;
  creatorAddress?: string;
  totalShares: string;
  maxCap: string;
  minDepositAmount: string;
  requestedPendingShares: string;
  lastSharePrice: string;
  totalDeposits: string;
  totalWithdrawals: string;
  shareRatio: string;
  tvl: string;
  apr: string;
  isClosed: boolean;
  isProtocol: boolean;
  closedAt?: number;
  vaultType?: number;
  [key: string]: any;
}

export interface VaultDetail extends VaultListItem {
  creatorMinimumShareRatio: string;
  creatorProfitShareRatio: string;
  creatorLossShareRatio: string;
  followerMaxCap?: string;
  profitShare: string;
  totalDepositors: string;
}

export interface VaultPerformance {
  navps?: string;
  pnl: string;
  upnl?: string;
  maxDrawDown: string;
  creatorFund?: string;
  depositorTotal?: string;
  cumDepositorTotal?: string;
  shareRatio?: string;
  age?: number;
  closeDate?: number;
  vaultId?: string;
  [key: string]: any;
}

export interface VaultAccount {
  navps: string;
  accountValue: string;
  availableBalance: string;
  creatorFund?: string;
  shareRatio: string;
  remainQuote: string;
  vaultLevelQuota?: string;
  followerMaxCap?: string;
  [key: string]: any;
}

export interface VaultMyHoldings {
  summary: {
    balanceTotal: string;
    upnlTotal: string;
    pnlTotal: string;
    [key: string]: any;
  };
  list: Array<VaultListItem & { myBalance: string; pnl: string; upnl: string }>;
}

export interface VaultMyPerformance {
  myBalance: string;
  upnl: string;
  earned: string;
  shares: string;
  shareRatio: string;
  navps: string;
  averagePrice: string;
  [key: string]: any;
}

export interface VaultDepositParams {
  /** Vault object ID */
  vaultId: string;
  /** Deposit amount (in normal units) */
  amount: number | string;
  /** Optional gas budget */
  gasBudget?: number;
  /** Optional pre-fetched signed price feed (avoids second network call) */
  signedPriceFeed?: LatestPrice;
}

export interface VaultWithdrawParams {
  /** Vault object ID */
  vaultId: string;
  /** Number of shares to redeem (in normal units) */
  shares: number | string;
  /** Optional gas budget */
  gasBudget?: number;
  /** Optional signed price feed; if omitted, fetched from `GET /api/perp-market-api/price/latest` (same as web app). */
  signedPriceFeed?: LatestPrice;
}

export interface VaultCloseParams {
  /** Vault object ID */
  vaultId: string;
  /** Optional gas budget */
  gasBudget?: number;
  /** Optional pre-fetched signed price feed */
  signedPriceFeed?: LatestPrice;
  /** Symbols for NAV / position valuation (defaults to deployed markets inside {@link TransactionBuilder}). */
  markets?: string[];
}

/** User-created vault (matches `vault_createVault` / ts-frontend `createVault`). */
export interface CreateVaultParams {
  name: string;
  trader: string;
  maxCap: number | string;
  minDepositAmount?: number | string;
  creatorMinimumShareRatio?: number | string;
  creatorProfitShareRatio?: number | string;
  initialAmount: number | string;
  gasBudget?: number;
}

/** Admin-created vault (`vault_createVault_by_manager`). */
export interface CreateVaultByManagerParams {
  creator: string;
  name: string;
  trader: string;
  maxCap: number | string;
  minDepositAmount?: number | string;
  creatorMinimumShareRatio?: number | string;
  creatorProfitShareRatio?: number | string;
  /** Optional manager capability object id (defaults to deployment `ManagerCap`). */
  managerCapId?: string;
  gasBudget?: number;
}

/** Set whether the vault accepts new deposits (“Public deposits”). */
export interface VaultSetDepositStatusParams {
  vaultId: string;
  /** `true` = open deposits, `false` = paused */
  status: boolean;
  gasBudget?: number;
}

/** Update vault max TVL / cap (Modify deposit limit / max cap in app). */
export interface VaultSetMaxCapParams {
  vaultId: string;
  /** Human-readable max cap (encoded with the vault’s on-chain 18-decimal fixed format). */
  maxCap: number | string;
  gasBudget?: number;
}

export interface VaultSetMinDepositAmountParams {
  vaultId: string;
  minDepositAmount: number | string;
  gasBudget?: number;
}

export interface VaultSetFollowerMaxCapParams {
  vaultId: string;
  followerMaxCap: number | string;
  gasBudget?: number;
}

export interface VaultSetAutoCloseOnWithdrawParams {
  vaultId: string;
  autoCloseOnWithdraw: boolean;
  gasBudget?: number;
}

export interface VaultSetTraderParams {
  vaultId: string;
  newTrader: string;
  gasBudget?: number;
}

export interface VaultRemoveParams {
  vaultId: string;
  gasBudget?: number;
}

export interface VaultFillWithdrawalRequestsParams {
  vaultId: string;
  withdrawalRequestIds: string[];
  gasBudget?: number;
  signedPriceFeed?: LatestPrice;
  markets?: string[];
}

export interface VaultUpdateSharePriceParams {
  vaultId: string;
  signedPriceFeed?: LatestPrice;
  markets?: string[];
}

// ---------------- WebSocket ----------------

export type WsChannel =
  | "orderBook"
  | "ticker"
  | "tickers"
  | "kline"
  | "tradeList"
  | "account"
  | "position"
  | "order"
  | string;

export interface WsSubscribeParams {
  /** Channel name */
  channel: WsChannel;
  /** Optional symbol */
  symbol?: string;
  /** Additional channel-specific params */
  [key: string]: any;
}

export interface WsClientOptions {
  url: string;
  /** Auth token (JWT) for private channels */
  authToken?: string;
  /** Wallet address (for private channels) */
  walletAddress?: string;
  /** Auto-reconnect on disconnect (default true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default 3000) */
  reconnectDelayMs?: number;
  /** Heartbeat interval in ms (default 25000). Set to 0 to disable. */
  heartbeatIntervalMs?: number;
  /** Heartbeat ping payload (defaults to `{ "op": "ping" }`) */
  heartbeatPayload?: Record<string, any>;
}
