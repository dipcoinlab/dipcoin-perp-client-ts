// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import type { WsClientOptions, WsSubscribeParams } from "../types";

type Listener = (msg: any) => void;

/**
 * Minimal WebSocket client that mirrors the channel/subscribe protocol used
 * by the perp-market gateway. Supports auto reconnect, JSON message parsing
 * and subscription replay after reconnection. Works in both Node.js (>=22,
 * via the built-in `WebSocket` global) and the browser. For older Node.js
 * runtimes install the optional `ws` package.
 *
 * The wire format intentionally matches what ts-frontend emits:
 *   - Subscribe: `{"op":"subscribe","args":[{...}]}`
 *   - Unsubscribe: `{"op":"unsubscribe","args":[{...}]}`
 *   - Heartbeat: `{"op":"ping"}` (overridable via options)
 */
export class WsClient {
  private url: string;
  private socket?: any;
  private listeners = new Set<Listener>();
  private subscriptions: WsSubscribeParams[] = [];
  private autoReconnect: boolean;
  private reconnectDelayMs: number;
  private heartbeatIntervalMs: number;
  private heartbeatPayload: Record<string, any>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private manuallyClosed = false;
  private authToken?: string;
  private walletAddress?: string;

  constructor(options: WsClientOptions) {
    this.url = options.url;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 3000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 25000;
    this.heartbeatPayload = options.heartbeatPayload ?? { op: "ping" };
    this.authToken = options.authToken;
    this.walletAddress = options.walletAddress;
  }

  /** Update auth credentials. Takes effect on next connection. */
  setAuth(authToken?: string, walletAddress?: string): void {
    this.authToken = authToken;
    this.walletAddress = walletAddress;
  }

  /** Open the WebSocket connection. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.manuallyClosed = false;
      const WS = this.resolveWebSocketCtor();
      if (!WS) {
        reject(
          new Error(
            "No WebSocket implementation available. On Node.js < 22 install the `ws` package."
          )
        );
        return;
      }

      let target = this.url;
      const params: string[] = [];
      if (this.authToken) {
        params.push(`token=${encodeURIComponent(this.authToken)}`);
      }
      if (this.walletAddress) {
        params.push(`address=${encodeURIComponent(this.walletAddress)}`);
      }
      if (params.length > 0) {
        target += (target.includes("?") ? "&" : "?") + params.join("&");
      }

      try {
        this.socket = new WS(target);
      } catch (e) {
        reject(e);
        return;
      }

      const sock: any = this.socket;
      const handleOpen = () => {
        for (const sub of this.subscriptions) {
          this.sendRaw({ op: "subscribe", args: [sub] });
        }
        this.startHeartbeat();
        resolve();
      };

      const handleMessage = (event: any) => {
        const raw = typeof event === "string" ? event : event?.data;
        if (raw === undefined || raw === null) return;
        let msg: any = raw;
        try {
          if (typeof raw === "string") msg = JSON.parse(raw);
          else if (raw?.toString) msg = JSON.parse(raw.toString());
        } catch {
          // pass through non-JSON frames as-is.
        }
        for (const cb of this.listeners) {
          try {
            cb(msg);
          } catch (e) {
            console.error("WsClient listener threw:", e);
          }
        }
      };

      const handleClose = () => {
        this.stopHeartbeat();
        if (!this.manuallyClosed && this.autoReconnect) {
          this.scheduleReconnect();
        }
      };

      const handleError = (err: any) => {
        if (!this.socket) reject(err);
      };

      if (typeof sock.on === "function") {
        sock.on("open", handleOpen);
        sock.on("message", handleMessage);
        sock.on("close", handleClose);
        sock.on("error", handleError);
      } else {
        sock.onopen = handleOpen;
        sock.onmessage = handleMessage;
        sock.onclose = handleClose;
        sock.onerror = handleError;
      }
    });
  }

  /** Close the connection. Disables auto-reconnect for this lifecycle. */
  close(): void {
    this.manuallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    try {
      this.socket?.close?.();
    } catch {
      // ignore
    }
    this.socket = undefined;
  }

  /** Add a message listener. Returns an unsubscribe function. */
  onMessage(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Subscribe to a channel. The subscription is remembered so that on
   * reconnect it is automatically replayed.
   */
  subscribe(params: WsSubscribeParams): void {
    this.subscriptions.push(params);
    this.sendRaw({ op: "subscribe", args: [params] });
  }

  /** Unsubscribe from a previously subscribed channel. */
  unsubscribe(params: WsSubscribeParams): void {
    this.subscriptions = this.subscriptions.filter((p) => !this.matchSubscription(p, params));
    this.sendRaw({ op: "unsubscribe", args: [params] });
  }

  /** Send a raw object as a JSON frame. */
  sendRaw(payload: any): void {
    const sock = this.socket;
    if (!sock) return;
    const frame = typeof payload === "string" ? payload : JSON.stringify(payload);
    try {
      sock.send(frame);
    } catch {
      // ignore - upcoming reconnect will replay subs
    }
  }

  private matchSubscription(a: WsSubscribeParams, b: WsSubscribeParams): boolean {
    return (
      a.channel === b.channel && a.symbol === b.symbol && JSON.stringify(a) === JSON.stringify(b)
    );
  }

  private resolveWebSocketCtor(): any {
    if (typeof globalThis !== "undefined" && (globalThis as any).WebSocket) {
      return (globalThis as any).WebSocket;
    }
    try {
      // dynamic require so it stays optional in browser builds
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const ws = require("ws");
      return ws?.WebSocket || ws;
    } catch {
      return undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => {
        if (this.autoReconnect && !this.manuallyClosed) this.scheduleReconnect();
      });
    }, this.reconnectDelayMs);
  }

  private startHeartbeat(): void {
    if (!this.heartbeatIntervalMs || this.heartbeatIntervalMs <= 0) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw(this.heartbeatPayload);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}
