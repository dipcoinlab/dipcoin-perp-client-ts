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

