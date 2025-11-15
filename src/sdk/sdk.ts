// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { OrderSigner } from "@dipcoinlab/perp-ts-library";
import { Keypair } from "@mysten/sui/cryptography";
import BigNumber from "bignumber.js";
import { API_ENDPOINTS, ONBOARDING_MESSAGE } from "../constants";
import { HttpClient } from "../services/httpClient";
import {
  AccountInfo,
  AccountInfoResponse,
  CancelOrderParams,
  DipCoinPerpSDKOptions,
  OpenOrder,
  OpenOrdersResponse,
  OrderResponse,
  OrderType,
  PlaceOrderParams,
  Position,
  PositionsResponse,
  SDKResponse,
  TradingPair,
  TradingPairsResponse,
} from "../types";
import {
  formatError,
  formatNormalToWei,
  formatNormalToWeiBN,
  fromExportedKeypair,
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
  private isAuthenticating: boolean = false;

  /**
   * Initialize SDK
   * @param privateKey Private key string or keypair
   * @param options SDK configuration options
   */
  constructor(
    privateKey: string | Keypair,
    options: DipCoinPerpSDKOptions
  ) {
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
      const response = await this.httpClient.post<{ token: string }>(
        API_ENDPOINTS.AUTHORIZE,
        {
          userAddress: this.walletAddress,
          isTermAccepted: true,
          signature: signature,
        }
      );

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
  async getJWTToken(forceRefresh: boolean = false): Promise<SDKResponse<string>> {
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
      if (!params.symbol || !params.side || !params.orderType || !params.quantity || !params.leverage) {
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

      // Build main order object
      // Note: market must be the PerpetualID (e.g., "0xc1b1cf3d774bcfcbd6d71158a4259f2d99fccbf64ffc34f32700f8a771587d99")
      const order = {
        market: market,
        creator: this.walletAddress,
        isLong: side === "BUY",
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
          creator: this.walletAddress,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            tpOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(tpOrderPrice || tpTriggerPrice)
              : formatNormalToWeiBN(""), // Use formatNormalToWeiBN('') for MARKET orders to match ts-frontend
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
          creator: this.walletAddress,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            slOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(slOrderPrice || slTriggerPrice)
              : formatNormalToWeiBN(""), // Use formatNormalToWeiBN('') for MARKET orders to match ts-frontend
          leverage: leverageBN,
          expiration: expirationBN,
          salt: slSalt,
        };
      }

      // Generate order message for signing
      const orderMsg = OrderSigner.getOrderMessageForUIWallet(order);
      const orderHashBytes = new TextEncoder().encode(orderMsg);

      // Sign main order
      const orderSignature = await signMessage(this.keypair, orderHashBytes);

      // Sign TP order if exists
      let tpOrderSignature: string | undefined;
      if (tpOrder) {
        const tpOrderMsg = OrderSigner.getOrderMessageForUIWallet(tpOrder);
        const tpOrderHashBytes = new TextEncoder().encode(tpOrderMsg);
        tpOrderSignature = await signMessage(this.keypair, tpOrderHashBytes);
      }

      // Sign SL order if exists
      let slOrderSignature: string | undefined;
      if (slOrder) {
        const slOrderMsg = OrderSigner.getOrderMessageForUIWallet(slOrder);
        const slOrderHashBytes = new TextEncoder().encode(slOrderMsg);
        slOrderSignature = await signMessage(this.keypair, slOrderHashBytes);
      }

      // Build request parameters
      const requestParams: Record<string, any> = {
        symbol,
        side,
        orderType,
        quantity: formatNormalToWei(quantity),
        price: orderType === OrderType.LIMIT && price ? formatNormalToWei(price) : "0",
        leverage: formatNormalToWei(leverage),
        salt: saltBN.toString(),
        creator: this.walletAddress,
        clientId,
        reduceOnly,
        orderSignature,
      };

      // Add TP parameters if exists
      if (tpTriggerPrice && tpOrderSignature) {
        requestParams.tpOrderSignature = tpOrderSignature;
        requestParams.tpTriggerPrice = formatNormalToWei(tpTriggerPrice);
        requestParams.tpOrderType = tpOrderType;
        requestParams.tpOrderPrice =
          tpOrderType === OrderType.LIMIT ? formatNormalToWei(tpOrderPrice || tpTriggerPrice) : "";
        requestParams.tpSalt = tpSalt?.toString();
        requestParams.triggerWay = "oracle";
      }

      // Add SL parameters if exists
      if (slTriggerPrice && slOrderSignature) {
        requestParams.slOrderSignature = slOrderSignature;
        requestParams.slTriggerPrice = formatNormalToWei(slTriggerPrice);
        requestParams.slOrderType = slOrderType;
        requestParams.slOrderPrice =
          slOrderType === OrderType.LIMIT ? formatNormalToWei(slOrderPrice || slTriggerPrice) : "";
        requestParams.slSalt = slSalt?.toString();
      }

      // Send request
      const response = await this.httpClient.postForm<OrderResponse>(
        API_ENDPOINTS.PLACE_ORDER,
        requestParams
      );
      console.log("🚀 ~ DipCoinPerpSDK ~ placeOrder ~ requestParams:", requestParams)

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.postForm<OrderResponse>(
            API_ENDPOINTS.PLACE_ORDER,
            requestParams
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

      const { symbol, orderHashes, parentAddress = this.walletAddress } = params;

      if (!orderHashes || orderHashes.length === 0) {
        throw new Error("Order hashes are required");
      }

      // Build cancel order message
      const cancelOrderObj = { orderHashes };
      const orderHashBytes = new TextEncoder().encode(JSON.stringify(cancelOrderObj));

      // Sign the message
      const signature = await signMessage(this.keypair, orderHashBytes);

      // Build request parameters
      const requestParams = {
        symbol,
        orderHashes: JSON.stringify(orderHashes),
        signature,
        parentAddress,
      };

      // Send request
      const response = await this.httpClient.postForm<OrderResponse>(
        API_ENDPOINTS.CANCEL_ORDER,
        requestParams
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.postForm<OrderResponse>(
            API_ENDPOINTS.CANCEL_ORDER,
            requestParams
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

      const response = await this.httpClient.get<PositionsResponse>(
        API_ENDPOINTS.GET_POSITIONS,
        { params }
      );

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
        const positions = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
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
        const pairs = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
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
        const orders = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
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
}

