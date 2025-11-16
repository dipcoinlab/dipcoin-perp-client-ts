// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { ExchangeOnChain, OrderSigner } from "@dipcoinlab/perp-ts-library";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Keypair } from "@mysten/sui/cryptography";
import BigNumber from "bignumber.js";
import { API_ENDPOINTS, DECIMALS, ONBOARDING_MESSAGE } from "../constants";
import { HttpClient } from "../services/httpClient";
import {
  AccountInfo,
  AccountInfoResponse,
  CancelOrderParams,
  DipCoinPerpSDKOptions,
  OpenOrder,
  OpenOrdersResponse,
  OrderBook,
  OrderBookEntry,
  OrderResponse,
  OrderSide,
  OrderType,
  PlaceOrderParams,
  Position,
  PositionsResponse,
  SDKResponse,
  TradingPair,
  TradingPairsResponse
} from "../types";
import {
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
  private isAuthenticating: boolean = false;
  private exchangeOnChain: ExchangeOnChain;

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
    this.exchangeOnChain = new ExchangeOnChain(
      readFile(`config/deployed/${options.network}/main_contract.json`),
      new SuiClient({ url: getFullnodeUrl(options.network) }),
      this.keypair
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

      // Build main order object
      // Note: market must be the PerpetualID (e.g., "0xc1b1cf3d774bcfcbd6d71158a4259f2d99fccbf64ffc34f32700f8a771587d99")
      const order = {
        market: market,
        creator: this.walletAddress,
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
        creator: this.walletAddress,
        clientId,
        reduceOnly, // Will be sent as boolean in JSON
        orderSignature,
      };

      // Add TP parameters if exists
      if (tpTriggerPrice && tpOrderSignature) {
        requestParams.tpOrderSignature = tpOrderSignature;
        requestParams.tpTriggerPrice = formatNormalToWei(tpTriggerPrice);
        requestParams.tpOrderType = tpOrderType;
        // Match ts-frontend: use formatNormalToWei('') for MARKET orders, not empty string
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
        // Match ts-frontend: use formatNormalToWei('') for MARKET orders, not empty string
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
        requestParams
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
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
        requestParams
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
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

      const response = await this.httpClient.get<any>(
        API_ENDPOINTS.GET_ORDER_BOOK,
        { params }
      );

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
  private processOrderBookEntries(
    entries: any[],
    side: "bids" | "asks"
  ): OrderBookEntry[] {
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

        // Convert from wei to normal units (18 decimals)
        // Match ts-frontend: formatWeiToNormal converts wei to normal units
        const formattedPrice = this.formatWeiToNormal(price);
        const formattedQuantity = this.formatWeiToNormal(quantity);

        return {
          price: formattedPrice,
          quantity: formattedQuantity,
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
}
