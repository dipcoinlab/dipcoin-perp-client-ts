// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { Keypair } from "@mysten/sui/cryptography";
import { OrderSigner } from "@dipcoinlab/perp-ts-library";
import BigNumber from "bignumber.js";
import {
  DipCoinPerpSDKOptions,
  PlaceOrderParams,
  CancelOrderParams,
  SDKResponse,
  AccountInfo,
  Position,
  OpenOrder,
  OrderResponse,
  AccountInfoResponse,
  PositionsResponse,
  OpenOrdersResponse,
  OrderType,
} from "../types";
import { HttpClient } from "../services/httpClient";
import { API_ENDPOINTS } from "../constants";
import {
  formatNormalToWei,
  formatNormalToWeiBN,
  signMessage,
  formatError,
  fromExportedKeypair,
} from "../utils";

/**
 * DipCoin Perpetual Trading SDK
 */
export class DipCoinPerpSDK {
  private httpClient: HttpClient;
  private keypair: Keypair;
  private walletAddress: string;
  private options: DipCoinPerpSDKOptions;

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
   * Place an order
   * @param params Order parameters
   * @returns Order response
   */
  async placeOrder(params: PlaceOrderParams): Promise<SDKResponse<OrderResponse>> {
    try {
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

      // Convert to BigNumber for calculations
      const priceBN = price
        ? formatNormalToWeiBN(price)
        : new BigNumber(0);
      const quantityBN = formatNormalToWeiBN(quantity);
      const leverageBN = formatNormalToWeiBN(leverage);
      const expirationBN = new BigNumber(0);
      const saltBN = new BigNumber(Date.now());

      // Build main order object
      const order = {
        market: market || symbol, // Use market if provided, otherwise use symbol
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
              : new BigNumber(0),
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
              : new BigNumber(0),
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
        price: orderType === OrderType.LIMIT && price ? formatNormalToWei(price) : "",
        leverage: formatNormalToWei(leverage),
        salt: saltBN.toString(),
        creator: this.walletAddress,
        clientId,
        reduceOnly: reduceOnly.toString(),
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

      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to place order",
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

      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to cancel order",
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
      const response = await this.httpClient.get<AccountInfoResponse>(
        API_ENDPOINTS.GET_ACCOUNT_INFO
      );

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
      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol;
      }

      const response = await this.httpClient.get<PositionsResponse>(
        API_ENDPOINTS.GET_POSITIONS,
        { params }
      );

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
   * Get open orders
   * @param symbol Optional symbol filter
   * @returns Open orders response
   */
  async getOpenOrders(symbol?: string): Promise<SDKResponse<OpenOrder[]>> {
    try {
      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol;
      }

      const response = await this.httpClient.get<OpenOrdersResponse>(
        API_ENDPOINTS.GET_OPEN_ORDERS,
        { params }
      );

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

