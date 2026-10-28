export interface ServerConfig {
  id: string;
  label: string;
  wsUrl: string;
  httpUrl: string;
  healthUrl: string;
  infoUrl: string;
}

interface ServerUrlOptions {
  production?: boolean;
}

const env = import.meta.env;

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function validateServerUrl(value: string, options: ServerUrlOptions = {}): string {
  const url = new URL(value.trim());
  const production = options.production ?? env.PROD;
  const local = isLocalHost(url.hostname);

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Server URL must not include credentials, a query, or a fragment.");
  }
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && (!production || local))) {
    throw new Error(
      "Use a secure wss:// server URL. ws:// is allowed only for localhost or development.",
    );
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Server URL must not include a path.");
  }

  return url.origin;
}

function getHttpUrl(wsUrl: string, configuredHttpUrl?: string): string {
  if (configuredHttpUrl?.trim()) {
    const url = new URL(configuredHttpUrl.trim());
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) {
      throw new Error("Use an https:// health-check URL, except for localhost development.");
    }
    return url.origin;
  }

  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
}

export function getServerList(customUrl?: string): ServerConfig[] {
  const configuredUrl = env["VITE_WS_URL"]?.trim();
  const defaultUrl = configuredUrl || (env.PROD ? "" : "ws://localhost:8080");
  const servers: ServerConfig[] = [];

  if (defaultUrl) {
    const wsUrl = validateServerUrl(defaultUrl);
    servers.push({
      id: "asia",
      label: "Asia",
      wsUrl,
      ...makeHttpEndpoints(getHttpUrl(wsUrl, env["VITE_HTTP_URL"])),
    });
  }

  if (customUrl?.trim()) {
    const wsUrl = validateServerUrl(customUrl);
    servers.push({
      id: "custom",
      label: "Custom server",
      wsUrl,
      ...makeHttpEndpoints(getHttpUrl(wsUrl)),
    });
  }

  return servers;
}

export function getSelectedServer(customUrl?: string): ServerConfig {
  const servers = getServerList(customUrl);
  const server = customUrl?.trim()
    ? servers.find((candidate) => candidate.id === "custom")
    : servers.find((candidate) => candidate.id === "asia");
  if (!server) {
    throw new Error("Set VITE_WS_URL to configure the multiplayer server.");
  }
  return server;
}

function makeHttpEndpoints(httpUrl: string) {
  return {
    httpUrl,
    healthUrl: `${httpUrl}/health`,
    infoUrl: `${httpUrl}/info`,
  };
}

export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const boundedAttempt = Math.max(1, Math.floor(attempt));
  const exponential = Math.min(16_000, 1000 * 2 ** (boundedAttempt - 1));
  return Math.min(16_000, Math.round(exponential * (0.8 + random() * 0.4)));
}

export async function waitForServer(
  server: ServerConfig,
  onRetry: (elapsedMs: number) => void,
  timeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<void> {
  const startedAt = Date.now();
  const retryIntervalMs = 3000;

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new DOMException("Server wait cancelled", "AbortError");
    const attemptStartedAt = Date.now();
    const remaining = timeoutMs - (attemptStartedAt - startedAt);
    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    signal?.addEventListener("abort", abortRequest, { once: true });
    const timeout = setTimeout(() => controller.abort(), Math.min(2500, remaining));
    try {
      const response = await fetch(server.healthUrl, {
        signal: controller.signal,
        mode: "no-cors",
      });
      if (response.ok || response.type === "opaque") return;
    } catch {
      // Network failures are expected while a free-tier service is waking.
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortRequest);
    }
    if (signal?.aborted) throw new DOMException("Server wait cancelled", "AbortError");

    onRetry(Date.now() - startedAt);
    const elapsed = Date.now() - attemptStartedAt;
    const delay = Math.min(retryIntervalMs - elapsed, timeoutMs - (Date.now() - startedAt));
    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, delay);
        const onAbort = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          reject(new DOMException("Server wait cancelled", "AbortError"));
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }

  if (signal?.aborted) throw new DOMException("Server wait cancelled", "AbortError");
  throw new Error("The server did not wake within 60 seconds.");
}
