// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { ExchangeOnChain, OrderSigner, TransactionBuilder } from "@dipcoinlab/perp-ts-library";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type SuiTransactionBlockResponse,
} from "@mysten/sui/jsonRpc";
import { Keypair } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import BigNumber from "bignumber.js";
import {
  API_ENDPOINTS,
  DECIMALS,
  ONBOARDING_MESSAGE,
  ONE_CLICK_TRADING_ACTION_URLS,
} from "../constants";
import { HttpClient, PerpRequestConfig } from "../services/httpClient";
import { WsClient } from "../services/wsClient";
import {
  AccountInfo,
  AccountInfoResponse,
  AdjustLeverageParams,
  AnnouncementItem,
  ApiAccount,
  ApiResponse,
  BalanceChange,
  CancelOrderParams,
  CancelPlanOrderParams,
  CancelTpSlOrdersParams,
  ChainBalances,
  CloseOnChainPositionParams,
  CreateApiAccountParams,
  CreateVaultByManagerParams,
  CreateVaultParams,
  DipCoinPerpSDKOptions,
  FundingRateChartPoint,
  FundingRateDetail,
  FundingRateHistoryItem,
  FundingSettlement,
  GlobalConfig,
  HistoryOrder,
  KlineBar,
  KlineQueryParams,
  LatestPrice,
  MarginAdjustmentParams,
  NoticeItem,
  OnChainPosition,
  OneClickTradingCredentials,
  OpenOrder,
  OpenOrdersResponse,
  OrderBook,
  OrderBookEntry,
  OrderResponse,
  OrderSide,
  OrderType,
  Paginated,
  PaginatedQuery,
  PlaceOrderParams,
  PlaceTpSlOrdersParams,
  PlaceTpSlOrdersResult,
  Position,
  PositionTpSlOrder,
  PositionsResponse,
  SDKResponse,
  SponsorSignResponse,
  SponsorSubmitResponse,
  SubAccountAuthParams,
  Ticker,
  TpSlMode,
  TpSlOrderConfig,
  TradingPair,
  TradingPairsResponse,
  UserConfig,
  VaultAccount,
  VaultCloseParams,
  VaultConfig,
  VaultDepositParams,
  VaultDetail,
  VaultFillWithdrawalRequestsParams,
  VaultListItem,
  VaultMyHoldings,
  VaultMyPerformance,
  VaultOverview,
  VaultPerformance,
  VaultRemoveParams,
  VaultSetAutoCloseOnWithdrawParams,
  VaultSetDepositStatusParams,
  VaultSetFollowerMaxCapParams,
  VaultSetMaxCapParams,
  VaultSetMinDepositAmountParams,
  VaultSetTraderParams,
  VaultUpdateSharePriceParams,
  VaultWithdrawParams,
  VolumesSummary,
  WsClientOptions,
} from "../types";
import {
  buildSignature,
  formatError,
  formatNormalToWei,
  formatNormalToWeiBN,
  fromExportedKeypair,
  readFile,
  signMessage,
} from "../utils";

/**
 * DipCoin Perpetual Trading SDK
 */
export class DipCoinPerpSDK {
  private httpClient: HttpClient;
  private keypair: Keypair;
  private walletAddress: string;
  private options: DipCoinPerpSDKOptions;
  private jwtToken?: string;
  private isAuthenticating = false;
  private exchangeOnChain: ExchangeOnChain;
  private deploymentConfig: any;
  private suiClient: SuiJsonRpcClient;
  private transactionBuilder: TransactionBuilder;
  /**
   * Optional 1CT (one-click trading) sub-account credentials. When set,
   * trading actions (`placeOrder` / `cancelOrder` / `cancelPlanOrder`) are
   * routed through the sub-account JWT and (optionally) signed with the
   * sub-account keypair instead of the main wallet, mirroring the behavior
   * of ts-frontend's services/index.ts request interceptor.
   */
  private oneClickTrading?: OneClickTradingCredentials;
  /** Optional explicit sub-account keypair (used when oneCT signs trades). */
  private oneClickTradingKeypair?: Keypair;

  /**
   * Initialize SDK
   * @param privateKey Private key string or keypair
   * @param options SDK configuration options
   */
  constructor(privateKey: string | Keypair, options: DipCoinPerpSDKOptions) {
    this.options = options;
    this.httpClient = new HttpClient(options.apiBaseUrl);

    // Initialize keypair
    if (typeof privateKey === "string") {
      this.keypair = fromExportedKeypair(privateKey);
    } else {
      this.keypair = privateKey;
    }

    // Get wallet address
    this.walletAddress = this.keypair.getPublicKey().toSuiAddress();
    this.httpClient.setWalletAddress(this.walletAddress);
    this.deploymentConfig = readFile(`config/deployed/${options.network}/main_contract.json`);
    const rpcUrl = options.customRpc || getJsonRpcFullnodeUrl(options.network);
    this.suiClient = new SuiJsonRpcClient({ url: rpcUrl, network: options.network });
    this.exchangeOnChain = new ExchangeOnChain(this.deploymentConfig, this.suiClient, this.keypair);

    const packageId = this.getDeploymentPackageId();
    const protocolConfigId = this.getDeploymentProtocolConfigId();
    this.transactionBuilder = new TransactionBuilder(
      packageId,
      protocolConfigId,
      this.deploymentConfig,
      this.suiClient as any
    );
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this.walletAddress;
  }

  /**
   * Get SDK options
   */
  get optionsField(): DipCoinPerpSDKOptions {
    return this.options;
  }

  /**
   * Overrides `X-Wallet-Address` for authenticated `perp-trade-api` and
   * `perp-vault-api/vaults/...` requests. Defaults to the SDK keypair address.
   * Use when reproducing the web app’s vault sub-account REST context with the
   * same onboarding JWT from {@link authenticate}.
   */
  setApiWalletAddress(address: string): void {
    this.httpClient.setWalletAddress(address);
  }

  /**
   * Authenticate and get JWT token (onboarding)
   * This method signs the onboarding message and exchanges it for a JWT token
   * @returns JWT token
   */
  async authenticate(): Promise<SDKResponse<string>> {
    try {
      // If already authenticated and token exists, return it
      if (this.jwtToken) {
        return {
          status: true,
          data: this.jwtToken,
        };
      }

      // Prevent concurrent authentication requests
      if (this.isAuthenticating) {
        // Wait for ongoing authentication
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (this.jwtToken) {
          return {
            status: true,
            data: this.jwtToken,
          };
        }
      }

      this.isAuthenticating = true;

      // 1. Prepare onboarding message
      const messageBytes = new TextEncoder().encode(ONBOARDING_MESSAGE);

      // 2. Sign the message
      const signature = await signMessage(this.keypair, messageBytes);

      // 3. Call authorize endpoint to get JWT token
      const response = await this.httpClient.post<{ token: string }>(API_ENDPOINTS.AUTHORIZE, {
        userAddress: this.walletAddress,
        isTermAccepted: true,
        signature: signature,
      });

      if (response.code === 200 && response.data?.token) {
        this.jwtToken = response.data.token;
        this.httpClient.setAuthToken(this.jwtToken);
        this.isAuthenticating = false;
        return {
          status: true,
          data: this.jwtToken,
        };
      } else {
        this.isAuthenticating = false;
        return {
          status: false,
          error: response.message || "Failed to authenticate",
        };
      }
    } catch (error) {
      this.isAuthenticating = false;
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get JWT token, authenticate if needed
   * @param forceRefresh Force refresh the token even if one exists
   * @returns JWT token
   */
  async getJWTToken(forceRefresh = false): Promise<SDKResponse<string>> {
    if (forceRefresh) {
      this.jwtToken = undefined;
      this.httpClient.setAuthToken("");
    }
    return this.authenticate();
  }

  /**
   * Clear JWT token (logout)
   */
  clearAuth(): void {
    this.jwtToken = undefined;
    this.httpClient.setAuthToken("");
  }

  // -----------------------------------------------------------------------
  //  1CT (one-click trading) sub-account credentials
  // -----------------------------------------------------------------------

  /**
   * Configure 1CT (one-click trading) sub-account credentials. When set,
   * trading actions (`placeOrder` / `cancelOrder` / `cancelPlanOrder`) are
   * routed through the sub-account JWT and (optionally) signed with the
   * sub-account keypair instead of the main wallet, mirroring the behavior
   * of ts-frontend's services/index.ts request interceptor.
   *
   * Pass `null` to clear the credentials.
   */
  setOneClickTradingCredentials(credentials: OneClickTradingCredentials | null): void {
    if (!credentials) {
      this.oneClickTrading = undefined;
      this.oneClickTradingKeypair = undefined;
      return;
    }
    this.oneClickTrading = credentials;
    if (credentials.privateKey) {
      try {
        this.oneClickTradingKeypair = fromExportedKeypair(credentials.privateKey);
      } catch (e) {
        console.warn("Failed to import 1CT private key, sub-account signing disabled:", e);
        this.oneClickTradingKeypair = undefined;
      }
    } else {
      this.oneClickTradingKeypair = undefined;
    }
  }

  /** Returns the active 1CT credentials, if configured. */
  getOneClickTradingCredentials(): OneClickTradingCredentials | undefined {
    return this.oneClickTrading;
  }

  /**
   * Returns the keypair that should sign the trade action. If 1CT is
   * configured AND the URL is an "action" url (placeorder/cancelorder/cancelplan)
   * AND a keypair was supplied, the sub-account keypair is used. Otherwise
   * the main wallet keypair is used.
   */
  private getActionKeypair(url: string): Keypair {
    if (this.oneClickTrading && this.oneClickTradingKeypair && this.isActionOrderUrl(url)) {
      return this.oneClickTradingKeypair;
    }
    return this.keypair;
  }

  /**
   * Returns the wallet address associated with the action's keypair.
   * Falls back to the SDK's main wallet address.
   */
  private getActionAddress(url: string): string {
    if (this.oneClickTrading && this.isActionOrderUrl(url)) {
      return this.oneClickTrading.address;
    }
    return this.walletAddress;
  }

  /** Build per-request override config to route a request through the 1CT JWT. */
  private buildOneCtRequestConfig(url: string): PerpRequestConfig | undefined {
    if (this.oneClickTrading && this.isActionOrderUrl(url)) {
      return {
        walletAddress: this.oneClickTrading.address,
        authToken: this.oneClickTrading.jwt,
      };
    }
    return undefined;
  }

  private isActionOrderUrl(url: string): boolean {
    return ONE_CLICK_TRADING_ACTION_URLS.includes(url);
  }

  // -----------------------------------------------------------------------
  //  Internal request helpers
  // -----------------------------------------------------------------------

  /**
   * Internal helper: ensure the SDK is authenticated, then perform an HTTP
   * call with automatic JWT-expiration retry (matches the ts-frontend
   * behavior of re-onboarding when the backend returns code === 1000).
   */
  private async authedRequest<T>(
    perform: () => Promise<ApiResponse<T>>
  ): Promise<{ ok: true; response: ApiResponse<T> } | { ok: false; error: string }> {
    const authResult = await this.authenticate();
    if (!authResult.status) {
      return { ok: false, error: authResult.error || "Authentication failed" };
    }

    let response: ApiResponse<T>;
    try {
      response = await perform();
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }

    if (response.code === 1000) {
      this.clearAuth();
      const retryAuth = await this.authenticate();
      if (!retryAuth.status) {
        return { ok: false, error: "Authentication expired and refresh failed" };
      }
      try {
        response = await perform();
      } catch (error) {
        return { ok: false, error: formatError(error) };
      }
    }

    return { ok: true, response };
  }

  /**
   * Convenience wrapper around {@link authedRequest} that automatically maps
   * a successful API response into an `SDKResponse<T>` and translates errors.
   */
  private async authedCall<TResp, TOut>(
    perform: () => Promise<ApiResponse<TResp>>,
    transform: (resp: ApiResponse<TResp>) => SDKResponse<TOut>,
    errorMessage = "Request failed"
  ): Promise<SDKResponse<TOut>> {
    const result = await this.authedRequest<TResp>(perform);
    if (!result.ok) {
      return { status: false, error: result.error };
    }
    const { response } = result;
    if (response.code !== 200) {
      return {
        status: false,
        error: response.message || errorMessage,
      };
    }
    return transform(response);
  }

  /**
   * Generic helper to load a paginated REST resource. Maps the backend's
   * `{ records|list|data, total, current|pageNum, size|pageSize }` shape into
   * the SDK-friendly {@link Paginated<T>}.
   */
  private async fetchPaginatedList<TRaw, TItem>(
    url: string,
    params: PaginatedQuery | undefined,
    mapRow: (raw: TRaw) => TItem
  ): Promise<SDKResponse<Paginated<TItem>>> {
    return this.authedCall<any, Paginated<TItem>>(
      () => this.httpClient.get<any>(url, { params }),
      (response) => {
        const data = response.data || {};
        const rawItems: TRaw[] = Array.isArray(data)
          ? data
          : data.records || data.list || data.items || data.data || [];
        const total = Number(data.total ?? data.totalCount ?? rawItems.length) || rawItems.length;
        const pageSize =
          Number(data.pageSize ?? data.size ?? params?.pageSize ?? rawItems.length) ||
          rawItems.length ||
          1;
        const pageNum = Number(data.pageNum ?? data.current ?? params?.pageNum ?? 1) || 1;
        const totalPages = Number(data.totalPages ?? (pageSize ? Math.ceil(total / pageSize) : 1));
        return {
          status: true,
          data: {
            items: rawItems.map(mapRow),
            total,
            pageSize,
            pageNum,
            totalPages: totalPages || 1,
          },
        };
      },
      `Failed to load ${url}`
    );
  }

  // -----------------------------------------------------------------------
  //  Trading actions
  // -----------------------------------------------------------------------

  /**
   * Place an order
   * @param params Order parameters
   * @returns Order response
   */
  async placeOrder(params: PlaceOrderParams): Promise<SDKResponse<OrderResponse>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      // Validate required parameters
      if (
        !params.symbol ||
        !params.side ||
        !params.orderType ||
        !params.quantity ||
        !params.leverage
      ) {
        throw new Error("Missing required order parameters");
      }

      if (params.orderType === OrderType.LIMIT && !params.price) {
        throw new Error("Price is required for LIMIT orders");
      }

      const {
        symbol,
        side,
        orderType,
        quantity,
        price,
        leverage,
        market,
        reduceOnly = false,
        clientId = "",
        tpTriggerPrice,
        tpOrderType = OrderType.MARKET,
        tpOrderPrice = "",
        slTriggerPrice,
        slOrderType = OrderType.MARKET,
        slOrderPrice = "",
      } = params;

      // Validate market parameter - it must be a PerpetualID, not a symbol
      if (!market) {
        throw new Error(
          "Market (PerpetualID) is required. Please provide the market parameter with the PerpetualID for the trading pair."
        );
      }

      // Convert to BigNumber for calculations
      // For MARKET orders, price can be empty string, which will be converted to 0
      const priceBN = price && price !== "" ? formatNormalToWeiBN(price) : new BigNumber(0);
      const quantityBN = formatNormalToWeiBN(quantity);
      const leverageBN = formatNormalToWeiBN(leverage);
      const expirationBN = new BigNumber(0);
      const saltBN = new BigNumber(+new Date());

      // Resolve action signing context (main wallet or 1CT sub-account).
      const actionUrl = API_ENDPOINTS.PLACE_ORDER;
      const actionKeypair = this.getActionKeypair(actionUrl);
      const actionAddress = this.getActionAddress(actionUrl);
      const requestOverride = this.buildOneCtRequestConfig(actionUrl);

      // Build main order object
      // Note: market must be the PerpetualID (e.g., "0xc1b1cf3d774bcfcbd6d71158a4259f2d99fccbf64ffc34f32700f8a771587d99")
      const order = {
        market: market,
        creator: actionAddress,
        isLong: side === OrderSide.BUY,
        reduceOnly,
        postOnly: false,
        orderbookOnly: true,
        ioc: false,
        quantity: quantityBN,
        price: orderType === OrderType.LIMIT ? priceBN : new BigNumber(0),
        leverage: leverageBN,
        expiration: expirationBN,
        salt: saltBN,
      };

      // Build TP order if trigger price is provided
      let tpOrder = null;
      let tpSalt = null;
      if (tpTriggerPrice) {
        tpSalt = new BigNumber(Date.now() + 1);
        tpOrder = {
          market: order.market,
          creator: actionAddress,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            tpOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(tpOrderPrice || tpTriggerPrice)
              : formatNormalToWeiBN(""),
          leverage: leverageBN,
          expiration: expirationBN,
          salt: tpSalt,
        };
      }

      // Build SL order if trigger price is provided
      let slOrder = null;
      let slSalt = null;
      if (slTriggerPrice) {
        slSalt = new BigNumber(Date.now() + 2);
        slOrder = {
          market: order.market,
          creator: actionAddress,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            slOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(slOrderPrice || slTriggerPrice)
              : formatNormalToWeiBN(""),
          leverage: leverageBN,
          expiration: expirationBN,
          salt: slSalt,
        };
      }

      // Generate order message for signing
      const orderMsg = OrderSigner.getOrderMessageForUIWallet(order);
      const orderHashBytes = new TextEncoder().encode(orderMsg);

      // Sign main order
      const orderSignature = await signMessage(actionKeypair, orderHashBytes);

      // Sign TP order if exists
      let tpOrderSignature: string | undefined;
      if (tpOrder) {
        const tpOrderMsg = OrderSigner.getOrderMessageForUIWallet(tpOrder);
        const tpOrderHashBytes = new TextEncoder().encode(tpOrderMsg);
        tpOrderSignature = await signMessage(actionKeypair, tpOrderHashBytes);
      }

      // Sign SL order if exists
      let slOrderSignature: string | undefined;
      if (slOrder) {
        const slOrderMsg = OrderSigner.getOrderMessageForUIWallet(slOrder);
        const slOrderHashBytes = new TextEncoder().encode(slOrderMsg);
        slOrderSignature = await signMessage(actionKeypair, slOrderHashBytes);
      }

      // Build request parameters
      // Match ts-frontend: always use formatNormalToWei(price) regardless of order type
      // For MARKET orders, price will be empty string which converts to "0"
      const requestParams: Record<string, any> = {
        symbol,
        side,
        orderType,
        quantity: formatNormalToWei(quantity),
        price: formatNormalToWei(price || ""), // Match ts-frontend: always use priceWei
        leverage: formatNormalToWei(leverage),
        salt: saltBN.toString(),
        creator: actionAddress,
        clientId,
        reduceOnly, // Will be sent as boolean in JSON
        orderSignature,
      };

      // Add TP parameters if exists
      if (tpTriggerPrice && tpOrderSignature) {
        requestParams.tpOrderSignature = tpOrderSignature;
        requestParams.tpTriggerPrice = formatNormalToWei(tpTriggerPrice);
        requestParams.tpOrderType = tpOrderType;
        requestParams.tpOrderPrice =
          tpOrderType === OrderType.LIMIT
            ? formatNormalToWei(tpOrderPrice || tpTriggerPrice)
            : formatNormalToWei("");
        requestParams.tpSalt = tpSalt?.toString();
        requestParams.triggerWay = "oracle";
      }

      // Add SL parameters if exists
      if (slTriggerPrice && slOrderSignature) {
        requestParams.slOrderSignature = slOrderSignature;
        requestParams.slTriggerPrice = formatNormalToWei(slTriggerPrice);
        requestParams.slOrderType = slOrderType;
        requestParams.slOrderPrice =
          slOrderType === OrderType.LIMIT
            ? formatNormalToWei(slOrderPrice || slTriggerPrice)
            : formatNormalToWei("");
        requestParams.slSalt = slSalt?.toString();
      }

      // Send request
      // Match ts-frontend and Java: use JSON POST request, not form-urlencoded
      // ts-frontend's postForm actually sends JSON with Content-Type: application/json
      const response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.PLACE_ORDER,
        requestParams,
        requestOverride
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.PLACE_ORDER,
            requestParams,
            requestOverride
          );
          if (retryResponse.code === 200) {
            return {
              status: true,
              data: retryResponse,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Order failed",
          data: response,
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Cancel an order
   * @param params Cancel order parameters
   * @returns Cancel order response
   */
  async cancelOrder(params: CancelOrderParams): Promise<SDKResponse<OrderResponse>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const actionUrl = API_ENDPOINTS.CANCEL_ORDER;
      const actionKeypair = this.getActionKeypair(actionUrl);
      const actionAddress = this.getActionAddress(actionUrl);
      const requestOverride = this.buildOneCtRequestConfig(actionUrl);

      const { symbol, orderHashes, parentAddress = actionAddress } = params;

      if (!orderHashes || orderHashes.length === 0) {
        throw new Error("Order hashes are required");
      }

      // Build cancel order message
      const cancelOrderObj = { orderHashes };
      const orderHashBytes = new TextEncoder().encode(JSON.stringify(cancelOrderObj));

      // Sign the message (with sub-account when 1CT is enabled)
      const signature = await signMessage(actionKeypair, orderHashBytes);

      // Build request parameters
      // Match ts-frontend and Java: orderHashes should be an array, not a JSON string
      // JSON POST request will automatically serialize the array
      const requestParams = {
        symbol,
        orderHashes, // Direct array, not JSON.stringify
        signature,
        parentAddress,
      };

      // Send request
      // Match ts-frontend and Java: use JSON POST request, not form-urlencoded
      // ts-frontend's postForm actually sends JSON with Content-Type: application/json
      const response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.CANCEL_ORDER,
        requestParams,
        requestOverride
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.CANCEL_ORDER,
            requestParams,
            requestOverride
          );
          if (retryResponse.code === 200) {
            return {
              status: true,
              data: retryResponse,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Cancellation Failed",
          data: response,
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Adjust preferred leverage for a symbol (matches ts-frontend behavior)
   * @param params Adjust leverage parameters
   */
  async adjustLeverage(params: AdjustLeverageParams): Promise<SDKResponse<OrderResponse>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const { symbol, leverage, marginType = "ISOLATED" } = params;

      if (!symbol) {
        throw new Error("Symbol is required for adjusting leverage");
      }

      if (!this.isPositiveNumber(leverage)) {
        throw new Error("Leverage must be greater than zero");
      }

      const payload = {
        symbol,
        marginType,
        leverage: formatNormalToWei(leverage),
      };

      let response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.ADJUST_LEVERAGE,
        payload
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.ADJUST_LEVERAGE,
            payload
          );
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      }

      return {
        status: false,
        data: response,
        error: response.message || "Failed to adjust leverage",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Fetch current user config (preferred leverage & margin type) for a symbol
   * Mirrors ts-frontend behavior: GET /user-config/config + formatWeiToNormal
   * @param symbol Trading symbol, e.g. "BTC-PERP"
   */
  async getUserConfig(symbol: string): Promise<SDKResponse<UserConfig>> {
    if (!symbol) {
      return {
        status: false,
        error: "Symbol is required",
      };
    }

    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params = { symbol };
      let response = await this.httpClient.get<UserConfig>(API_ENDPOINTS.GET_USER_CONFIG, {
        params,
      });

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<UserConfig>(API_ENDPOINTS.GET_USER_CONFIG, {
            params,
          });
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200 && response.data) {
        const rawConfig: Record<string, any> = Array.isArray(response.data)
          ? response.data[0]
          : response.data;

        if (!rawConfig) {
          return {
            status: false,
            error: "User config not found",
          };
        }

        const leverageWei = rawConfig.leverage ?? rawConfig.leverageWei ?? "0";
        const normalizedConfig: UserConfig = {
          ...rawConfig,
          symbol: rawConfig.symbol || symbol,
          marginType: rawConfig.marginType || rawConfig.marginTypeEnum,
          leverageWei,
          leverage: this.formatWeiToNormal(leverageWei),
        };

        return {
          status: true,
          data: normalizedConfig,
        };
      }

      return {
        status: false,
        error: response.message || "Failed to fetch user config",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Place or edit TP/SL orders for a position
   */
  async placePositionTpSlOrders(
    params: PlaceTpSlOrdersParams
  ): Promise<SDKResponse<PlaceTpSlOrdersResult>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const {
        symbol,
        market,
        side,
        isLong,
        leverage,
        quantity,
        reduceOnly = true,
        postOnly = false,
        orderbookOnly = true,
        ioc = false,
        tp,
        sl,
      } = params;

      if (!this.isPositiveNumber(quantity)) {
        return {
          status: false,
          error: "Quantity must be greater than zero",
        };
      }

      const hasTpOrder = this.hasTpSlOrderConfig(tp, quantity);
      const hasSlOrder = this.hasTpSlOrderConfig(sl, quantity);

      if (!hasTpOrder && !hasSlOrder) {
        return {
          status: false,
          error: "At least one TP or SL configuration is required",
        };
      }

      const leverageBN = formatNormalToWeiBN(leverage);
      const leverageWei = formatNormalToWei(leverage);
      const expirationBN = new BigNumber(0);
      const saltBN = new BigNumber(+new Date());
      const slSaltBN = saltBN.plus(1);
      const planPayloadBase = {
        symbol,
        side,
        leverage: leverageWei,
        creator: this.walletAddress,
      };

      const sendPlanCloseRequest = async (payload: Record<string, any>) => {
        let response = await this.httpClient.post<OrderResponse>(
          API_ENDPOINTS.PLAN_CLOSE_ORDER,
          payload
        );

        if (response.code === 1000) {
          this.clearAuth();
          const retryAuth = await this.authenticate();
          if (retryAuth.status) {
            response = await this.httpClient.post<OrderResponse>(
              API_ENDPOINTS.PLAN_CLOSE_ORDER,
              payload
            );
          }
        }

        return response;
      };

      const results: PlaceTpSlOrdersResult = {};
      let tpPayload: Record<string, any> | undefined;
      let slPayload: Record<string, any> | undefined;

      if (hasTpOrder && tp) {
        if (!this.isPositiveNumber(tp.triggerPrice)) {
          return {
            status: false,
            error: "TP trigger price must be greater than zero",
          };
        }

        const tpSaltValue = tp.salt ? new BigNumber(tp.salt) : saltBN;
        const tpOrderQuantityBN = formatNormalToWeiBN(tp.quantity ?? quantity);
        const tpOrderPriceBN =
          (tp.orderType || OrderType.MARKET) === OrderType.LIMIT
            ? formatNormalToWeiBN(tp.orderPrice ?? tp.triggerPrice ?? "0")
            : new BigNumber(0);

        const tpOrder = {
          market,
          creator: this.walletAddress,
          isLong,
          reduceOnly,
          postOnly,
          orderbookOnly,
          ioc,
          quantity: tpOrderQuantityBN,
          price: tpOrderPriceBN,
          leverage: leverageBN,
          expiration: expirationBN,
          salt: tpSaltValue,
        };

        const tpOrderMsg = OrderSigner.getOrderMessageForUIWallet(tpOrder);
        const tpOrderSignature = await signMessage(
          this.keypair,
          new TextEncoder().encode(tpOrderMsg)
        );

        tpPayload = {
          ...planPayloadBase,
          tpOrderType: tp.orderType || OrderType.MARKET,
          tpTpslType: tp.tpslType || ("position" as TpSlMode),
          tpTriggerPrice: formatNormalToWei(tp.triggerPrice),
          tpOrderPrice:
            (tp.orderType || OrderType.MARKET) === OrderType.LIMIT
              ? formatNormalToWei(tp.orderPrice ?? tp.triggerPrice ?? "0")
              : "0",
          tpQuantity: formatNormalToWei(tp.quantity ?? quantity),
          tpTriggerWay: tp.triggerWay || "oracle",
          tpSalt: tpSaltValue.toString(),
          tpOrderSignature,
        };

        if (tp.planId !== undefined) {
          tpPayload.tpPlanId = tp.planId;
        }
      }

      if (hasSlOrder && sl) {
        if (!this.isPositiveNumber(sl.triggerPrice)) {
          return {
            status: false,
            error: "SL trigger price must be greater than zero",
          };
        }

        const slSaltValue = sl.salt ? new BigNumber(sl.salt) : slSaltBN;
        const slOrderQuantityBN = formatNormalToWeiBN(sl.quantity ?? quantity);
        const slOrderPriceBN =
          (sl.orderType || OrderType.MARKET) === OrderType.LIMIT
            ? formatNormalToWeiBN(sl.orderPrice ?? sl.triggerPrice ?? "0")
            : new BigNumber(0);

        const slOrder = {
          market,
          creator: this.walletAddress,
          isLong,
          reduceOnly,
          postOnly,
          orderbookOnly,
          ioc,
          quantity: slOrderQuantityBN,
          price: slOrderPriceBN,
          leverage: leverageBN,
          expiration: expirationBN,
          salt: slSaltValue,
        };

        const slOrderMsg = OrderSigner.getOrderMessageForUIWallet(slOrder);
        const slOrderSignature = await signMessage(
          this.keypair,
          new TextEncoder().encode(slOrderMsg)
        );

        slPayload = {
          ...planPayloadBase,
          slOrderType: sl.orderType || OrderType.MARKET,
          slTpslType: sl.tpslType || ("position" as TpSlMode),
          slTriggerPrice: formatNormalToWei(sl.triggerPrice),
          slOrderPrice:
            (sl.orderType || OrderType.MARKET) === OrderType.LIMIT
              ? formatNormalToWei(sl.orderPrice ?? sl.triggerPrice ?? "0")
              : "0",
          slQuantity: formatNormalToWei(sl.quantity ?? quantity),
          slTriggerWay: sl.triggerWay || "oracle",
          slSalt: slSaltValue.toString(),
          slOrderSignature,
        };

        if (sl.planId !== undefined) {
          slPayload.slPlanId = sl.planId;
        }
      }

      if (hasTpOrder && hasSlOrder && tpPayload && slPayload) {
        const payload = {
          ...tpPayload,
          ...slPayload,
        };
        const response = await sendPlanCloseRequest(payload);
        results.tpResult = response;
        results.slResult = response;
      } else if (hasTpOrder && tpPayload) {
        results.tpResult = await sendPlanCloseRequest(tpPayload);
      } else if (hasSlOrder && slPayload) {
        results.slResult = await sendPlanCloseRequest(slPayload);
      }

      const success = [results.tpResult, results.slResult].some((res) => res && res.code === 200);

      if (success) {
        return {
          status: true,
          data: results,
        };
      }

      return {
        status: false,
        data: results,
        error:
          results.tpResult?.message || results.slResult?.message || "Failed to place TP/SL order",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get TP/SL orders for a position
   */
  async getPositionTpSl(
    positionId: string | number,
    tpslType: TpSlMode = "normal"
  ): Promise<SDKResponse<PositionTpSlOrder[]>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params = {
        positionId,
        tpslType,
      };

      let response = await this.httpClient.get<PositionTpSlOrder[]>(
        API_ENDPOINTS.GET_POSITION_TPSL,
        { params }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PositionTpSlOrder[]>(
            API_ENDPOINTS.GET_POSITION_TPSL,
            { params }
          );
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200) {
        const rawData = Array.isArray(response.data)
          ? response.data
          : (response.data as any)?.data || [];
        const orders = rawData.map((item: any) => this.transformPositionTpSlOrder(item));
        return {
          status: true,
          data: orders,
        };
      }

      return {
        status: false,
        error: response.message || "Failed to fetch TP/SL orders",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Cancel TP/SL orders (alias of cancelOrder)
   */
  async cancelTpSlOrders(params: CancelTpSlOrdersParams): Promise<SDKResponse<OrderResponse>> {
    return this.cancelOrder(params);
  }

  /**
   * Get account information
   * @returns Account info response
   */
  async getAccountInfo(): Promise<SDKResponse<AccountInfo>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const response = await this.httpClient.get<AccountInfoResponse>(
        API_ENDPOINTS.GET_ACCOUNT_INFO
      );

      // Handle JWT expiration (code 1000)
      if (response.code === 1000) {
        // Clear token and retry authentication
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.get<AccountInfoResponse>(
            API_ENDPOINTS.GET_ACCOUNT_INFO
          );
          if (retryResponse.code === 200 && retryResponse.data) {
            return {
              status: true,
              data: {
                walletBalance: retryResponse.data.walletBalance || "0",
                totalUnrealizedProfit: retryResponse.data.totalUnrealizedProfit || "0",
                accountValue: retryResponse.data.accountValue || "0",
                freeCollateral: retryResponse.data.freeCollateral || "0",
                totalMargin: retryResponse.data.totalMargin || "0",
              },
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200 && response.data) {
        return {
          status: true,
          data: {
            walletBalance: response.data.walletBalance || "0",
            totalUnrealizedProfit: response.data.totalUnrealizedProfit || "0",
            accountValue: response.data.accountValue || "0",
            freeCollateral: response.data.freeCollateral || "0",
            totalMargin: response.data.totalMargin || "0",
          },
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get account info",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get positions
   * @param symbol Optional symbol filter
   * @returns Positions response
   */
  async getPositions(symbol?: string): Promise<SDKResponse<Position[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol;
      }

      const response = await this.httpClient.get<PositionsResponse>(API_ENDPOINTS.GET_POSITIONS, {
        params,
      });

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<PositionsResponse>(
            API_ENDPOINTS.GET_POSITIONS,
            { params }
          );
          if (retryResponse.code === 200) {
            const positions = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: positions,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const positions = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: positions,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get positions",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get trading pairs list
   * This can be used to find the PerpetualID (perpId) for a given symbol
   * @returns Trading pairs response
   */
  async getTradingPairs(): Promise<SDKResponse<TradingPair[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const response = await this.httpClient.get<TradingPairsResponse>(
        API_ENDPOINTS.GET_TRADING_PAIRS
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<TradingPairsResponse>(
            API_ENDPOINTS.GET_TRADING_PAIRS
          );
          if (retryResponse.code === 200) {
            const pairs = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: pairs,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const pairs = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: pairs,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get trading pairs",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get PerpetualID for a given symbol
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns PerpetualID or null if not found
   */
  async getPerpetualID(symbol: string): Promise<string | null> {
    try {
      const pairsResult = await this.getTradingPairs();
      if (pairsResult.status && pairsResult.data) {
        const pair = pairsResult.data.find((p) => p.symbol === symbol);
        return pair?.perpId || null;
      }
      return null;
    } catch (error) {
      console.error("Error getting PerpetualID:", error);
      return null;
    }
  }

  /**
   * Get open orders
   * @param symbol Optional symbol filter
   * @returns Open orders response
   */
  async getOpenOrders(symbol?: string): Promise<SDKResponse<OpenOrder[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol;
      }

      const response = await this.httpClient.get<OpenOrdersResponse>(
        API_ENDPOINTS.GET_OPEN_ORDERS,
        { params }
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<OpenOrdersResponse>(
            API_ENDPOINTS.GET_OPEN_ORDERS,
            { params }
          );
          if (retryResponse.code === 200) {
            const orders = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: orders,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const orders = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: orders,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get open orders",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get order book for a trading pair
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Order book response with bids and asks
   * @example
   * ```typescript
   * const orderBook = await sdk.getOrderBook("BTC-PERP");
   * if (orderBook.status && orderBook.data) {
   *   console.log("Bids:", orderBook.data.bids);
   *   console.log("Asks:", orderBook.data.asks);
   * }
   * ```
   */
  async getOrderBook(symbol: string): Promise<SDKResponse<OrderBook>> {
    try {
      if (!symbol) {
        return {
          status: false,
          error: "Symbol is required",
        };
      }

      // Market API endpoints typically don't require authentication
      // But we'll try to authenticate if possible for consistency
      // If authentication fails, we'll still try to fetch the order book
      await this.authenticate().catch(() => {
        // Ignore authentication errors for market data
      });

      const params: Record<string, any> = {
        symbol,
      };

      const response = await this.httpClient.get<any>(API_ENDPOINTS.GET_ORDER_BOOK, { params });

      if (response.code === 200 && response.data) {
        // Extract order book data from response
        // Match Java client: OrderBookResponse has bids and asks as List<List<String>>
        // Format: [[price, quantity, orderNum], ...]
        let rawData = response.data;

        // Handle nested response structure
        if ((rawData as any).data) {
          rawData = (rawData as any).data;
        }

        // Validate structure
        if (!rawData || !Array.isArray(rawData.bids) || !Array.isArray(rawData.asks)) {
          return {
            status: false,
            error: "Invalid order book data structure",
          };
        }

        // Process bids and asks from array format to OrderBookEntry format
        // Match ts-frontend: processOrderBookEntries converts [price, quantity, orderNum] to {price, quantity}
        const bids = this.processOrderBookEntries(rawData.bids, "bids");
        const asks = this.processOrderBookEntries(rawData.asks, "asks");

        const orderBook: OrderBook = {
          symbol,
          bids,
          asks,
          timestamp: Date.now(),
        };

        return {
          status: true,
          data: orderBook,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get order book",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Process order book entries from API format to OrderBookEntry format
   * Match ts-frontend: processOrderBookEntries method
   * @param entries Raw entries from API (array of [price, quantity, orderNum] or objects)
   * @param side "bids" or "asks"
   * @returns Processed OrderBookEntry array
   */
  private processOrderBookEntries(entries: any[], side: "bids" | "asks"): OrderBookEntry[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry) => {
        // Check if it's array format [price, quantity, orderNum]
        if (Array.isArray(entry) && entry.length >= 2) {
          const [price, quantity] = entry;
          return (
            price &&
            quantity &&
            !isNaN(parseFloat(String(price))) &&
            !isNaN(parseFloat(String(quantity))) &&
            parseFloat(String(quantity)) > 0
          );
        }
        // Check if it's object format {price, quantity}
        if (entry && entry.price && entry.quantity) {
          return (
            !isNaN(parseFloat(String(entry.price))) &&
            !isNaN(parseFloat(String(entry.quantity))) &&
            parseFloat(String(entry.quantity)) > 0
          );
        }
        return false;
      })
      .map((entry) => {
        let price: string, quantity: string;

        // Handle array format [price, quantity, orderNum]
        if (Array.isArray(entry) && entry.length >= 2) {
          [price, quantity] = entry;
        } else {
          // Handle object format {price, quantity}
          price = entry.price;
          quantity = entry.quantity;
        }

        // Keep wei format - no conversion
        return {
          price: String(price),
          quantity: String(quantity),
        };
      })
      .sort((a, b) => {
        const priceA = parseFloat(a.price);
        const priceB = parseFloat(b.price);

        // Bids: sort descending (highest price first)
        // Asks: sort ascending (lowest price first)
        // Match ts-frontend: bids descending, asks ascending
        if (side === "bids") {
          return priceB - priceA; // Descending for bids
        } else {
          return priceA - priceB; // Ascending for asks
        }
      });
  }

  /**
   * Format wei value to normal units (18 decimals)
   * Match ts-frontend: formatWeiToNormal function
   * @param value Value in wei (string or number)
   * @param decimals Number of decimals (default 18)
   * @returns Formatted string in normal units
   */
  private formatWeiToNormal(value: number | string, decimals = 18): string {
    try {
      const bn = new BigNumber(value);
      if (bn.isNaN() || bn.isZero()) {
        return "0";
      }
      return bn.dividedBy(new BigNumber(10).pow(decimals)).toString();
    } catch (error) {
      console.error("Error converting wei to normal:", error);
      return "0";
    }
  }

  /**
   * Get ticker information for a trading pair
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Ticker information response
   * @example
   * ```typescript
   * const ticker = await sdk.getTicker("BTC-PERP");
   * if (ticker.status && ticker.data) {
   *   console.log("Last Price:", ticker.data.lastPrice);
   *   console.log("24h Volume:", ticker.data.volume24h);
   *   console.log("24h Change:", ticker.data.rate24h);
   * }
   * ```
   */
  async getTicker(symbol: string): Promise<SDKResponse<Ticker>> {
    try {
      if (!symbol) {
        return {
          status: false,
          error: "Symbol is required",
        };
      }

      // Market API endpoints typically don't require authentication
      // But we'll try to authenticate if possible for consistency
      // If authentication fails, we'll still try to fetch the ticker
      await this.authenticate().catch(() => {
        // Ignore authentication errors for market data
      });

      const params: Record<string, any> = {
        symbol,
      };

      const response = await this.httpClient.get<any>(API_ENDPOINTS.GET_TICKER, { params });

      if (response.code === 200 && response.data) {
        // Extract ticker data from response
        // Match Java client: TickerResponse structure
        let rawData = response.data;

        // Handle nested response structure
        if ((rawData as any).data) {
          rawData = (rawData as any).data;
        }

        // Validate structure
        if (!rawData || !rawData.symbol) {
          return {
            status: false,
            error: "Invalid ticker data structure",
          };
        }

        // Process ticker data: convert wei to normal units
        // Match ts-frontend: transformerTicker function
        const ticker = this.processTickerData(rawData);

        return {
          status: true,
          data: ticker,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get ticker",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Transform raw TP/SL order data into SDK-friendly format
   */
  private transformPositionTpSlOrder(raw: any): PositionTpSlOrder {
    const toNormal = (value?: string | number | null) =>
      value !== undefined && value !== null && value !== ""
        ? this.formatWeiToNormal(value)
        : undefined;

    const planOrderType = raw.planOrderType;

    return {
      ...raw,
      id: raw.id ?? raw.planId ?? raw.planBatchId,
      planBatchId: raw.planBatchId ?? raw.id,
      planOrderType,
      orderType: raw.orderType,
      symbol: raw.symbol,
      side: raw.side,
      status: raw.status,
      hash: raw.hash,
      quantity: toNormal(raw.quantity) ?? "0",
      price: toNormal(raw.price),
      triggerPrice: toNormal(raw.triggerPrice),
      tpTriggerPrice: toNormal(raw.tpTriggerPrice),
      tpOrderPrice: toNormal(raw.tpOrderPrice),
      slTriggerPrice: toNormal(raw.slTriggerPrice),
      slOrderPrice: toNormal(raw.slOrderPrice),
      tpPlanId:
        planOrderType === "takeProfit" ? raw.tpPlanId ?? raw.id ?? null : raw.tpPlanId ?? null,
      slPlanId:
        planOrderType === "stopLoss" ? raw.slPlanId ?? raw.id ?? null : raw.slPlanId ?? null,
      tpslType: raw.tpslType,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Check whether TP/SL config should be submitted
   */
  private hasTpSlOrderConfig(
    config: TpSlOrderConfig | undefined,
    fallbackQuantity: number | string
  ): boolean {
    if (!config) {
      return false;
    }

    if (!this.isPositiveNumber(config.triggerPrice)) {
      return false;
    }

    const quantityValue = config.quantity ?? fallbackQuantity;
    return this.isPositiveNumber(quantityValue);
  }

  /**
   * Determine if a numeric input is greater than zero
   */
  private isPositiveNumber(value?: number | string): boolean {
    if (value === undefined || value === null || value === "") {
      return false;
    }

    try {
      return new BigNumber(value).gt(0);
    } catch {
      return false;
    }
  }

  /**
   * Process ticker data from API format to Ticker format
   * Keep all values in wei format - no conversion
   * @param rawData Raw ticker data from API
   * @returns Processed Ticker object
   */
  private processTickerData(rawData: any): Ticker {
    // Calculate mid price from best bid and ask
    // Calculate using wei values, keep in wei format
    let midPrice: string | undefined;
    if (rawData.bestAskPrice && rawData.bestBidPrice) {
      // Both exist: calculate average in wei
      const askPriceBN = new BigNumber(rawData.bestAskPrice);
      const bidPriceBN = new BigNumber(rawData.bestBidPrice);
      const midPriceBN = askPriceBN.plus(bidPriceBN).dividedBy(2);
      midPrice = midPriceBN.toString();
    } else if (rawData.bestAskPrice) {
      midPrice = String(rawData.bestAskPrice);
    } else if (rawData.bestBidPrice) {
      midPrice = String(rawData.bestBidPrice);
    } else {
      midPrice = "0";
    }

    // Build ticker object - keep all values in wei format
    const ticker: Ticker = {
      symbol: rawData.symbol,
      lastPrice: String(rawData.lastPrice || "0"),
      high24h: String(rawData.high24h || "0"),
      low24h: String(rawData.low24h || "0"),
      amount24h: String(rawData.amount24h || "0"),
      volume24h: String(rawData.volume24h || "0"),
      midPrice,
      timestamp: rawData.timestamp || Date.now(),
    };

    // Optional fields - keep in wei format
    if (rawData.markPrice) {
      ticker.markPrice = String(rawData.markPrice);
    }
    if (rawData.bestAskPrice) {
      ticker.bestAskPrice = String(rawData.bestAskPrice);
    }
    if (rawData.bestBidPrice) {
      ticker.bestBidPrice = String(rawData.bestBidPrice);
    }
    if (rawData.bestAskAmount) {
      ticker.bestAskAmount = String(rawData.bestAskAmount);
    }
    if (rawData.bestBidAmount) {
      ticker.bestBidAmount = String(rawData.bestBidAmount);
    }
    if (rawData.open24h) {
      ticker.open24h = String(rawData.open24h);
    }
    if (rawData.change24h) {
      ticker.change24h = String(rawData.change24h);
    }
    if (rawData.rate24h) {
      ticker.rate24h = String(rawData.rate24h);
    }
    if (rawData.openPrice) {
      ticker.openPrice = String(rawData.openPrice);
    }
    if (rawData.oraclePrice) {
      ticker.oraclePrice = String(rawData.oraclePrice);
    }
    if (rawData.fundingRate) {
      ticker.fundingRate = String(rawData.fundingRate);
    }
    if (rawData.openInterest) {
      ticker.openInterest = String(rawData.openInterest);
    }

    return ticker;
  }

  /**
   * Add isolated margin to an existing position (on-chain)
   * @param params Margin adjustment parameters
   */
  async addMargin(params: MarginAdjustmentParams): Promise<SuiTransactionBlockResponse> {
    const transaction = await this.buildMarginTransaction(params, "add");
    if (transaction) {
      return this.exchangeOnChain.executeTxBlock(transaction, this.keypair);
    }
    const fallbackPayload = this.buildMarginCallArgs(params, "add");
    return this.exchangeOnChain.addMargin(fallbackPayload);
  }

  /**
   * Remove isolated margin from an existing position (on-chain)
   * @param params Margin adjustment parameters
   */
  async removeMargin(params: MarginAdjustmentParams): Promise<SuiTransactionBlockResponse> {
    const transaction = await this.buildMarginTransaction(params, "remove");
    if (transaction) {
      return this.exchangeOnChain.executeTxBlock(transaction, this.keypair);
    }
    const fallbackPayload = this.buildMarginCallArgs(params, "remove");
    return this.exchangeOnChain.removeMargin(fallbackPayload);
  }

  /**
   * Build ExchangeOnChain call args for margin adjustments
   */
  private buildMarginCallArgs(
    params: MarginAdjustmentParams,
    action: "add" | "remove"
  ): {
    amount: number;
    account: string;
    perpID?: string;
    market?: string;
    subAccountsMapID?: string;
    gasBudget?: number;
    txHash?: string;
  } {
    const { amount, accountAddress, symbol, market, perpId, subAccountsMapId, gasBudget, txHash } =
      params;

    if (!this.isPositiveNumber(amount)) {
      throw new Error(`Amount must be greater than zero to ${action} margin`);
    }

    const amountNumber = new BigNumber(amount).toNumber();
    if (!Number.isFinite(amountNumber)) {
      throw new Error("Amount is too large to represent as a number");
    }

    const marketSymbolInput = market || symbol;
    const marketSymbol = marketSymbolInput ? marketSymbolInput.toUpperCase() : undefined;
    const resolvedPerpId =
      perpId || (marketSymbol ? this.resolvePerpIdFromDeployment(marketSymbol) : undefined);

    if (!marketSymbol && !resolvedPerpId) {
      throw new Error("Either market/symbol or perpId must be provided for margin adjustments");
    }

    return {
      amount: amountNumber,
      account: accountAddress || this.walletAddress,
      market: marketSymbol,
      perpID: resolvedPerpId,
      subAccountsMapID: subAccountsMapId,
      gasBudget,
      txHash,
    };
  }

  private getDeploymentPackageId(): string {
    const packages = this.deploymentConfig?.packages;
    if (!packages || !packages.length) {
      throw new Error("Deployment config missing packages array");
    }
    return packages[packages.length - 1];
  }

  private getDeploymentProtocolConfigId(): string {
    const protocolId = this.deploymentConfig?.objects?.ProtocolConfig?.id;
    if (!protocolId) {
      throw new Error("Deployment config missing ProtocolConfig id");
    }
    return protocolId;
  }

  private async buildMarginTransaction(
    params: MarginAdjustmentParams,
    action: "add" | "remove"
  ): Promise<Transaction | undefined> {
    if (!this.transactionBuilder) {
      return undefined;
    }
    const payload = this.buildMarginCallArgs(params, action);
    const updatePriceTx = payload.market
      ? await this.buildUpdatePriceTransaction(payload.market)
      : undefined;
    const baseTx = updatePriceTx || new Transaction();
    if (action === "add") {
      return this.transactionBuilder.exchange_addMarginTx(payload, baseTx, params.gasBudget);
    }
    return this.transactionBuilder.exchange_removeMarginTx(payload, baseTx, params.gasBudget);
  }

  private async buildUpdatePriceTransaction(symbol: string): Promise<Transaction | undefined> {
    if (!symbol) {
      return undefined;
    }
    try {
      const result = await this.getLatestSignedPriceFeed(symbol);
      if (!result.status || !result.data) {
        console.warn(`Failed to fetch signed price feed for ${symbol}:`, result.error);
        return undefined;
      }
      const { payload, signature, publicKey } = result.data;
      return this.transactionBuilder.buildSignedPriceFeedTx({ payload, signature, publicKey });
    } catch (error) {
      console.warn(`Failed to build price update transaction for ${symbol}:`, error);
      return undefined;
    }
  }

  /**
   * Resolve perpId from deployment data
   */
  private resolvePerpIdFromDeployment(market: string): string | undefined {
    try {
      const perpId = this.exchangeOnChain.getPerpetualID(market);
      return perpId || undefined;
    } catch (error) {
      console.warn(`Failed to resolve PerpetualID for market ${market}:`, error);
      return undefined;
    }
  }

  /**
   * Deposit to bank (fund account)
   * Deposit USDC from wallet to exchange bank account for trading collateral
   * @param amount Deposit amount in USDC (standard units, e.g., 10 means 10 USDC)
   * @returns On-chain transaction result
   * @example
   * ```typescript
   * const result = await sdk.depositToBank(100); // Deposit 100 USDC
   * ```
   */
  async depositToBank(amount: number) {
    return await this.exchangeOnChain.depositToBank(
      {
        amount: formatNormalToWei(amount, DECIMALS.USDC),
        accountAddress: this.address,
      },
      this.keypair
    );
  }

  /**
   * Withdraw from bank (withdraw funds)
   * Withdraw USDC from exchange bank account back to wallet
   * @param amount Withdraw amount in USDC (standard units, e.g., 50 means 50 USDC)
   * @returns On-chain transaction result
   * @example
   * ```typescript
   * const result = await sdk.withdrawFromBank(50); // Withdraw 50 USDC
   * ```
   */
  async withdrawFromBank(amount: number) {
    return await this.exchangeOnChain.withdrawFromBank(
      {
        amount: formatNormalToWei(amount, DECIMALS.USDC),
        accountAddress: this.address,
      },
      this.keypair
    );
  }

  // =======================================================================
  //  Public Market Data
  // =======================================================================

  /**
   * Fetch the public global trading config (e.g. min/max leverage,
   * margin ratios, fee tiers, etc.). Mirrors `/perp-trade-api/trade/public/global-config`.
   */
  async getGlobalConfig(): Promise<SDKResponse<GlobalConfig>> {
    return this.publicCall<GlobalConfig, GlobalConfig>(
      () =>
        this.httpClient.get<GlobalConfig>(API_ENDPOINTS.GET_GLOBAL_CONFIG, {
          publicEndpoint: true,
        }),
      (resp) => ({ status: true, data: resp.data || ({} as GlobalConfig) }),
      "Failed to load global config"
    );
  }

  /**
   * Fetch 24h / 7d aggregated volume metrics. Public endpoint.
   */
  async getVolumes(): Promise<SDKResponse<VolumesSummary>> {
    return this.publicCall<any, VolumesSummary>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.GET_VOLUMES, {
          publicEndpoint: true,
        }),
      (resp) => {
        const d = resp.data || {};
        return {
          status: true,
          data: {
            ...d,
            volume24h: d.volume24h ? this.formatWeiToNormal(d.volume24h) : "0",
            volume7d: d.volume7d ? this.formatWeiToNormal(d.volume7d) : undefined,
            daily: Array.isArray(d.daily)
              ? d.daily.map((p: any) => ({
                  time: Number(p.time ?? p.timestamp ?? 0),
                  volume: this.formatWeiToNormal(p.volume ?? "0"),
                }))
              : undefined,
          },
        };
      },
      "Failed to load volumes"
    );
  }

  /**
   * Fetch the latest signed price feed from the backend (`/perp-market-api/price/latest`),
   * same source as ts-frontend margin adjustment flow.
   * The returned `{ payload, signature, publicKey }` can be passed to
   * `TransactionBuilder.buildSignedPriceFeedTx()` or vault on-chain helpers.
   * @param symbol Optional market symbol (e.g. `BTC-PERP`); forwarded as `symbols` query param when set.
   */
  async getLatestSignedPriceFeed(symbol?: string): Promise<SDKResponse<LatestPrice>> {
    return this.publicCall<LatestPrice, LatestPrice>(
      () =>
        this.httpClient.get<LatestPrice>(API_ENDPOINTS.GET_LATEST_PRICE, {
          publicEndpoint: true,
          ...(symbol ? { params: { symbols: symbol } } : {}),
        }),
      (resp) => {
        const raw = resp.data as LatestPrice | { data?: LatestPrice } | undefined;
        const d =
          raw &&
          "payload" in raw &&
          raw.payload != null &&
          raw.signature != null &&
          raw.publicKey != null
            ? (raw as LatestPrice)
            : raw &&
                typeof raw === "object" &&
                "data" in raw &&
                raw.data &&
                raw.data.payload != null &&
                raw.data.signature != null &&
                raw.data.publicKey != null
              ? raw.data
              : undefined;
        if (!d?.payload || !d?.signature || !d?.publicKey) {
          return { status: false, error: "Empty signed price feed" };
        }
        return { status: true, data: d };
      },
      "Failed to load signed price feed"
    );
  }

  /** Fetch funding rate detail for a symbol. */
  async getFundingRateDetail(symbol: string): Promise<SDKResponse<FundingRateDetail>> {
    if (!symbol) return { status: false, error: "symbol is required" };
    return this.publicCall<FundingRateDetail, FundingRateDetail>(
      () =>
        this.httpClient.get<FundingRateDetail>(API_ENDPOINTS.GET_FUNDING_RATE_DETAIL, {
          params: { symbol },
          publicEndpoint: true,
        }),
      (resp) => ({ status: true, data: resp.data || ({ symbol } as FundingRateDetail) }),
      "Failed to load funding rate detail"
    );
  }

  /** Fetch funding rate chart points for a symbol. */
  async getFundingRateChart(symbol: string): Promise<SDKResponse<FundingRateChartPoint[]>> {
    if (!symbol) return { status: false, error: "symbol is required" };
    return this.publicCall<any, FundingRateChartPoint[]>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.GET_FUNDING_RATE_CHART, {
          params: { symbol },
          publicEndpoint: true,
        }),
      (resp) => {
        const list = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
        return {
          status: true,
          data: list.map((p: any) => ({
            time: Number(p.time ?? p.timestamp ?? 0),
            fundingRate: this.formatWeiToNormal(p.fundingRate ?? p.rate ?? "0"),
            ...p,
          })),
        };
      },
      "Failed to load funding rate chart"
    );
  }

  /** Fetch paginated funding rate history. */
  async getFundingRateHistory(
    query?: PaginatedQuery
  ): Promise<SDKResponse<Paginated<FundingRateHistoryItem>>> {
    return this.fetchPaginatedList<any, FundingRateHistoryItem>(
      API_ENDPOINTS.GET_FUNDING_RATE_HISTORY,
      query,
      (raw) => ({
        time: Number(raw.time ?? raw.timestamp ?? 0),
        fundingRate: this.formatWeiToNormal(raw.fundingRate ?? raw.rate ?? "0"),
        symbol: raw.symbol,
        ...raw,
      })
    );
  }

  /**
   * Fetch K-line / candlestick history. The backend supports two response
   * formats — array `[time, open, high, low, close, volume]` or an object
   * with named fields — both are normalized into {@link KlineBar}.
   */
  async getKlineHistory(query: KlineQueryParams): Promise<SDKResponse<KlineBar[]>> {
    if (!query?.symbol || !query.interval) {
      return { status: false, error: "symbol and interval are required" };
    }
    return this.publicCall<any, KlineBar[]>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.GET_KLINE_HISTORY, {
          params: query,
          publicEndpoint: true,
        }),
      (resp) => {
        const raw: any[] = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
        const bars: KlineBar[] = raw.map((row: any) => {
          if (Array.isArray(row)) {
            const [time, open, high, low, close, volume] = row;
            return {
              time: Number(time ?? 0),
              open: this.formatWeiToNormal(open ?? "0"),
              high: this.formatWeiToNormal(high ?? "0"),
              low: this.formatWeiToNormal(low ?? "0"),
              close: this.formatWeiToNormal(close ?? "0"),
              volume: this.formatWeiToNormal(volume ?? "0"),
            };
          }
          return {
            time: Number(row.time ?? row.timestamp ?? 0),
            open: this.formatWeiToNormal(row.open ?? "0"),
            high: this.formatWeiToNormal(row.high ?? "0"),
            low: this.formatWeiToNormal(row.low ?? "0"),
            close: this.formatWeiToNormal(row.close ?? "0"),
            volume: this.formatWeiToNormal(row.volume ?? "0"),
          };
        });
        return { status: true, data: bars };
      },
      "Failed to load kline"
    );
  }

  /** Fetch announcements. Public. */
  async getAnnouncements(): Promise<SDKResponse<AnnouncementItem[]>> {
    return this.publicCall<any, AnnouncementItem[]>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.GET_ANNOUNCEMENTS, {
          publicEndpoint: true,
        }),
      (resp) => {
        const list = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
        return { status: true, data: list as AnnouncementItem[] };
      },
      "Failed to load announcements"
    );
  }

  /** Fetch active notice items. Public. */
  async getNotice(): Promise<SDKResponse<NoticeItem[]>> {
    return this.publicCall<any, NoticeItem[]>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.GET_NOTICE, {
          publicEndpoint: true,
        }),
      (resp) => {
        const list = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
        return { status: true, data: list as NoticeItem[] };
      },
      "Failed to load notice"
    );
  }

  // =======================================================================
  //  Trading History
  // =======================================================================

  /** Fetch paginated history orders. */
  async getHistoryOrders(query?: PaginatedQuery): Promise<SDKResponse<Paginated<HistoryOrder>>> {
    return this.fetchPaginatedList<any, HistoryOrder>(
      API_ENDPOINTS.GET_HISTORY_ORDERS,
      query,
      (raw) => ({
        ...raw,
        quantity: this.formatWeiToNormal(raw.quantity ?? "0"),
        filledQty: raw.filledQty ? this.formatWeiToNormal(raw.filledQty) : undefined,
        avgPrice: raw.avgPrice ? this.formatWeiToNormal(raw.avgPrice) : undefined,
        price: raw.price ? this.formatWeiToNormal(raw.price) : undefined,
        leverage: raw.leverage ? this.formatWeiToNormal(raw.leverage) : undefined,
        realizedPnl: raw.realizedPnl ? this.formatWeiToNormal(raw.realizedPnl) : undefined,
        fee: raw.fee ? this.formatWeiToNormal(raw.fee) : undefined,
      })
    );
  }

  /** Fetch paginated funding settlements. */
  async getFundingSettlements(
    query?: PaginatedQuery
  ): Promise<SDKResponse<Paginated<FundingSettlement>>> {
    return this.fetchPaginatedList<any, FundingSettlement>(
      API_ENDPOINTS.GET_FUNDING_SETTLEMENTS,
      query,
      (raw) => ({
        ...raw,
        symbol: raw.symbol,
        side: raw.positionIsLong === 1 ? "LONG" : raw.positionIsLong === 0 ? "SHORT" : raw.side,
        settlementAmount: this.formatWeiToNormal(raw.settlementAmount ?? "0"),
        quantity: this.formatWeiToNormal(raw.size ?? raw.quantity ?? "0"),
        fundingRate: raw.fundingRate ? this.formatWeiToNormal(raw.fundingRate) : undefined,
        time: Number(raw.createdAt ?? raw.time ?? 0),
      })
    );
  }

  /** Fetch paginated balance change records. */
  async getBalanceChanges(query?: PaginatedQuery): Promise<SDKResponse<Paginated<BalanceChange>>> {
    return this.fetchPaginatedList<any, BalanceChange>(
      API_ENDPOINTS.GET_BALANCE_CHANGES,
      query,
      (raw) => ({
        ...raw,
        amount: this.formatWeiToNormal(raw.accountValueChange ?? raw.amount ?? "0"),
        event: raw.event ?? raw.action,
        status: raw.status,
        txn: raw.txn,
        time: Number(raw.time ?? raw.createdAt ?? 0),
      })
    );
  }

  // =======================================================================
  //  Plan order cancellation
  // =======================================================================

  /**
   * Cancel a plan (TP/SL) order by id or hash.
   * Mirrors `/perp-trade-api/plan/cancelplanorder` used in ts-frontend.
   */
  async cancelPlanOrder(params: CancelPlanOrderParams): Promise<SDKResponse<OrderResponse>> {
    if (!params || (!params.planId && !params.hash)) {
      return { status: false, error: "planId or hash is required" };
    }
    const payload: Record<string, any> = {
      ...(params.planId !== undefined ? { planId: params.planId } : {}),
      ...(params.hash ? { hash: params.hash } : {}),
      ...(params.symbol ? { symbol: params.symbol } : {}),
      ...(params.parentAddress ? { parentAddress: params.parentAddress } : {}),
    };
    const requestOverride = this.buildOneCtRequestConfig(API_ENDPOINTS.CANCEL_PLAN_ORDER);
    return this.authedCall<OrderResponse, OrderResponse>(
      () =>
        this.httpClient.post<OrderResponse>(
          API_ENDPOINTS.CANCEL_PLAN_ORDER,
          payload,
          requestOverride
        ),
      (response) => ({ status: true, data: response }),
      "Failed to cancel plan order"
    );
  }

  // =======================================================================
  //  1CT / API account management
  // =======================================================================

  /**
   * List the user's currently registered 1CT / API sub-accounts.
   */
  async listApiAccounts(): Promise<SDKResponse<ApiAccount[]>> {
    return this.authedCall<any, ApiAccount[]>(
      () => this.httpClient.get<any>(API_ENDPOINTS.LIST_API_ACCOUNTS),
      (resp) => {
        const list = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
        return { status: true, data: list as ApiAccount[] };
      },
      "Failed to list API accounts"
    );
  }

  /**
   * Register a new 1CT / API sub-account.
   * The caller should already have generated a sub-account keypair and signed
   * the {@link ONBOARDING_MESSAGE} with it; pass the signature here.
   * See {@link enableOneClickTrading} for the full end-to-end flow.
   */
  async createApiAccount(
    params: CreateApiAccountParams
  ): Promise<SDKResponse<{ token?: string; address?: string; [key: string]: any }>> {
    return this.authedCall<any, any>(
      () =>
        this.httpClient.post<any>(API_ENDPOINTS.CREATE_API_ACCOUNT, {
          userAddress: params.address,
          isTermAccepted: params.isTermAccepted ?? true,
          signature: params.signature,
          alias: params.alias,
        }),
      (resp) => ({ status: true, data: resp.data }),
      "Failed to create API account"
    );
  }

  /**
   * Remove a previously registered 1CT / API sub-account by address.
   */
  async removeApiAccount(apiAddress: string): Promise<SDKResponse<any>> {
    if (!apiAddress) return { status: false, error: "apiAddress is required" };
    return this.authedCall<any, any>(
      () =>
        this.httpClient.post<any>(API_ENDPOINTS.REMOVE_API_ACCOUNT, {
          apiAddress,
        }),
      (resp) => ({ status: true, data: resp.data }),
      "Failed to remove API account"
    );
  }

  /**
   * Fetch the list of expired (or to-be-disabled) 1CT sub-account addresses
   * for the current account or a vault. Used to pre-populate the disable list
   * when rotating 1CT sub-accounts.
   */
  async getExpired1CTAccounts(parentAddress?: string): Promise<SDKResponse<string[]>> {
    return this.authedCall<any, string[]>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.GET_EXPIRED_1CT_ACCOUNTS, {
          params: parentAddress ? { parentAddress } : undefined,
        }),
      (resp) => {
        const list = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
        return { status: true, data: list as string[] };
      },
      "Failed to load expired 1CT accounts"
    );
  }

  // =======================================================================
  //  1CT helpers (combined REST + on-chain)
  // =======================================================================

  /**
   * One-shot helper that:
   *   1. Generates a fresh Ed25519 sub-account keypair (or uses the one supplied).
   *   2. Signs the onboarding message with it and obtains a 1CT JWT from the backend.
   *   3. Builds a ProgrammableTransactionBlock that authorizes the new sub-account
   *      (and revokes any previously expired sub-accounts) on chain.
   *   4. Signs and executes the tx with the main wallet.
   *   5. Configures `setOneClickTradingCredentials` so subsequent `placeOrder` /
   *      `cancelOrder` calls automatically route through the new JWT + keypair.
   *
   * Pass `parentAddress` to operate on a vault sub-trader instead of the
   * main wallet's sub-account map (mirrors `useOneClickTrading` in ts-frontend).
   *
   * @returns The new sub-account's address and JWT, plus the on-chain tx response.
   */
  async enableOneClickTrading(opts?: {
    /** Reuse an existing sub-account keypair (defaults to a fresh random one). */
    subAccountKeypair?: Ed25519Keypair;
    /** Vault id when authorizing a vault sub-trader (else main account). */
    parentAddress?: string;
    /** Optional alias for the sub-account on the backend. */
    alias?: string;
    /** Optional gas budget for the on-chain tx. */
    gasBudget?: number;
  }): Promise<
    SDKResponse<{
      address: string;
      jwt: string;
      privateKey: string;
      txResponse: SuiTransactionBlockResponse;
    }>
  > {
    try {
      const subKeypair = opts?.subAccountKeypair ?? Ed25519Keypair.generate();
      const subAddress = subKeypair.getPublicKey().toSuiAddress();
      const subPrivateKey = subKeypair.getSecretKey();

      // 1. Sub-account signs the onboarding message
      const messageBytes = new TextEncoder().encode(ONBOARDING_MESSAGE);
      const signResult = await subKeypair.signPersonalMessage(messageBytes);
      const signature = buildSignature(signResult.signature, true);

      // 2. Make sure the main account is authenticated, then ask the backend
      //    for the 1CT JWT via the same /api/authorize endpoint that the
      //    frontend uses.
      const auth = await this.authenticate();
      if (!auth.status) {
        return { status: false, error: auth.error || "Main authentication failed" };
      }
      const authResp = await this.httpClient.post<{ token?: string }>(API_ENDPOINTS.AUTHORIZE, {
        userAddress: subAddress,
        isTermAccepted: true,
        signature,
      });
      if (authResp.code !== 200 || !authResp.data?.token) {
        return {
          status: false,
          error: authResp.message || "Sub-account authorize failed",
        };
      }
      const jwt = authResp.data.token;

      // 3. Fetch the list of currently-disabled / expired sub-accounts so we
      //    can revoke them in the same tx (matches frontend behavior).
      const disabledList = await this.getExpired1CTAccounts(opts?.parentAddress);
      const expired = disabledList.status ? disabledList.data || [] : [];

      // 4. Build the authorization tx
      const parent = opts?.parentAddress;
      let tx: Transaction;
      if (parent) {
        tx = this.transactionBuilder.vault_setSubTraderTx({
          vaultID: parent,
          subTrader: subAddress,
          status: true,
        });
        for (const old of expired) {
          tx = this.transactionBuilder.vault_setSubTraderTx(
            { vaultID: parent, subTrader: old, status: false },
            tx
          );
        }
      } else {
        tx = this.transactionBuilder.sub_accounts_setSubAccountTx({
          account: subAddress,
          status: true,
        });
        for (const old of expired) {
          tx = this.transactionBuilder.sub_accounts_setSubAccountTx(
            { account: old, status: false },
            tx
          );
        }
      }
      if (opts?.gasBudget) tx.setGasBudget(opts.gasBudget);
      tx.setSender(this.walletAddress);

      const txResponse = await this.exchangeOnChain.executeTxBlock(tx, this.keypair);

      // 5. Try to register on the backend's `api-account/create` registry too
      //    (best effort — older deployments may not expose this endpoint).
      try {
        await this.createApiAccount({
          address: subAddress,
          signature,
          alias: opts?.alias,
        });
      } catch {
        // ignore: not all deployments require this step
      }

      // 6. Activate the credentials so future trade calls flow through 1CT.
      this.setOneClickTradingCredentials({
        address: subAddress,
        jwt,
        privateKey: subPrivateKey,
      });

      return {
        status: true,
        data: { address: subAddress, jwt, privateKey: subPrivateKey, txResponse },
      };
    } catch (e) {
      return { status: false, error: formatError(e) };
    }
  }

  /**
   * Disable 1CT for the current account (or a vault) by revoking the on-chain
   * authorization for the active 1CT sub-account, and clearing the locally
   * stored credentials.
   */
  async disableOneClickTrading(opts?: {
    /** Vault id (revokes the vault sub-trader). */
    parentAddress?: string;
    /** Override sub-account address (defaults to the active 1CT credentials). */
    subAccountAddress?: string;
    /** Optional gas budget. */
    gasBudget?: number;
  }): Promise<SDKResponse<{ txResponse: SuiTransactionBlockResponse }>> {
    try {
      const subAddress = opts?.subAccountAddress ?? this.oneClickTrading?.address;
      if (!subAddress) {
        return {
          status: false,
          error: "No active 1CT sub-account address found",
        };
      }

      const parent = opts?.parentAddress;
      const tx: Transaction = parent
        ? this.transactionBuilder.vault_setSubTraderTx({
            vaultID: parent,
            subTrader: subAddress,
            status: false,
          })
        : this.transactionBuilder.sub_accounts_setSubAccountTx({
            account: subAddress,
            status: false,
          });
      if (opts?.gasBudget) tx.setGasBudget(opts.gasBudget);
      tx.setSender(this.walletAddress);

      const txResponse = await this.exchangeOnChain.executeTxBlock(tx, this.keypair);

      // Best-effort: also remove the registry entry on the backend.
      try {
        await this.removeApiAccount(subAddress);
      } catch {
        // ignore
      }

      this.setOneClickTradingCredentials(null);
      return { status: true, data: { txResponse } };
    } catch (e) {
      return { status: false, error: formatError(e) };
    }
  }

  // =======================================================================
  //  Sponsor (gas-free) service
  // =======================================================================

  /** Check whether a sponsored transaction is currently available. */
  async sponsorValid(): Promise<SDKResponse<{ valid: boolean; [key: string]: any }>> {
    return this.publicCall<any, any>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.SPONSOR_VALID, {
          publicEndpoint: true,
        }),
      (resp) => ({
        status: true,
        data: { valid: !!resp.data?.valid, ...(resp.data || {}) },
      }),
      "Failed to validate sponsor"
    );
  }

  /**
   * Ask the sponsor to pre-sign a sponsored transaction.
   * Returns the sponsor-signed `txBytes` + `sponsorSignature` ready for the
   * caller to add their own signature and submit via {@link sponsorSubmit}.
   */
  async sponsorCreate(payload: Record<string, any>): Promise<SDKResponse<SponsorSignResponse>> {
    return this.authedCall<SponsorSignResponse, SponsorSignResponse>(
      () => this.httpClient.post<SponsorSignResponse>(API_ENDPOINTS.SPONSOR_CREATE, payload),
      (resp) => ({ status: true, data: resp.data || {} }),
      "Failed to create sponsor tx"
    );
  }

  /** Submit a fully-signed sponsored transaction. */
  async sponsorSubmit(payload: Record<string, any>): Promise<SDKResponse<SponsorSubmitResponse>> {
    return this.authedCall<SponsorSubmitResponse, SponsorSubmitResponse>(
      () => this.httpClient.post<SponsorSubmitResponse>(API_ENDPOINTS.SPONSOR_SUBMIT, payload),
      (resp) => ({ status: true, data: resp.data || {} }),
      "Failed to submit sponsor tx"
    );
  }

  // =======================================================================
  //  Vault REST APIs
  // =======================================================================

  /** Public vault overview (TVL, number of depositors, ...). */
  async getVaultOverview(): Promise<SDKResponse<VaultOverview>> {
    return this.publicCall<any, VaultOverview>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_OVERVIEW, {
          publicEndpoint: true,
        }),
      (resp) => {
        const d = resp.data || {};
        return {
          status: true,
          data: {
            ...d,
            tvl: this.formatWeiToNormal(d.tvl ?? "0"),
            depositorTotal: this.formatWeiToNormal(d.depositorTotal ?? "0"),
          },
        };
      },
      "Failed to load vault overview"
    );
  }

  /** Vault config (max cap, creating fee, ...). */
  async getVaultConfig(): Promise<SDKResponse<VaultConfig>> {
    return this.publicCall<any, VaultConfig>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_CONFIG, {
          publicEndpoint: true,
        }),
      (resp) => {
        const d = resp.data || {};
        return {
          status: true,
          data: {
            ...d,
            maxCap: this.formatWeiToNormal(d.maxCap ?? "0"),
            vaultCreatingFee: this.formatWeiToNormal(d.vaultCreatingFee ?? "0"),
          },
        };
      },
      "Failed to load vault config"
    );
  }

  /** Public list of vaults. */
  async getVaultList(query?: Record<string, any>): Promise<SDKResponse<VaultListItem[]>> {
    return this.publicCall<any, VaultListItem[]>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_LIST, {
          params: query,
          publicEndpoint: true,
        }),
      (resp) => {
        const list = Array.isArray(resp.data) ? resp.data : resp.data?.data || [];
        return { status: true, data: list.map((v: any) => this.transformVaultListItem(v)) };
      },
      "Failed to load vault list"
    );
  }

  /**
   * Vault object ids / metadata for vaults created by a wallet (public).
   * Mirrors ts-frontend `GET /api/perp-vault-api/public/vaults/by-creator`.
   */
  async getVaultsByCreator(walletAddress?: string): Promise<SDKResponse<any>> {
    const addr = walletAddress ?? this.walletAddress;
    return this.publicCall<any, any>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_BY_CREATOR, {
          params: { address: addr },
          publicEndpoint: true,
        }),
      (resp) => ({ status: true, data: resp.data ?? [] }),
      "Failed to load vaults by creator"
    );
  }

  /** Detailed info for a single vault. */
  async getVaultDetail(vaultId: string): Promise<SDKResponse<VaultDetail>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.publicCall<any, VaultDetail>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_DETAIL, {
          params: { vaultId },
          publicEndpoint: true,
        }),
      (resp) => {
        const d = resp.data || {};
        const base = this.transformVaultListItem(d);
        return {
          status: true,
          data: {
            ...base,
            creatorMinimumShareRatio: this.formatWeiToNormal(d.creatorMinimumShareRatio ?? "0"),
            creatorProfitShareRatio: this.formatWeiToNormal(d.creatorProfitShareRatio ?? "0"),
            creatorLossShareRatio: this.formatWeiToNormal(d.creatorLossShareRatio ?? "0"),
            followerMaxCap: d.followerMaxCap ? this.formatWeiToNormal(d.followerMaxCap) : undefined,
            profitShare: this.formatWeiToNormal(d.profitShare ?? "0"),
            totalDepositors: this.formatWeiToNormal(d.totalDepositors ?? "0"),
          } as VaultDetail,
        };
      },
      "Failed to load vault detail"
    );
  }

  /** Vault performance summary. */
  async getVaultPerformance(vaultId: string): Promise<SDKResponse<VaultPerformance>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.publicCall<any, VaultPerformance>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_PERFORMANCE, {
          params: { vaultId },
          publicEndpoint: true,
        }),
      (resp) => {
        const d = resp.data || {};
        return {
          status: true,
          data: {
            ...d,
            navps: d.navps ? this.formatWeiToNormal(d.navps) : undefined,
            pnl: this.formatWeiToNormal(d.pnl ?? "0"),
            upnl: d.upnl ? this.formatWeiToNormal(d.upnl) : undefined,
            maxDrawDown: this.formatWeiToNormal(d.maxDrawDown ?? "0"),
            creatorFund: d.creatorFund ? this.formatWeiToNormal(d.creatorFund) : undefined,
            depositorTotal: d.depositorTotal ? this.formatWeiToNormal(d.depositorTotal) : undefined,
            cumDepositorTotal: d.cumDepositorTotal
              ? this.formatWeiToNormal(d.cumDepositorTotal)
              : undefined,
            shareRatio: d.shareRatio ? this.formatWeiToNormal(d.shareRatio) : undefined,
          },
        };
      },
      "Failed to load vault performance"
    );
  }

  /** Vault value chart (raw passthrough). */
  async getVaultValueChart(vaultId: string): Promise<SDKResponse<any>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.publicCall<any, any>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_VALUE_CURVE, {
          params: { vaultId },
          publicEndpoint: true,
        }),
      (resp) => ({ status: true, data: resp.data }),
      "Failed to load vault value chart"
    );
  }

  /** Vault PNL chart (raw passthrough). */
  async getVaultPNLChart(vaultId: string): Promise<SDKResponse<any>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.publicCall<any, any>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_PNL_CURVE, {
          params: { vaultId },
          publicEndpoint: true,
        }),
      (resp) => ({ status: true, data: resp.data }),
      "Failed to load vault pnl chart"
    );
  }

  /** Vault perp account info. */
  async getVaultAccount(vaultId: string): Promise<SDKResponse<VaultAccount>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.publicCall<any, VaultAccount>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_ACCOUNT, {
          params: { vaultId },
          publicEndpoint: true,
        }),
      (resp) => {
        const d = resp.data || {};
        return {
          status: true,
          data: {
            ...d,
            navps: this.formatWeiToNormal(d.navps ?? "0"),
            accountValue: this.formatWeiToNormal(d.accountValue ?? "0"),
            availableBalance: this.formatWeiToNormal(d.availableBalance ?? "0"),
            creatorFund: d.creatorFund ? this.formatWeiToNormal(d.creatorFund) : undefined,
            shareRatio: this.formatWeiToNormal(d.shareRatio ?? "0"),
            remainQuote: this.formatWeiToNormal(d.remainQuote ?? "0"),
            vaultLevelQuota: d.vaultLevelQuota
              ? this.formatWeiToNormal(d.vaultLevelQuota)
              : undefined,
            followerMaxCap: d.followerMaxCap ? this.formatWeiToNormal(d.followerMaxCap) : undefined,
          },
        };
      },
      "Failed to load vault account"
    );
  }

  /** Vault positions / pending / filled / funding-history / deposits-withdraws / depositors. */
  async getVaultPositions(vaultId: string): Promise<SDKResponse<{ list: any[]; count: number }>> {
    return this.fetchVaultListEndpoint(API_ENDPOINTS.VAULT_POSITIONS, vaultId, (item) => ({
      ...item,
      quantity: this.formatWeiToNormal(item.quantity ?? "0"),
      avgOpen: this.formatWeiToNormal(item.avgOpen ?? "0"),
      margin: this.formatWeiToNormal(item.margin ?? "0"),
      oraclePrice: this.formatWeiToNormal(item.oraclePrice ?? "0"),
      upnl: this.formatWeiToNormal(item.upnl ?? "0"),
      funding: this.formatWeiToNormal(item.funding ?? "0"),
      leverage: this.formatWeiToNormal(item.leverage ?? "0"),
      roe: this.formatWeiToNormal(item.roe ?? "0"),
    }));
  }

  async getVaultPendingOrders(
    vaultId: string
  ): Promise<SDKResponse<{ list: any[]; count: number }>> {
    return this.fetchVaultListEndpoint(API_ENDPOINTS.VAULT_PENDING_ORDERS, vaultId, (item) => ({
      ...item,
      quantity: this.formatWeiToNormal(item.quantity ?? "0"),
      price: this.formatWeiToNormal(item.price ?? "0"),
      triggerPrice: this.formatWeiToNormal(item.triggerPrice ?? "0"),
      orderValue: this.formatWeiToNormal(item.orderValue ?? "0"),
      leverage: this.formatWeiToNormal(item.leverage ?? "0"),
      openQty: this.formatWeiToNormal(item.openQty ?? "0"),
    }));
  }

  async getVaultFilledOrders(
    vaultId: string
  ): Promise<SDKResponse<{ list: any[]; count: number }>> {
    return this.fetchVaultListEndpoint(API_ENDPOINTS.VAULT_FILLED_ORDERS, vaultId, (item) => ({
      ...item,
      quantity: this.formatWeiToNormal(item.quantity ?? "0"),
      price: this.formatWeiToNormal(item.price ?? "0"),
      avgPrice: this.formatWeiToNormal(item.avgPrice ?? "0"),
      filledQuantity: this.formatWeiToNormal(item.filledQuantity ?? "0"),
      filledFee: this.formatWeiToNormal(item.filledFee ?? "0"),
      realizedPnl: this.formatWeiToNormal(item.realizedPnl ?? "0"),
      roe: this.formatWeiToNormal(item.roe ?? "0"),
      leverage: this.formatWeiToNormal(item.leverage ?? "0"),
      entryPrice: this.formatWeiToNormal(item.entryPrice ?? "0"),
    }));
  }

  async getVaultFundingHistory(
    vaultId: string
  ): Promise<SDKResponse<{ list: any[]; count: number }>> {
    return this.fetchVaultListEndpoint(API_ENDPOINTS.VAULT_FUNDING_HISTORY, vaultId, (item) => ({
      ...item,
      quantity: this.formatWeiToNormal(item.size ?? item.quantity ?? "0"),
      settlementAmount: this.formatWeiToNormal(item.settlementAmount ?? "0"),
      side:
        item.positionIsLong === 1
          ? "LONG"
          : item.positionIsLong === 0
          ? "SHORT"
          : item.side ?? "LONG",
      time: Number(item.createdAt ?? item.time ?? 0),
    }));
  }

  async getVaultDepositsAndWithdraws(
    vaultId: string
  ): Promise<SDKResponse<{ list: any[]; count: number }>> {
    return this.fetchVaultListEndpoint(API_ENDPOINTS.VAULT_DEPOSITS_WITHDRAWS, vaultId, (item) => ({
      ...item,
      accountValueChange: this.formatWeiToNormal(item.accountValueChange ?? "0"),
    }));
  }

  async getVaultDepositors(vaultId: string): Promise<SDKResponse<{ list: any[]; count: number }>> {
    return this.fetchVaultListEndpoint(API_ENDPOINTS.VAULT_DEPOSITORS, vaultId, (item) => ({
      ...item,
      holding: this.formatWeiToNormal(item.holding ?? "0"),
      upnl: this.formatWeiToNormal(item.upnl ?? "0"),
      pnl: this.formatWeiToNormal(item.pnl ?? "0"),
    }));
  }

  /** Whitelist check for vault creators / depositors. Public. Uses `creator` query (ts-frontend). */
  async checkVaultWhitelist(
    creator?: string
  ): Promise<SDKResponse<{ inWhitelist: boolean; [key: string]: any }>> {
    const params: Record<string, any> = {};
    const addr = creator ?? this.walletAddress;
    if (addr) {
      params.creator = addr;
    }
    return this.publicCall<any, any>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_WHITELIST_CHECK, {
          params,
          publicEndpoint: true,
        }),
      (resp) => ({ status: true, data: resp.data || { inWhitelist: false } }),
      "Failed to check vault whitelist"
    );
  }

  /** My holdings across all vaults (auth). */
  async getVaultMyHoldings(): Promise<SDKResponse<VaultMyHoldings>> {
    return this.authedCall<any, VaultMyHoldings>(
      () => this.httpClient.get<any>(API_ENDPOINTS.VAULT_MY_HOLDINGS),
      (resp) => {
        const d = resp.data || {};
        const summary = d.summary || {};
        return {
          status: true,
          data: {
            summary: {
              ...summary,
              balanceTotal: this.formatWeiToNormal(summary.balanceTotal ?? "0"),
              upnlTotal: this.formatWeiToNormal(summary.upnlTotal ?? "0"),
              pnlTotal: this.formatWeiToNormal(summary.pnlTotal ?? "0"),
            },
            list: (d.list || []).map((v: any) => ({
              ...this.transformVaultListItem(v),
              myBalance: this.formatWeiToNormal(v.myBalance ?? "0"),
              pnl: this.formatWeiToNormal(v.pnl ?? "0"),
              upnl: this.formatWeiToNormal(v.upnl ?? "0"),
            })),
          },
        };
      },
      "Failed to load my holdings"
    );
  }

  /** My performance for a vault (auth). */
  async getVaultMyPerformance(vaultId: string): Promise<SDKResponse<VaultMyPerformance>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.authedCall<any, VaultMyPerformance>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_MY_PERFORMANCE, {
          params: { vaultId },
        }),
      (resp) => {
        const d = resp.data || {};
        return {
          status: true,
          data: {
            ...d,
            myBalance: this.formatWeiToNormal(d.myBalance ?? "0"),
            upnl: this.formatWeiToNormal(d.upnl ?? "0"),
            earned: this.formatWeiToNormal(d.earned ?? "0"),
            shares: this.formatWeiToNormal(d.shares ?? "0"),
            shareRatio: this.formatWeiToNormal(d.shareRatio ?? "0"),
            navps: this.formatWeiToNormal(d.navps ?? "0"),
            averagePrice: this.formatWeiToNormal(d.averagePrice ?? "0"),
          },
        };
      },
      "Failed to load my performance"
    );
  }

  /** My PNL chart for a vault (auth, raw passthrough). */
  async getVaultMyPnlChart(vaultId: string): Promise<SDKResponse<any>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.authedCall<any, any>(
      () =>
        this.httpClient.get<any>(API_ENDPOINTS.VAULT_MY_PNL_CURVE, {
          params: { vaultId },
        }),
      (resp) => ({ status: true, data: resp.data }),
      "Failed to load my pnl chart"
    );
  }

  /** Account-level transaction records (auth). */
  async getVaultTransactions(): Promise<SDKResponse<{ list: any[]; count: number }>> {
    return this.authedCall<any, { list: any[]; count: number }>(
      () => this.httpClient.get<any>(API_ENDPOINTS.VAULT_TRANSACTIONS),
      (resp) => {
        const arr = Array.isArray(resp.data) ? resp.data : resp.data?.list || [];
        const list = arr.map((item: any) => ({
          ...item,
          amount: this.formatWeiToNormal(item.amount ?? "0"),
        }));
        return { status: true, data: { list, count: list.length } };
      },
      "Failed to load vault transactions"
    );
  }

  /** Update the vault description (auth, creator only). */
  async updateVaultDescription(params: {
    vaultId: string;
    description: string;
  }): Promise<SDKResponse<any>> {
    if (!params?.vaultId) return { status: false, error: "vaultId is required" };
    return this.authedCall<any, any>(
      () => this.httpClient.put<any>(API_ENDPOINTS.VAULT_UPDATE_DESCRIPTION, params),
      (resp) => ({ status: true, data: resp.data }),
      "Failed to update vault description"
    );
  }

  /**
   * Upload a vault logo (creator only). `file` can be a web `Blob` or Node `Buffer`.
   * Field names match ts-frontend (`file`, `vaultId`).
   */
  async uploadVaultLogo(params: {
    vaultId: string;
    file: Blob | Buffer;
    filename?: string;
  }): Promise<SDKResponse<any>> {
    if (!params?.vaultId) {
      return { status: false, error: "vaultId is required" };
    }
    const form = new FormData();
    const name = params.filename ?? "logo.png";
    if (typeof Blob !== "undefined" && params.file instanceof Blob) {
      form.append("file", params.file, name);
    } else {
      form.append("file", new Blob([params.file as Uint8Array]), name);
    }
    form.append("vaultId", params.vaultId);
    return this.authedCall<any, any>(
      () => this.httpClient.postMultipart<any>(API_ENDPOINTS.VAULT_UPLOAD_LOGO, form),
      (resp) => ({ status: true, data: resp.data }),
      "Failed to upload vault logo"
    );
  }

  // =======================================================================
  //  Vault on-chain helpers (use SignedPriceFeedData)
  // =======================================================================

  /** Create a vault (normal user flow). Numeric fields use `DECIMALS.VAULT_CONFIG` (18) wei encoding. */
  async createVault(params: CreateVaultParams): Promise<SuiTransactionBlockResponse> {
    const d = DECIMALS.VAULT_CONFIG;
    return this.exchangeOnChain.createVault(
      {
        name: params.name,
        trader: params.trader,
        maxCap: formatNormalToWei(params.maxCap, d),
        minDepositAmount: formatNormalToWei(params.minDepositAmount ?? "0", d),
        creatorMinimumShareRatio: formatNormalToWei(params.creatorMinimumShareRatio ?? "0.05", d),
        creatorProfitShareRatio: formatNormalToWei(params.creatorProfitShareRatio ?? "0.2", d),
        initialAmount: formatNormalToWei(params.initialAmount, d),
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  /**
   * Create a vault as protocol manager (`vault::create_vault_by_manager`).
   * Optionally pass `managerCapId` when not using the default deployment cap.
   */
  async createVaultByManager(
    params: CreateVaultByManagerParams
  ): Promise<SuiTransactionBlockResponse> {
    const d = DECIMALS.VAULT_CONFIG;
    const tx = this.transactionBuilder.vault_createVaultByManagerTx(
      {
        creator: params.creator,
        name: params.name,
        trader: params.trader,
        maxCap: formatNormalToWei(params.maxCap, d),
        minDepositAmount: formatNormalToWei(params.minDepositAmount ?? "0", d),
        creatorMinimumShareRatio: formatNormalToWei(params.creatorMinimumShareRatio ?? "0.05", d),
        creatorProfitShareRatio: formatNormalToWei(params.creatorProfitShareRatio ?? "0.2", d),
        managerCapID: params.managerCapId,
      },
      undefined,
      params.gasBudget,
      this.keypair.toSuiAddress()
    );
    return this.exchangeOnChain.signAndExecuteTx(tx, this.keypair);
  }

  /** Deposit USDC into a vault (auto-fetches signed price feed if not provided). */
  async depositToVault(params: VaultDepositParams): Promise<SuiTransactionBlockResponse> {
    const signedPriceFeed = await this.ensureSignedPriceFeed(params.signedPriceFeed);
    return this.exchangeOnChain.depositToVault(
      {
        vaultID: params.vaultId,
        amount: formatNormalToWei(params.amount, DECIMALS.USDC),
        signedPriceFeed,
        gasBudget: params.gasBudget,
      } as any,
      this.keypair
    );
  }

  /**
   * Request vault share redemption. Prepends signed price feed on the same PTB (matches web app).
   */
  async requestWithdrawFromVault(
    params: VaultWithdrawParams
  ): Promise<SuiTransactionBlockResponse> {
    const signedPriceFeed = await this.ensureSignedPriceFeed(params.signedPriceFeed);
    const tx = new Transaction();
    this.transactionBuilder.buildSignedPriceFeedTx(signedPriceFeed, tx);
    this.transactionBuilder.vault_requestWithdrawTx(
      {
        vaultID: params.vaultId,
        shares: formatNormalToWei(params.shares),
      },
      tx,
      params.gasBudget,
      this.keypair.toSuiAddress()
    );
    return this.exchangeOnChain.signAndExecuteTx(tx, this.keypair);
  }

  /**
   * Operator / creator fills pending withdrawal requests after NAV update (matches `processWithdrawRequest`).
   */
  async fillVaultWithdrawalRequests(
    params: VaultFillWithdrawalRequestsParams
  ): Promise<SuiTransactionBlockResponse> {
    const signedPriceFeed = await this.ensureSignedPriceFeed(params.signedPriceFeed);
    return this.exchangeOnChain.fillWithdrawalRequests(
      {
        vaultID: params.vaultId,
        withdrawalRequestIDs: params.withdrawalRequestIds,
        signedPriceFeed,
        markets: params.markets,
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  /** Claim USDC from a vault that is already closed. */
  async claimClosedVaultFunds(params: {
    vaultId: string;
    gasBudget?: number;
  }): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.claimClosedVaultFunds(
      { vaultID: params.vaultId, gasBudget: params.gasBudget },
      this.keypair
    );
  }

  /** Close a vault (creator); requires fresh signed price + optional explicit `markets` for NAV. */
  async closeVault(params: VaultCloseParams): Promise<SuiTransactionBlockResponse> {
    const signedPriceFeed = await this.ensureSignedPriceFeed(params.signedPriceFeed);
    return this.exchangeOnChain.closeVault(
      {
        vaultID: params.vaultId,
        signedPriceFeed,
        gasBudget: params.gasBudget,
        markets: params.markets,
      } as any,
      this.keypair
    );
  }

  /** Remove a vault record (on-chain cleanup; see protocol docs for Preconditions). */
  async removeVault(params: VaultRemoveParams): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.removeVault(
      { vaultID: params.vaultId, gasBudget: params.gasBudget },
      this.keypair
    );
  }

  /** Toggle public deposits (`vault::set_deposit_status`). */
  async setVaultDepositStatus(
    params: VaultSetDepositStatusParams
  ): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.setVaultDepositStatus(
      {
        vaultID: params.vaultId,
        status: params.status,
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  /** Update max TVL / cap for a vault (`vault::set_max_cap`). */
  async setVaultMaxCap(params: VaultSetMaxCapParams): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.setVaultMaxCap(
      {
        vaultID: params.vaultId,
        maxCap: formatNormalToWei(params.maxCap, DECIMALS.VAULT_CONFIG),
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  async setVaultMinDepositAmount(
    params: VaultSetMinDepositAmountParams
  ): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.setVaultMinDepositAmount(
      {
        vaultID: params.vaultId,
        minDepositAmount: formatNormalToWei(params.minDepositAmount, DECIMALS.VAULT_CONFIG),
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  async setVaultFollowerMaxCap(
    params: VaultSetFollowerMaxCapParams
  ): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.setVaultFollowerMaxCap(
      {
        vaultID: params.vaultId,
        followerMaxCap: formatNormalToWei(params.followerMaxCap, DECIMALS.VAULT_CONFIG),
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  async setVaultAutoCloseOnWithdraw(
    params: VaultSetAutoCloseOnWithdrawParams
  ): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.setVaultAutoCloseOnWithdraw(
      {
        vaultID: params.vaultId,
        autoCloseOnWithdraw: params.autoCloseOnWithdraw,
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  async setVaultTrader(params: VaultSetTraderParams): Promise<SuiTransactionBlockResponse> {
    return this.exchangeOnChain.setVaultTrader(
      {
        vaultID: params.vaultId,
        newTrader: params.newTrader,
        gasBudget: params.gasBudget,
      },
      this.keypair
    );
  }

  /**
   * Build `vault::update_share_price_v2` PTB (price feed + NAV + update). Inspect or dry-run off-chain.
   */
  async buildVaultUpdateSharePriceTx(
    params: VaultUpdateSharePriceParams
  ): Promise<Transaction> {
    const signedPriceFeed = await this.ensureSignedPriceFeed(params.signedPriceFeed);
    return this.exchangeOnChain.getUpdateSharePriceTx({
      vaultID: params.vaultId,
      signedPriceFeed,
      markets: params.markets,
    });
  }

  // =======================================================================
  //  On-chain helpers
  // =======================================================================

  /**
   * Direct access to the underlying {@link ExchangeOnChain} for advanced use
   * cases not yet wrapped by the SDK. Most callers should prefer the typed
   * helpers above.
   */
  get onChain(): ExchangeOnChain {
    return this.exchangeOnChain;
  }

  /** Direct access to the underlying Sui JSON-RPC client. */
  get sui(): SuiJsonRpcClient {
    return this.suiClient;
  }

  /** Direct access to the underlying TransactionBuilder. */
  get txBuilder(): TransactionBuilder {
    return this.transactionBuilder;
  }

  /** Get USDC + SUI + bank balances for the SDK wallet (or any address). */
  async getChainBalances(address?: string): Promise<SDKResponse<ChainBalances>> {
    try {
      const target = address || this.walletAddress;
      const [sui, usdc, bank] = await Promise.all([
        this.suiClient
          .getBalance({ owner: target })
          .then((b: any) =>
            new BigNumber(b.totalBalance ?? "0")
              .dividedBy(new BigNumber(10).pow(DECIMALS.SUI))
              .toString()
          )
          .catch(() => "0"),
        this.exchangeOnChain
          .getUSDCBalance(target as any)
          .then((b: any) => {
            const bn = BigNumber.isBigNumber(b) ? b : new BigNumber(b ?? 0);
            return bn.dividedBy(new BigNumber(10).pow(DECIMALS.USDC)).toString();
          })
          .catch(() => "0"),
        this.exchangeOnChain
          .getUserBankBalance(target as any)
          .then((b: any) => {
            const bn = BigNumber.isBigNumber(b) ? b : new BigNumber(b ?? 0);
            return bn.dividedBy(new BigNumber(10).pow(DECIMALS.SUI)).toString();
          })
          .catch(() => "0"),
      ]);
      return { status: true, data: { sui, usdc, bank } };
    } catch (e) {
      return { status: false, error: formatError(e) };
    }
  }

  /** Get the on-chain oracle price for a market. */
  async getOraclePrice(symbol: string): Promise<SDKResponse<string>> {
    try {
      const price = await this.exchangeOnChain.getOraclePrice(symbol as any);
      const bn = BigNumber.isBigNumber(price) ? price : new BigNumber(price ?? 0);
      return { status: true, data: bn.toString() };
    } catch (e) {
      return { status: false, error: formatError(e) };
    }
  }

  /**
   * Read a position object directly from the chain. Returns a normalized
   * representation (quantities/prices in normal units).
   */
  async getOnChainPosition(
    symbol: string,
    user?: string
  ): Promise<SDKResponse<OnChainPosition | null>> {
    try {
      const target = user || this.walletAddress;
      const raw: any = await (this.exchangeOnChain as any).getPosition?.(
        symbol as any,
        target as any
      );
      if (!raw) return { status: true, data: null };
      const quantityWei = raw.size ?? raw.quantity ?? "0";
      return {
        status: true,
        data: {
          quantity: this.formatWeiToNormal(quantityWei),
          isLong: !!(raw.isLong ?? raw.is_long),
          avgOpen: this.formatWeiToNormal(raw.avgOpen ?? raw.avg_open ?? "0"),
          oraclePrice: this.formatWeiToNormal(raw.oraclePrice ?? raw.oracle_price ?? "0"),
          margin: this.formatWeiToNormal(raw.margin ?? "0"),
          leverage: this.formatWeiToNormal(raw.leverage ?? "0"),
          selectedLeverage: raw.selectedLeverage
            ? this.formatWeiToNormal(raw.selectedLeverage)
            : undefined,
          raw,
        },
      };
    } catch (e) {
      return { status: false, error: formatError(e) };
    }
  }

  /**
   * Close an on-chain position (full or partial) by sending an order with
   * `reduceOnly = true`. This is a convenience wrapper around `placeOrder`.
   */
  async closeOnChainPosition(
    params: CloseOnChainPositionParams
  ): Promise<SDKResponse<OrderResponse>> {
    if (!params?.symbol) return { status: false, error: "symbol is required" };
    const posResult = await this.getOnChainPosition(params.symbol);
    if (!posResult.status || !posResult.data) {
      return { status: false, error: posResult.error || "No active position" };
    }
    const pos = posResult.data;
    const closingSide = pos.isLong ? OrderSide.SELL : OrderSide.BUY;
    const market =
      this.resolvePerpIdFromDeployment(params.symbol.toUpperCase()) ||
      (await this.getPerpetualID(params.symbol)) ||
      "";
    if (!market) {
      return { status: false, error: `Failed to resolve PerpetualID for ${params.symbol}` };
    }
    const qty = params.quantity ?? pos.quantity;
    return this.placeOrder({
      symbol: params.symbol,
      side: closingSide,
      orderType: OrderType.MARKET,
      quantity: qty,
      leverage: pos.leverage || "1",
      market,
      reduceOnly: true,
    });
  }

  /**
   * Withdraw the entire bank balance back to the wallet (handy for
   * "withdraw all" buttons in UIs).
   */
  async withdrawAllMarginFromBank(
    gasBudget?: number
  ): Promise<SuiTransactionBlockResponse | { status: false; error: string }> {
    try {
      const balRaw = await this.exchangeOnChain.getUserBankBalance(this.walletAddress as any);
      const bn = BigNumber.isBigNumber(balRaw) ? balRaw : new BigNumber(balRaw ?? 0);
      if (bn.isLessThanOrEqualTo(0)) {
        return { status: false, error: "Bank balance is zero" };
      }
      const amountUsdcNormal = bn.dividedBy(new BigNumber(10).pow(DECIMALS.SUI)).toNumber();
      return this.exchangeOnChain.withdrawFromBank(
        {
          amount: formatNormalToWei(amountUsdcNormal, DECIMALS.USDC),
          accountAddress: this.walletAddress,
          gasBudget,
        },
        this.keypair
      );
    } catch (e) {
      return { status: false, error: formatError(e) };
    }
  }

  /**
   * Authorize / revoke a 1CT sub-account on chain (without going through the
   * full {@link enableOneClickTrading} flow). Useful when the JWT registration
   * was performed elsewhere.
   */
  async setSubAccount(params: SubAccountAuthParams): Promise<SuiTransactionBlockResponse> {
    const tx: Transaction = this.transactionBuilder.sub_accounts_setSubAccountTx({
      account: params.account,
      status: params.status,
    });
    if (params.gasBudget) tx.setGasBudget(params.gasBudget);
    tx.setSender(this.walletAddress);
    return this.exchangeOnChain.executeTxBlock(tx, this.keypair);
  }

  /** Resolve the PerpetualID of a symbol from local deployment config (no network call). */
  getDeploymentPerpetualID(symbol: string): string | undefined {
    if (!symbol) return undefined;
    return this.resolvePerpIdFromDeployment(symbol.toUpperCase());
  }

  // =======================================================================
  //  Point / Referral REST APIs
  // =======================================================================

  /** Generic GET passthrough used by the small "fire-and-forget" Point/Referral methods. */
  private pointGet<T>(url: string, params?: any, errorMsg = "Request failed") {
    return this.authedCall<any, T>(
      () => this.httpClient.get<any>(url, { params }),
      (resp) => ({ status: true, data: resp.data as T }),
      errorMsg
    );
  }

  /** Generic POST passthrough used by the small "fire-and-forget" Point/Referral methods. */
  private pointPost<T>(url: string, body?: any, errorMsg = "Request failed") {
    return this.authedCall<any, T>(
      () => this.httpClient.post<any>(url, body),
      (resp) => ({ status: true, data: resp.data as T }),
      errorMsg
    );
  }

  // ---- Point ----
  getReferralLink() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_REFERRAL_LINK);
  }
  changeReferralCode(code: string) {
    return this.pointPost<any>(API_ENDPOINTS.POINT_REFERRAL_CHANGE, { code });
  }
  getInviteeList(query?: PaginatedQuery) {
    return this.fetchPaginatedList<any, any>(API_ENDPOINTS.POINT_INVITEE, query, (r) => r);
  }
  getSeasonInfo() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_SEASON_INFO);
  }
  getTeamBoost() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_TEAM_BOOST);
  }
  joinTeam(payload: { teamCode: string }) {
    return this.pointPost<any>(API_ENDPOINTS.POINT_TEAM_JOIN, payload);
  }
  checkTeamNickname(nickname: string) {
    return this.pointGet<any>(API_ENDPOINTS.POINT_TEAM_NICKNAME_EXIST, { nickname });
  }
  getUserPoints() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_USER);
  }
  getUserDailyPoints() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_USER_DAILY);
  }
  getSeasonPoints() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_SEASON);
  }
  getReferralPoints() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_REFERRAL);
  }
  getTeamInfo() {
    return this.pointGet<any>(API_ENDPOINTS.POINT_TEAM);
  }

  // ---- Referral (commission program) ----
  getReferralProfile() {
    return this.pointGet<any>(API_ENDPOINTS.REFERRAL_PROFILE);
  }
  getReferralDashboard() {
    return this.pointGet<any>(API_ENDPOINTS.REFERRAL_DASHBOARD);
  }
  getReferralApplication() {
    return this.pointGet<any>(API_ENDPOINTS.REFERRAL_APPLY);
  }
  postReferralApplication(payload: {
    name: string;
    telegram: string;
    email?: string;
    twitter?: string;
    discord?: string;
    otherLinks?: { type: string; url: string }[];
  }) {
    return this.pointPost<any>(
      `${API_ENDPOINTS.REFERRAL_APPLY}?address=${encodeURIComponent(this.walletAddress)}`,
      payload
    );
  }
  getReferralHistory(query?: PaginatedQuery) {
    return this.fetchPaginatedList<any, any>(API_ENDPOINTS.REFERRAL_HISTORY, query, (r) => r);
  }
  getReferralCommission(query?: PaginatedQuery) {
    return this.fetchPaginatedList<any, any>(API_ENDPOINTS.REFERRAL_COMMISSION, query, (r) => r);
  }
  postReferralClaim() {
    return this.pointPost<any>(
      `${API_ENDPOINTS.REFERRAL_CLAIM}?address=${encodeURIComponent(this.walletAddress)}`
    );
  }
  getReferralClaimHistory(query?: PaginatedQuery) {
    return this.fetchPaginatedList<any, any>(API_ENDPOINTS.REFERRAL_CLAIM_HISTORY, query, (r) => r);
  }

  // =======================================================================
  //  WebSocket
  // =======================================================================

  /**
   * Construct a {@link WsClient} pre-configured with the SDK's JWT and wallet
   * address (for private channels). The caller is responsible for calling
   * `connect()` and `subscribe()` on the returned client.
   */
  createWsClient(
    options: Omit<WsClientOptions, "authToken" | "walletAddress"> &
      Partial<Pick<WsClientOptions, "authToken" | "walletAddress">>
  ): WsClient {
    return new WsClient({
      ...options,
      authToken: options.authToken ?? this.jwtToken,
      walletAddress: options.walletAddress ?? this.walletAddress,
    });
  }

  // =======================================================================
  //  Internal helpers (vault, public)
  // =======================================================================

  /**
   * Variant of {@link authedCall} for public endpoints that don't strictly
   * require auth but should still benefit from the JWT-1000 retry logic when
   * the user is logged in.
   */
  private async publicCall<TResp, TOut>(
    perform: () => Promise<ApiResponse<TResp>>,
    transform: (resp: ApiResponse<TResp>) => SDKResponse<TOut>,
    errorMessage = "Request failed"
  ): Promise<SDKResponse<TOut>> {
    let response: ApiResponse<TResp>;
    try {
      response = await perform();
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
    if (response.code !== 200) {
      return { status: false, error: response.message || errorMessage };
    }
    return transform(response);
  }

  /** Fetch a `{ list, count }` style vault sub-resource. */
  private async fetchVaultListEndpoint(
    url: string,
    vaultId: string,
    mapItem: (item: any) => any
  ): Promise<SDKResponse<{ list: any[]; count: number }>> {
    if (!vaultId) return { status: false, error: "vaultId is required" };
    return this.publicCall<any, { list: any[]; count: number }>(
      () =>
        this.httpClient.get<any>(url, {
          params: { vaultId },
          publicEndpoint: true,
        }),
      (resp) => {
        const d = resp.data || {};
        const arr = Array.isArray(d) ? d : d.list || d.data || [];
        const list = arr.map(mapItem);
        return { status: true, data: { list, count: d.count ?? list.length } };
      },
      "Failed to load vault sub-resource"
    );
  }

  /** Map a raw vault list row to {@link VaultListItem}. */
  private transformVaultListItem(v: any): VaultListItem {
    const isClosed = (v?.closedAt ?? 0) > 0;
    const isProtocol = v?.vaultType === 1;
    return {
      ...v,
      totalShares: this.formatWeiToNormal(v?.totalShares ?? "0"),
      maxCap: this.formatWeiToNormal(v?.maxCap ?? "0"),
      minDepositAmount: this.formatWeiToNormal(v?.minDepositAmount ?? "0"),
      requestedPendingShares: this.formatWeiToNormal(v?.requestedPendingShares ?? "0"),
      lastSharePrice: this.formatWeiToNormal(v?.lastSharePrice ?? "0"),
      totalDeposits: this.formatWeiToNormal(v?.totalDeposits ?? "0"),
      totalWithdrawals: this.formatWeiToNormal(v?.totalWithdrawals ?? "0"),
      shareRatio: this.formatWeiToNormal(v?.shareRatio ?? "0"),
      tvl: this.formatWeiToNormal(v?.tvl ?? "0"),
      apr: this.formatWeiToNormal(v?.apr ?? "0"),
      isClosed,
      isProtocol,
    };
  }

  /** Lazily fetch a signed price feed from the backend if one wasn't provided. */
  private async ensureSignedPriceFeed(provided?: LatestPrice): Promise<LatestPrice> {
    if (provided?.payload && provided?.signature && provided?.publicKey) {
      return provided;
    }
    const result = await this.getLatestSignedPriceFeed();
    if (!result.status || !result.data) {
      throw new Error(result.error || "Failed to fetch signed price feed");
    }
    return result.data;
  }
}
