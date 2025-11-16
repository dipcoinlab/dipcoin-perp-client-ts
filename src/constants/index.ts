// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Default values and constants
 */
export const DEFAULT_SLIPPAGE = 0.05; // 5% default slippage

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  AUTHORIZE: "/api/authorize",
  PLACE_ORDER: "/api/perp-trade-api/trade/placeorder",
  CANCEL_ORDER: "/api/perp-trade-api/trade/cancelorder",
  GET_ACCOUNT_INFO: "/api/perp-trade-api/curr-info/account",
  GET_POSITIONS: "/api/perp-trade-api/curr-info/positions",
  GET_OPEN_ORDERS: "/api/perp-trade-api/curr-info/orders",
  GET_TRADING_PAIRS: "/api/perp-market-api/list",
  GET_ORDER_BOOK: "/api/perp-market-api/orderBook",
} as const;

/**
 * Onboarding message for authentication
 */
export const ONBOARDING_MESSAGE = '{"onboardingUrl":"dipcoin.io"}';

/**
 * Decimal precision for formatting
 */
export const DECIMALS = {
  USDC: 6,
  SUI: 9,
  DEFAULT: 18,
} as const;

