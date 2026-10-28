import type { ClientMessage, ServerMessage } from "../../../shared/protocol";
import { addAppStateListener, addNetworkStatusListener } from "@/lib/platform";
import { reconnectDelay, validateServerUrl } from "@/lib/serverConfig";
import type { ConnectionStatus, GameConnection, NetSnapshot, RegionId, SnakeSkin } from "./types";

export class WebSocketConnection implements GameConnection {
  private readonly url: string;
  private readonly region: RegionId;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private ping = 0;
  private stateCbs: ((s: NetSnapshot) => void)[] = [];
  private statusCbs: ((s: ConnectionStatus, pingMs: number) => void)[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private manualDisconnect = false;
  private disposed = false;
  private backgrounded = false;
  private networkAvailable = true;
  private hasConnected = false;
  private removeNetworkListener: () => void = () => undefined;
  private removeAppStateListener: () => void = () => undefined;

  private joinParams: { name: string; skin: SnakeSkin; roomCode?: string | undefined } | null =
    null;

  constructor(region: RegionId = "eu", customUrl?: string) {
    this.region = region;
    const envUrl =
      typeof import.meta !== "undefined" && import.meta.env
        ? (import.meta.env["VITE_WS_URL"] as string | undefined)
        : undefined;
    const url =
      customUrl || (typeof envUrl === "string" && envUrl ? envUrl : "ws://localhost:8080");
    this.url = validateServerUrl(url);
  }

  public get currentStatus(): ConnectionStatus {
    return this.status;
  }

  public get currentPing(): number {
    return this.ping;
  }

  async connect(name: string, skin: SnakeSkin, roomCode?: string | undefined): Promise<void> {
    this.joinParams = { name, skin, roomCode };
    this.manualDisconnect = false;
    this.disposed = false;
    this.reconnectAttempts = 0;
    this.networkAvailable = typeof navigator === "undefined" || navigator.onLine;
    this.installLifecycleListeners();
    this.setStatus("connecting");

    return new Promise((resolve, reject) => {
      this.openSocket(true, resolve, reject);
    });
  }

  sendInput(angle: number | null, boost: boolean): void {
    if (this.status !== "connected" || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const msg: ClientMessage = { t: "input", angle, boost };
    this.send(msg);
  }

  onState(cb: (snapshot: NetSnapshot) => void): void {
    this.stateCbs.push(cb);
  }

  onStatus(cb: (status: ConnectionStatus, pingMs: number) => void): void {
    this.statusCbs.push(cb);
    cb(this.status, this.ping);
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.disposed = true;
    this.stopPing();
    this.clearReconnectTimer();
    this.removeNetworkListener();
    this.removeAppStateListener();
    this.removeNetworkListener = () => undefined;
    this.removeAppStateListener = () => undefined;
    if (this.ws) {
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // A socket may already have closed while its close event is pending.
      }
      this.ws = null;
    }
    this.setStatus("disconnected");
    this.stateCbs = [];
    this.statusCbs = [];
    this.joinParams = null;
    this.hasConnected = false;
  }

  private installLifecycleListeners(): void {
    if (typeof window !== "undefined") {
      const onVisibilityChange = () => this.setAppActive(!document.hidden);
      document.addEventListener("visibilitychange", onVisibilityChange);
      this.removeAppStateListener = () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        this.removeNativeAppListener();
      };
      void addAppStateListener((active) => this.setAppActive(active))
        .then((remove) => {
          if (this.disposed) void remove();
          else this.removeNativeAppListener = remove;
        })
        .catch(console.error);
    }

    void addNetworkStatusListener((connected) => this.setNetworkAvailable(connected))
      .then((remove) => {
        if (this.disposed) remove();
        else this.removeNetworkListener = remove;
      })
      .catch(console.error);
  }

  private removeNativeAppListener: () => void | Promise<void> = () => undefined;

  private setAppActive(active: boolean): void {
    if (this.manualDisconnect || this.backgrounded === !active) return;
    this.backgrounded = !active;
    if (!active) {
      this.clearReconnectTimer();
      this.stopPing();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, "App backgrounded");
      }
      if (this.hasConnected) this.setStatus("disconnected");
      return;
    }

    if (this.hasConnected && this.networkAvailable) this.reconnectImmediately();
  }

  private setNetworkAvailable(connected: boolean): void {
    this.networkAvailable = connected;
    if (!connected) {
      this.clearReconnectTimer();
      this.stopPing();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, "Network unavailable");
      }
      this.setStatus("disconnected");
      return;
    }

    if (this.hasConnected && !this.backgrounded) this.reconnectImmediately();
  }

  private openSocket(
    initial: boolean,
    resolve?: () => void,
    reject?: (error: Error) => void,
  ): void {
    const SocketConstructor =
      typeof WebSocket !== "undefined"
        ? WebSocket
        : (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket;
    if (!SocketConstructor) {
      const error = new Error("WebSocket is not supported in this environment");
      this.setStatus("disconnected");
      reject?.(error);
      return;
    }

    let resolved = false;
    try {
      this.ws = new SocketConstructor(this.url);
    } catch (error) {
      this.setStatus("disconnected");
      reject?.(error instanceof Error ? error : new Error(String(error)));
      if (!initial) this.handleDrop();
      return;
    }

    const socket = this.ws;
    socket.onopen = () => {
      if (this.manualDisconnect || this.backgrounded || !this.networkAvailable) {
        socket.close();
        return;
      }
      this.setStatus("connected");
      if (this.joinParams) {
        const join: ClientMessage = {
          t: "join",
          name: this.joinParams.name || "Player",
          skin: this.joinParams.skin,
          room: this.joinParams.roomCode,
          region: this.region,
        };
        this.send(join);
      }
      this.startPing();
    };

    socket.onmessage = (event: MessageEvent) => {
      let msg: ServerMessage;
      try {
        const raw = typeof event.data === "string" ? event.data : event.data.toString();
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.t === "welcome") {
        this.hasConnected = true;
        this.reconnectAttempts = 0;
        if (!resolved) {
          resolved = true;
          resolve?.();
        }
      } else if (msg.t === "state") {
        this.hasConnected = true;
        this.reconnectAttempts = 0;
        if (!resolved) {
          resolved = true;
          resolve?.();
        }
        this.stateCbs.forEach((cb) => cb(msg));
      } else if (msg.t === "pong") {
        this.ping = Math.max(1, Math.round(performance.now() - msg.ts));
        this.statusCbs.forEach((cb) => cb(this.status, this.ping));
      } else if (msg.t === "error" && !resolved) {
        resolved = true;
        reject?.(new Error(msg.message));
      }
    };

    socket.onclose = () => {
      if (this.ws === socket) this.ws = null;
      this.stopPing();
      if (this.manualDisconnect) return;
      if (initial && !resolved) {
        resolved = true;
        this.setStatus("disconnected");
        reject?.(new Error("Connection closed before welcome"));
      } else if (this.backgrounded || !this.networkAvailable) {
        this.setStatus("disconnected");
      } else if (this.hasConnected) {
        this.handleDrop();
      }
    };

    socket.onerror = () => {
      // The close event handles retries and reports initial connection failures.
    };
  }

  private handleDrop(): void {
    if (this.manualDisconnect || this.backgrounded || !this.networkAvailable) {
      this.setStatus("disconnected");
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus("disconnected");
      return;
    }

    this.reconnectAttempts++;
    this.setStatus("reconnecting");
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(
      () => this.openSocket(false),
      reconnectDelay(this.reconnectAttempts),
    );
  }

  private reconnectImmediately(): void {
    if (
      this.manualDisconnect ||
      !this.hasConnected ||
      this.backgrounded ||
      !this.networkAvailable
    ) {
      return;
    }
    this.clearReconnectTimer();
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;
    this.setStatus("reconnecting");
    this.openSocket(false);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusCbs.forEach((cb) => cb(status, this.ping));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const ping: ClientMessage = { t: "ping", ts: performance.now() };
        this.send(ping);
      }
    }, 2000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
