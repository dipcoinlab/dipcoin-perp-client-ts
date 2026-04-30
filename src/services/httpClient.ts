// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { ApiResponse } from "../types";

/**
 * Extended Axios config understood by HttpClient. Supports per-request
 * overrides for the X-Wallet-Address / Authorization headers used when
 * an action should be sent through the 1CT (one-click) sub-account JWT.
 */
export interface PerpRequestConfig extends AxiosRequestConfig {
  /** Override the wallet address header for this single request. */
  walletAddress?: string;
  /** Override the JWT used in the Authorization header for this request. */
  authToken?: string;
  /** Force the request to be treated as a public endpoint (skip auth). */
  publicEndpoint?: boolean;
}

/**
 * HTTP Client for API requests
 */
export class HttpClient {
  private instance: AxiosInstance;
  private baseURL: string;
  private walletAddress?: string;
  private authToken?: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  /**
   * Check if URL is a perp-trade-api endpoint
   */
  private isPerpTradeApiUrl(url?: string): boolean {
    return url?.startsWith("/api/perp-trade-api") ?? false;
  }

  /**
   * Authenticated vault API routes (`/api/perp-vault-api/vaults/...`) need the same
   * `X-Wallet-Address` + `Authorization` treatment as `perp-trade-api` (mirrors ts-frontend).
   */
  private isVaultAuthedApiUrl(url?: string): boolean {
    return url?.startsWith("/api/perp-vault-api/vaults") ?? false;
  }

  /**
   * Check if URL is a public endpoint (doesn't require auth)
   */
  private isPublicEndpoint(url?: string): boolean {
    return url?.includes("/public/") ?? false;
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    this.instance.interceptors.request.use(
      (config) => {
        const cfg = config as PerpRequestConfig;
        const overrideWallet = cfg.walletAddress;
        const overrideAuth = cfg.authToken;
        const treatAsPublic = cfg.publicEndpoint === true || this.isPublicEndpoint(config.url);

        if (this.isPerpTradeApiUrl(config.url) || this.isVaultAuthedApiUrl(config.url)) {
          const walletAddress = overrideWallet ?? this.walletAddress;
          if (walletAddress && config.headers) {
            config.headers["X-Wallet-Address"] = walletAddress;
          }

          const authToken = overrideAuth ?? this.authToken;
          if (authToken && config.headers && !treatAsPublic) {
            config.headers["Authorization"] = `Bearer ${authToken}`;
          }
        } else if (overrideAuth && config.headers && !treatAsPublic) {
          config.headers["Authorization"] = `Bearer ${overrideAuth}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        // Return the response data directly
        return response.data as any;
      },
      (error) => {
        // Handle error responses
        const errorMessage = error.response?.data?.message || error.message || "Request failed";
        return Promise.reject(new Error(errorMessage));
      }
    );
  }

  /**
   * Set wallet address for requests
   */
  setWalletAddress(address: string): void {
    this.walletAddress = address;
  }

  /**
   * Set authorization token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Get axios instance
   */
  getInstance(): AxiosInstance {
    return this.instance;
  }

  /**
   * GET request
   */
  async get<T = any>(url: string, config?: PerpRequestConfig): Promise<ApiResponse<T>> {
    return this.instance.get<ApiResponse<T>>(url, config) as unknown as Promise<ApiResponse<T>>;
  }

  /**
   * POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    config?: PerpRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.post<ApiResponse<T>>(url, data, config) as unknown as Promise<
      ApiResponse<T>
    >;
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, data?: any, config?: PerpRequestConfig): Promise<ApiResponse<T>> {
    return this.instance.put<ApiResponse<T>>(url, data, config) as unknown as Promise<
      ApiResponse<T>
    >;
  }

  /**
   * DELETE request
   */
  async delete<T = any>(url: string, config?: PerpRequestConfig): Promise<ApiResponse<T>> {
    return this.instance.delete<ApiResponse<T>>(url, config) as unknown as Promise<ApiResponse<T>>;
  }

  /**
   * POST form data request
   * Match ts-frontend: uses application/x-www-form-urlencoded for form data
   */
  async postForm<T = any>(
    url: string,
    data: Record<string, any>,
    config?: PerpRequestConfig
  ): Promise<ApiResponse<T>> {
    const formData = new URLSearchParams();
    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value !== undefined && value !== null) {
        if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    // Merge headers: form data Content-Type takes precedence, but preserve other headers
    // Match ts-frontend: form requests use application/x-www-form-urlencoded
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...config?.headers,
    };

    return this.instance.post<ApiResponse<T>>(url, formData.toString(), {
      ...config,
      headers,
    }) as unknown as Promise<ApiResponse<T>>;
  }

  /**
   * Multipart upload (e.g. vault logo). Lets axios set the boundary; strips default JSON Content-Type.
   */
  async postMultipart<T = any>(
    url: string,
    formData: FormData,
    config?: PerpRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.post<ApiResponse<T>>(url, formData, {
      ...config,
      transformRequest: [
        (data, headers) => {
          if (headers && typeof (headers as any).delete === "function") {
            (headers as any).delete("Content-Type");
          } else if (headers) {
            delete (headers as Record<string, unknown>)["Content-Type"];
          }
          return data;
        },
        ...(Array.isArray(config?.transformRequest)
          ? config.transformRequest
          : config?.transformRequest
            ? [config.transformRequest]
            : []),
      ],
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }) as unknown as Promise<ApiResponse<T>>;
  }
}
