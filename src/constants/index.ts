// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Default values and constants
 */
export const DEFAULT_SLIPPAGE = 0.05; // 5% default slippage

/**
 * API endpoints (mirror of the perp gateway routes used by ts-frontend).
 */
export const API_ENDPOINTS = {
  // ------------- Auth & onboarding -------------
  AUTHORIZE: "/api/authorize",
  GET_EXPIRED_1CT_ACCOUNTS: "/api/perp-trade-api/account/expired1CTAccounts",

  // ------------- Trading actions (signed) -------------
  PLACE_ORDER: "/api/perp-trade-api/trade/placeorder",
  CANCEL_ORDER: "/api/perp-trade-api/trade/cancelorder",
  PLAN_CLOSE_ORDER: "/api/perp-trade-api/plan/batch/plancloseorder",
  CANCEL_PLAN_ORDER: "/api/perp-trade-api/plan/cancelplanorder",

  // ------------- User config -------------
  ADJUST_LEVERAGE: "/api/perp-trade-api/user-config/adjust-leverage",
  GET_USER_CONFIG: "/api/perp-trade-api/user-config/config",

  // ------------- Account / positions / orders -------------
  GET_ACCOUNT_INFO: "/api/perp-trade-api/curr-info/account",
  GET_POSITIONS: "/api/perp-trade-api/curr-info/positions",
  GET_OPEN_ORDERS: "/api/perp-trade-api/curr-info/orders",
  GET_POSITION_TPSL: "/api/perp-trade-api/plan/position/tpsl",

  // ------------- History (paginated) -------------
  GET_HISTORY_ORDERS: "/api/perp-trade-api/history/orders",
  GET_FUNDING_SETTLEMENTS: "/api/perp-trade-api/history/funding-settlements",
  GET_BALANCE_CHANGES: "/api/perp-trade-api/history/balance-changes",

  // ------------- Public market -------------
  GET_GLOBAL_CONFIG: "/api/perp-trade-api/trade/public/global-config",
  GET_TRADING_PAIRS: "/api/perp-market-api/list",
  GET_ORDER_BOOK: "/api/perp-market-api/orderBook",
  GET_TICKER: "/api/perp-market-api/ticker",
  GET_VOLUMES: "/api/perp-market-api/volumes",
  GET_ANNOUNCEMENTS: "/api/perp-market-api/announcements",
  GET_NOTICE: "/api/perp-market-api/notice",
  GET_LATEST_PRICE: "/api/perp-market-api/price/latest",

  // ------------- Funding rate -------------
  GET_FUNDING_RATE_DETAIL: "/api/perp-market-api/funding-rate/detail",
  GET_FUNDING_RATE_CHART: "/api/perp-market-api/funding-rate/chart",
  GET_FUNDING_RATE_HISTORY: "/api/perp-market-api/funding-rate/page",

  // ------------- K-line -------------
  GET_KLINE_HISTORY: "/api/perp-market-api/kline/history",

  // ------------- API account / 1CT sub-account management -------------
  LIST_API_ACCOUNTS: "/api/perp-trade-api/api-account/list",
  CREATE_API_ACCOUNT: "/api/perp-trade-api/api-account/create",
  REMOVE_API_ACCOUNT: "/api/perp-trade-api/api-account/remove",

  // ------------- Sponsor (gas-free) service -------------
  SPONSOR_VALID: "/api/perp-sponsor/sponsor/valid",
  SPONSOR_CREATE: "/api/perp-sponsor/sponsor/create",
  SPONSOR_SUBMIT: "/api/perp-sponsor/sponsor/submit",

  // ------------- Relayer (non-Sui / Solana signed payload execution) -------------
  RELAY: "/api/perp-relayer/v1/relay",
  CCTP_DEPOSIT_STATUS: "/api/perp-relayer/v1/cctp/deposit/sol/status",
  CCTP_WITHDRAW_STATUS: "/api/perp-relayer/v1/cctp/withdraw/sol/status",

  // ------------- Vault: public -------------
  VAULT_OVERVIEW: "/api/perp-vault-api/public/overview",
  VAULT_CONFIG: "/api/perp-vault-api/public/vault-config",
  VAULT_LIST: "/api/perp-vault-api/public/vaults",
  VAULT_BY_CREATOR: "/api/perp-vault-api/public/vaults/by-creator",
  VAULT_DETAIL: "/api/perp-vault-api/public/vaults/detail",
  VAULT_PERFORMANCE: "/api/perp-vault-api/public/vaults/performance",
  VAULT_VALUE_CURVE: "/api/perp-vault-api/public/vaults/value-curve",
  VAULT_PNL_CURVE: "/api/perp-vault-api/public/vaults/pnl-curve",
  VAULT_ACCOUNT: "/api/perp-vault-api/public/vaults/account",
  VAULT_POSITIONS: "/api/perp-vault-api/public/vaults/positions",
  VAULT_PENDING_ORDERS: "/api/perp-vault-api/public/vaults/pending-orders",
  VAULT_FILLED_ORDERS: "/api/perp-vault-api/public/vaults/filled-orders",
  VAULT_FUNDING_HISTORY: "/api/perp-vault-api/public/vaults/funding-history",
  VAULT_DEPOSITS_WITHDRAWS: "/api/perp-vault-api/public/vaults/deposit-withdraw-records",
  VAULT_DEPOSITORS: "/api/perp-vault-api/public/vaults/top-depositors",
  VAULT_WHITELIST_CHECK: "/api/perp-vault-api/public/vault-config/whitelist-check",
  // ------------- Vault: authenticated -------------
  VAULT_MY_HOLDINGS: "/api/perp-vault-api/vaults/my-holdings",
  VAULT_MY_PERFORMANCE: "/api/perp-vault-api/vaults/my-performance",
  VAULT_MY_PNL_CURVE: "/api/perp-vault-api/vaults/my-performance/pnl-curve",
  VAULT_TRANSACTIONS: "/api/perp-vault-api/vaults/transaction-records",
  VAULT_UPDATE_DESCRIPTION: "/api/perp-vault-api/vaults/description",
  VAULT_UPLOAD_LOGO: "/api/perp-vault-api/vaults/logo",

  // ------------- Point -------------
  POINT_REFERRAL_LINK: "/api/dipcoin-point/referral/link",
  POINT_REFERRAL_CHANGE: "/api/dipcoin-point/referral/change",
  POINT_INVITEE: "/api/dipcoin-point/referral/invitee",
  POINT_SEASON_INFO: "/api/dipcoin-point/public/info/season",
  POINT_TEAM_BOOST: "/api/dipcoin-point/public/info/team/boost",
  POINT_TEAM_JOIN: "/api/dipcoin-point/team/join",
  POINT_TEAM_UPDATE: "/api/dipcoin-point/team/update",
  POINT_TEAM_NICKNAME_EXIST: "/api/dipcoin-point/team/exist/nickname",
  POINT_USER: "/api/dipcoin-point/point/user",
  POINT_USER_DAILY: "/api/dipcoin-point/point/user/daily",
  POINT_SEASON: "/api/dipcoin-point/point/season",
  POINT_REFERRAL: "/api/dipcoin-point/point/referral",
  POINT_TEAM: "/api/dipcoin-point/point/team",

  // ------------- Referral (commission program) -------------
  REFERRAL_PROFILE: "/api/dipcoin-referral-api/referral/profile",
  REFERRAL_DASHBOARD: "/api/dipcoin-referral-api/referral/dashboard",
  REFERRAL_APPLY: "/api/dipcoin-referral-api/referral/agent/apply",
  REFERRAL_HISTORY: "/api/dipcoin-referral-api/referral/history",
  REFERRAL_COMMISSION: "/api/dipcoin-referral-api/referral/commission/records",
  REFERRAL_CLAIM: "/api/dipcoin-referral-api/referral/claim",
  REFERRAL_CLAIM_HISTORY: "/api/dipcoin-referral-api/referral/claim/history",
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
  /** Vault on-chain numeric fields (`max_cap`, ratios, min deposit, create initial amount, etc.). */
  VAULT_CONFIG: 18,
} as const;

/**
 * Allowed K-line interval strings (mirrors the values the backend accepts).
 */
export const KLINE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;

export type KlineInterval = (typeof KLINE_INTERVALS)[number];

/**
 * Endpoints that should be sent through the 1CT (one-click) sub-account JWT
 * when 1CT credentials are configured. Mirrors the `isActionOrderUrl` check
 * in ts-frontend's services/index.ts.
 */
export const ONE_CLICK_TRADING_ACTION_URLS: readonly string[] = [
  API_ENDPOINTS.PLACE_ORDER,
  API_ENDPOINTS.CANCEL_ORDER,
  API_ENDPOINTS.CANCEL_PLAN_ORDER,
];
