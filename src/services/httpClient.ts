// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { ApiResponse } from "../types";

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
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add wallet address header if set
        if (this.walletAddress && config.headers) {
          config.headers["X-Wallet-Address"] = this.walletAddress;
        }

        // Add authorization header if set
        if (this.authToken && config.headers) {
          config.headers["Authorization"] = `Bearer ${this.authToken}`;
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
        const errorMessage =
          error.response?.data?.message || error.message || "Request failed";
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
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.instance.get<ApiResponse<T>>(url, config);
  }

  /**
   * POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.post<ApiResponse<T>>(url, data, config);
  }

  /**
   * POST form data request
   */
  async postForm<T = any>(
    url: string,
    data: Record<string, any>,
    config?: AxiosRequestConfig
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

    return this.instance.post<ApiResponse<T>>(url, formData.toString(), {
      ...config,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...config?.headers,
      },
    });
  }
}

