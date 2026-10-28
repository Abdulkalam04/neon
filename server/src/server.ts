import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import { RoomManager } from "./roomManager";
import { sanitizeName, validateSkin } from "./validation";

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  roomId?: string | undefined;
  snakeId?: number | undefined;
  clientIp: string;
  messageWindowStartedAt: number;
  messageCount: number;
  cleaned: boolean;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_MESSAGES_PER_SECOND = 60;
const MAX_CONNECTIONS_PER_IP = 8;
const SHUTDOWN_CLOSE_CODE = 1012;

export interface ServerInstance {
  server: http.Server;
  wss: WebSocketServer;
  roomManager: RoomManager;
  port: number;
  address: string;
  close: () => Promise<void>;
}

export function createServer(opts?: {
  port?: number | undefined;
  allowedOrigins?: string | undefined;
  allowNoOrigin?: boolean | undefined;
  maxMessagesPerSecond?: number | undefined;
  maxConnectionsPerIp?: number | undefined;
  heartbeatIntervalMs?: number | undefined;
  region?: string | undefined;
}): Promise<ServerInstance> {
  const port = opts?.port !== undefined ? opts.port : parseInt(process.env["PORT"] || "3000", 10);
  const allowedOrigins = (opts?.allowedOrigins ?? process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean);
  const allowNoOrigin = opts?.allowNoOrigin ?? process.env["ALLOW_NO_ORIGIN"] === "true";
  const maxMessagesPerSecond = opts?.maxMessagesPerSecond ?? MAX_MESSAGES_PER_SECOND;
  const maxConnectionsPerIp = opts?.maxConnectionsPerIp ?? MAX_CONNECTIONS_PER_IP;
  const heartbeatIntervalMs = opts?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const region = opts?.region ?? process.env["RENDER_REGION"] ?? "singapore";
  const connectionsByIp = new Map<string, number>();

  function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return allowNoOrigin;
    try {
      return allowedOrigins.includes(new URL(origin).origin.toLowerCase());
    } catch {
      return false;
    }
  }

  const roomManager = new RoomManager();
  const serverName = "Neon Serpent Multiplayer";
  const serverVersion = process.env["npm_package_version"] ?? "1.0.0";

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;

    if (req.method === "GET" && req.url === "/info") {
      if (!isOriginAllowed(origin)) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Origin Not Allowed" }));
        return;
      }

      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          name: serverName,
          version: serverVersion,
          players: roomManager.getTotalPlayers(),
          rooms: roomManager.getRoomCount(),
          region,
        }),
      );
      return;
    }

    if (req.method === "GET" && (req.url === "/health" || req.url === "/healthz")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  const wss = new WebSocketServer({
    server,
    maxPayload: 2048,
    verifyClient: (info, callback) => {
      const origin = info.origin || info.req.headers.origin;
      if (!isOriginAllowed(origin)) {
        callback(false, 403, "Origin Not Allowed");
        return;
      }

      const clientIp = info.req.socket.remoteAddress ?? "unknown";
      if ((connectionsByIp.get(clientIp) ?? 0) >= maxConnectionsPerIp) {
        callback(false, 429, "Connection Limit Exceeded");
        return;
      }
      callback(true);
    },
  });

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const ext = client as ExtWebSocket;
      if (!ext.isAlive) {
        client.terminate();
        continue;
      }
      ext.isAlive = false;
      client.ping();
    }
  }, heartbeatIntervalMs);

  const statsInterval = setInterval(() => {
    const tickMs = roomManager.getAverageTickMs();
    console.log(
      JSON.stringify({
        event: "server_stats",
        players: roomManager.getTotalPlayers(),
        rooms: roomManager.getRoomCount(),
        tickMs: Number(tickMs.toFixed(3)),
        maxTickMs: Number(roomManager.getMaxTickMs().toFixed(3)),
      }),
    );
  }, 30_000);

  wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    const ext = ws as ExtWebSocket;
    ext.isAlive = true;
    ext.clientIp = req.socket.remoteAddress ?? "unknown";
    ext.messageWindowStartedAt = Date.now();
    ext.messageCount = 0;
    ext.cleaned = false;
    connectionsByIp.set(ext.clientIp, (connectionsByIp.get(ext.clientIp) ?? 0) + 1);

    ws.on("pong", () => {
      ext.isAlive = true;
    });

    const detachRoom = () => {
      if (ext.roomId && ext.snakeId !== undefined) {
        roomManager.getRoom(ext.roomId)?.removeClient(ext.snakeId);
        ext.roomId = undefined;
        ext.snakeId = undefined;
      }
    };

    const cleanupClient = () => {
      if (ext.cleaned) return;
      ext.cleaned = true;
      detachRoom();
      const connections = connectionsByIp.get(ext.clientIp) ?? 0;
      if (connections <= 1) connectionsByIp.delete(ext.clientIp);
      else connectionsByIp.set(ext.clientIp, connections - 1);
    };

    ws.on("close", cleanupClient);
    ws.on("error", cleanupClient);

    ws.on("message", (data) => {
      const now = Date.now();
      if (now - ext.messageWindowStartedAt >= 1000) {
        ext.messageWindowStartedAt = now;
        ext.messageCount = 0;
      }
      ext.messageCount++;
      if (ext.messageCount > maxMessagesPerSecond) {
        ws.close(1008, "Message rate limit exceeded");
        return;
      }

      if (typeof data !== "string" && !Buffer.isBuffer(data)) return;
      const str = typeof data === "string" ? data : data.toString("utf-8");

      let msg: ClientMessage;
      try {
        msg = JSON.parse(str);
      } catch {
        return;
      }

      if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return;

      switch (msg.t) {
        case "join": {
          detachRoom();

          const name = sanitizeName(msg.name);
          const skin = validateSkin(msg.skin);
          const room = msg.room
            ? roomManager.getOrCreatePrivateRoom(msg.room)
            : roomManager.getOrCreatePublicRoom(msg.region);

          if (!room.hasSpace()) {
            const err: ServerMessage = { t: "error", message: "Room is full" };
            ws.send(JSON.stringify(err));
            return;
          }

          const snakeId = room.addClient(ws, name, skin);
          ext.roomId = room.id;
          ext.snakeId = snakeId;
          break;
        }

        case "input": {
          if (ext.roomId && ext.snakeId !== undefined) {
            roomManager.getRoom(ext.roomId)?.handleInput(ext.snakeId, msg.angle, msg.boost);
          }
          break;
        }

        case "ping": {
          if (typeof msg.ts === "number" && ws.readyState === WebSocket.OPEN) {
            const pong: ServerMessage = { t: "pong", ts: msg.ts };
            ws.send(JSON.stringify(pong));
          }
          break;
        }
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      const actualPort = (server.address() as { port: number }).port;

      const close = async () => {
        clearInterval(heartbeatInterval);
        clearInterval(statsInterval);
        roomManager.destroy(SHUTDOWN_CLOSE_CODE, "Server restarting");

        for (const ws of wss.clients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(SHUTDOWN_CLOSE_CODE, "Server restarting");
          }
        }

        await new Promise<void>((res) => {
          const forceClose = setTimeout(() => {
            for (const ws of wss.clients) ws.terminate();
          }, 5000);
          forceClose.unref();
          wss.close(() => {
            clearTimeout(forceClose);
            server.close(() => res());
          });
        });
      };

      resolve({ server, wss, roomManager, port: actualPort, address: "0.0.0.0", close });
    });

    server.once("error", reject);
  });
}
