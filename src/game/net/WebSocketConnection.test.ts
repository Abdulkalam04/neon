import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SKIN } from "../render/drawSnake";
import { createServer, type ServerInstance } from "../../../server/src/server";
import { WebSocketConnection } from "./WebSocketConnection";

describe("WebSocketConnection", () => {
  let serverInstance: ServerInstance;

  beforeEach(async () => {
    serverInstance = await createServer({
      port: 0,
      allowedOrigins: "http://localhost,http://localhost:3000",
      allowNoOrigin: true,
    });
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
  });

  it("connects to server, receives state, and measures ping", async () => {
    const conn = new WebSocketConnection("eu", `ws://127.0.0.1:${serverInstance.port}`);

    let receivedState = false;
    conn.onState((snap) => {
      if (snap && snap.youId > 0) {
        receivedState = true;
      }
    });

    await conn.connect("Tester", DEFAULT_SKIN);
    expect(conn.currentStatus).toBe("connected");
    const connectedPlayer = serverInstance.roomManager
      .getAllRooms()
      .flatMap((room) => Array.from(room.clients.values()))
      .find((client) => client.snakeId > 0);
    expect(connectedPlayer?.skin).toEqual({ ...DEFAULT_SKIN, shading: "flat" });

    // Wait for state callback
    const startWait = Date.now();
    while (!receivedState && Date.now() - startWait < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(receivedState).toBe(true);

    conn.sendInput(1.5, true);
    conn.disconnect();
    expect(conn.currentStatus).toBe("disconnected");
  });

  it("transitions to reconnecting when socket is dropped", async () => {
    const conn = new WebSocketConnection("eu", `ws://127.0.0.1:${serverInstance.port}`);
    await conn.connect("Tester", DEFAULT_SKIN);
    expect(conn.currentStatus).toBe("connected");

    let sawReconnecting = false;
    conn.onStatus((status) => {
      if (status === "reconnecting") {
        sawReconnecting = true;
      }
    });

    // Close server's client connection from server side
    serverInstance.wss.clients.forEach((ws: { close: () => void }) => ws.close());

    const startWait = Date.now();
    while (!sawReconnecting && Date.now() - startWait < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(sawReconnecting).toBe(true);
    conn.disconnect();
    expect(conn.currentStatus).toBe("disconnected");
  });
});
