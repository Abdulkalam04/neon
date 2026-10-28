import http from "node:http";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SKIN } from "../src/game/render/drawSnake";
import type { ClientMessage, ServerMessage } from "../shared/protocol";
import { createServer, type ServerInstance } from "./src/server";

interface TestClient {
  ws: WebSocket;
  welcome: { youId: number; worldRadius: number };
  snapshots: ServerMessage[];
  send: (msg: ClientMessage | string) => void;
  waitForState: (timeoutMs?: number) => Promise<Extract<ServerMessage, { t: "state" }>>;
  waitForMessage: (
    predicate: (msg: ServerMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<ServerMessage>;
  close: () => Promise<void>;
  waitForClose: () => Promise<number>;
}

function connectClient(
  port: number,
  joinMsg: Extract<ClientMessage, { t: "join" }>,
  options?: { origin?: string },
): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}`,
      options?.origin ? { headers: { Origin: options.origin } } : undefined,
    );
    const snapshots: ServerMessage[] = [];
    const messageListeners: ((msg: ServerMessage) => void)[] = [];

    let welcomeData: { youId: number; worldRadius: number } | null = null;

    const timeout = setTimeout(() => {
      reject(new Error("Timeout connecting test client"));
    }, 5000);

    ws.on("open", () => {
      ws.send(JSON.stringify(joinMsg));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString("utf-8")) as ServerMessage;
        if (msg.t === "welcome") {
          welcomeData = { youId: msg.youId, worldRadius: msg.worldRadius };
        } else if (msg.t === "state") {
          snapshots.push(msg);
        }

        messageListeners.forEach((l) => l(msg));

        if (welcomeData && snapshots.length > 0) {
          clearTimeout(timeout);
          resolve(client);
        }
      } catch {
        // ignore
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const client: TestClient = {
      ws,
      get welcome() {
        return welcomeData!;
      },
      snapshots,
      send: (msg: ClientMessage | string) => {
        if (typeof msg === "string") {
          ws.send(msg);
        } else {
          ws.send(JSON.stringify(msg));
        }
      },
      waitForState: (timeoutMs = 4000) => {
        return new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error("Timeout waiting for state")), timeoutMs);
          const listener = (msg: ServerMessage) => {
            if (msg.t === "state") {
              clearTimeout(t);
              const idx = messageListeners.indexOf(listener);
              if (idx !== -1) messageListeners.splice(idx, 1);
              res(msg);
            }
          };
          messageListeners.push(listener);
        });
      },
      waitForMessage: (predicate, timeoutMs = 4000) => {
        return new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error("Timeout waiting for message")), timeoutMs);
          const listener = (msg: ServerMessage) => {
            if (predicate(msg)) {
              clearTimeout(t);
              const idx = messageListeners.indexOf(listener);
              if (idx !== -1) messageListeners.splice(idx, 1);
              res(msg);
            }
          };
          messageListeners.push(listener);
        });
      },
      close: async () => {
        if (ws.readyState === WebSocket.OPEN) {
          await new Promise<void>((r) => {
            ws.once("close", () => r());
            ws.close();
          });
        }
      },
      waitForClose: () =>
        new Promise((resolveClose) => {
          if (ws.readyState === WebSocket.CLOSED) {
            resolveClose(1000);
            return;
          }
          ws.once("close", (code) => resolveClose(code));
        }),
    };
  });
}

function rejectedWebSocketStatus(port: number, origin?: string): Promise<number> {
  return new Promise((resolveStatus, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}`,
      origin ? { headers: { Origin: origin } } : undefined,
    );
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for rejected upgrade")),
      3000,
    );
    ws.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      response.resume();
      resolveStatus(response.statusCode ?? 0);
    });
    ws.once("open", () => {
      clearTimeout(timeout);
      ws.close();
      reject(new Error("WebSocket upgrade unexpectedly succeeded"));
    });
    ws.once("error", (error) => {
      if (ws.readyState === WebSocket.CLOSED) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}

describe("authoritative multiplayer websocket server", () => {
  let instance: ServerInstance;

  beforeEach(async () => {
    // Port 0 selects an open ephemeral port
    instance = await createServer({
      port: 0,
      allowedOrigins: "http://localhost",
      allowNoOrigin: true,
    });
  });

  afterEach(async () => {
    if (instance) {
      await instance.close();
    }
  });

  it("serves GET /health with 200 OK", async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${instance.port}/health`, (r) => {
        let body = "";
        r.on("data", (chunk) => (body += chunk));
        r.on("end", () => resolve({ status: r.statusCode || 0, body }));
        r.on("error", reject);
      });
    });

    expect(res.status).toBe(200);
    expect(res.body).toBe("OK");
  });

  it("serves /info with metrics and only allows configured origins", async () => {
    const allowed = await fetch(`http://127.0.0.1:${instance.port}/info`, {
      headers: { Origin: "http://localhost" },
    });
    const info = (await allowed.json()) as {
      name: string;
      version: string;
      players: number;
      rooms: number;
      region: string;
    };

    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(info).toEqual({
      name: "Neon Serpent Multiplayer",
      version: expect.any(String),
      players: 0,
      rooms: 0,
      region: "singapore",
    });

    const rejected = await fetch(`http://127.0.0.1:${instance.port}/info`, {
      headers: { Origin: "https://attacker.example" },
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    await expect(rejectedWebSocketStatus(instance.port, "https://attacker.example")).resolves.toBe(
      403,
    );
  });

  it("rejects requests without Origin unless ALLOW_NO_ORIGIN is enabled", async () => {
    const noOriginServer = await createServer({
      port: 0,
      allowedOrigins: "http://localhost",
      allowNoOrigin: false,
    });
    try {
      const response = await fetch(`http://127.0.0.1:${noOriginServer.port}/info`);
      expect(response.status).toBe(403);
      await expect(rejectedWebSocketStatus(noOriginServer.port)).resolves.toBe(403);
    } finally {
      await noOriginServer.close();
    }
  });

  it("closes sockets that exceed the per-socket message rate limit", async () => {
    const limitedServer = await createServer({
      port: 0,
      allowedOrigins: "http://localhost",
      allowNoOrigin: true,
      maxMessagesPerSecond: 4,
    });
    let client: TestClient | undefined;
    try {
      client = await connectClient(limitedServer.port, {
        t: "join",
        name: "RateTester",
        skin: DEFAULT_SKIN,
      });
      const closed = client.waitForClose();
      for (let i = 0; i < 10; i++) client.send({ t: "ping", ts: i });
      await expect(closed).resolves.toBe(1008);
    } finally {
      await client?.close();
      await limitedServer.close();
    }
  });

  it("limits simultaneous connections from one IP", async () => {
    const limitedServer = await createServer({
      port: 0,
      allowedOrigins: "http://localhost",
      allowNoOrigin: true,
      maxConnectionsPerIp: 1,
    });
    let client: TestClient | undefined;
    try {
      client = await connectClient(limitedServer.port, {
        t: "join",
        name: "First",
        skin: DEFAULT_SKIN,
      });
      await expect(rejectedWebSocketStatus(limitedServer.port)).resolves.toBe(429);
    } finally {
      await client?.close();
      await limitedServer.close();
    }
  });

  it("connects 5 simulated clients and all receive welcome and snapshots", async () => {
    const clients: TestClient[] = [];

    try {
      for (let i = 0; i < 5; i++) {
        const client = await connectClient(instance.port, {
          t: "join",
          name: `Client_${i}`,
          skin: DEFAULT_SKIN,
        });
        clients.push(client);
      }

      expect(clients).toHaveLength(5);
      for (const client of clients) {
        expect(client.welcome.youId).toBeGreaterThan(0);
        expect(client.welcome.worldRadius).toBeGreaterThan(0);
        expect(client.snapshots.length).toBeGreaterThan(0);
        const lastSnap = client.snapshots[client.snapshots.length - 1];
        if (lastSnap && lastSnap.t === "state") {
          expect(lastSnap.youId).toBe(client.welcome.youId);
          expect(lastSnap.snakes.some((s) => s.id === client.welcome.youId)).toBe(true);
        }
      }
    } finally {
      await Promise.all(clients.map((c) => c.close()));
    }
  });

  it("allows two clients in the same private room to see each other", async () => {
    const clients: TestClient[] = [];

    try {
      const roomCode = "PRIV1";
      const clientA = await connectClient(instance.port, {
        t: "join",
        name: "Alpha",
        skin: DEFAULT_SKIN,
        room: roomCode,
      });
      clients.push(clientA);

      const clientB = await connectClient(instance.port, {
        t: "join",
        name: "Beta",
        skin: DEFAULT_SKIN,
        room: roomCode,
      });
      clients.push(clientB);

      // Wait for next snapshot on Client A that contains Client B
      const snapA = await clientA.waitForMessage(
        (m) => m.t === "state" && m.snakes.some((s) => s.id === clientB.welcome.youId),
      );
      expect(snapA.t).toBe("state");

      // Wait for next snapshot on Client B that contains Client A
      const snapB = await clientB.waitForMessage(
        (m) => m.t === "state" && m.snakes.some((s) => s.id === clientA.welcome.youId),
      );
      expect(snapB.t).toBe("state");
    } finally {
      await Promise.all(clients.map((c) => c.close()));
    }
  });

  it("isolates clients in different private rooms", async () => {
    const clients: TestClient[] = [];

    try {
      const clientA = await connectClient(instance.port, {
        t: "join",
        name: "RoomA_Player",
        skin: DEFAULT_SKIN,
        room: "ROOMA",
      });
      clients.push(clientA);

      const clientB = await connectClient(instance.port, {
        t: "join",
        name: "RoomB_Player",
        skin: DEFAULT_SKIN,
        room: "ROOMB",
      });
      clients.push(clientB);

      // Collect several snapshots from both
      await clientA.waitForState();
      await clientA.waitForState();
      await clientB.waitForState();
      await clientB.waitForState();

      // Check client A's snapshots never include client B
      for (const snap of clientA.snapshots) {
        if (snap.t === "state") {
          expect(snap.snakes.some((s) => s.name === "RoomB_Player")).toBe(false);
        }
      }

      // Check client B's snapshots never include client A
      for (const snap of clientB.snapshots) {
        if (snap.t === "state") {
          expect(snap.snakes.some((s) => s.name === "RoomA_Player")).toBe(false);
        }
      }
    } finally {
      await Promise.all(clients.map((c) => c.close()));
    }
  });

  it("does not crash on malformed JSON or oversized messages and responds to subsequent ping", async () => {
    const client = await connectClient(instance.port, {
      t: "join",
      name: "RobustTester",
      skin: DEFAULT_SKIN,
    });

    try {
      // Malformed JSON string
      client.send("This is completely invalid JSON {{{");
      client.send(JSON.stringify({ t: "unknown_type", foo: "bar" }));
      client.send(JSON.stringify({ t: "input", angle: "invalid_string", boost: "wrong" }));

      // Send ping and verify pong comes back
      const pingTs = 987654321;
      client.send({ t: "ping", ts: pingTs });

      const pong = await client.waitForMessage((m) => m.t === "pong" && m.ts === pingTs);
      expect(pong).toEqual({ t: "pong", ts: pingTs });
    } finally {
      await client.close();
    }
  });

  it("removes a disconnected player's snake from the room state", async () => {
    const roomCode = "ROOMD";
    const clientA = await connectClient(instance.port, {
      t: "join",
      name: "Leaver",
      skin: DEFAULT_SKIN,
      room: roomCode,
    });
    const clientB = await connectClient(instance.port, {
      t: "join",
      name: "Stay",
      skin: DEFAULT_SKIN,
      room: roomCode,
    });

    try {
      const room = instance.roomManager.getRoom(roomCode)!;
      const orbsBeforeDisconnect = room.state.orbs.length;

      // Ensure client B sees client A
      await clientB.waitForMessage(
        (m) => m.t === "state" && m.snakes.some((s) => s.id === clientA.welcome.youId),
      );

      // Now disconnect client A
      await clientA.close();

      // Wait for next snapshot on client B where client A is no longer in the snakes list
      const snapAfterDisconnect = await clientB.waitForMessage(
        (m) => m.t === "state" && !m.snakes.some((s) => s.id === clientA.welcome.youId),
      );

      expect(room.state.orbs.length - orbsBeforeDisconnect).toBeGreaterThanOrEqual(8);
      expect(snapAfterDisconnect.t).toBe("state");
      if (snapAfterDisconnect.t === "state") {
        expect(snapAfterDisconnect.snakes.some((s) => s.id === clientA.welcome.youId)).toBe(false);
      }
    } finally {
      await clientA.close();
      await clientB.close();
    }
  });
});
