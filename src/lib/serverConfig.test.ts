import { describe, expect, it } from "vitest";
import { getServerList, reconnectDelay, validateServerUrl, waitForServer } from "./serverConfig";

describe("server configuration", () => {
  it("allows secure production endpoints and local development sockets", () => {
    expect(validateServerUrl("wss://game.onrender.com", { production: true })).toBe(
      "wss://game.onrender.com",
    );
    expect(validateServerUrl("ws://localhost:8080", { production: true })).toBe(
      "ws://localhost:8080",
    );
  });

  it("rejects insecure remote production endpoints and malformed paths", () => {
    expect(() => validateServerUrl("ws://game.example", { production: true })).toThrow(
      "secure wss://",
    );
    expect(() => validateServerUrl("wss://game.example/room", { production: true })).toThrow(
      "must not include a path",
    );
  });

  it("builds health and info endpoints for an optional custom server", () => {
    expect(
      getServerList("wss://custom.example.com").find((server) => server.id === "custom"),
    ).toEqual({
      id: "custom",
      label: "Custom server",
      wsUrl: "wss://custom.example.com",
      httpUrl: "https://custom.example.com",
      healthUrl: "https://custom.example.com/health",
      infoUrl: "https://custom.example.com/info",
    });
  });

  it("calculates capped exponential reconnect delays with deterministic jitter", () => {
    expect(reconnectDelay(1, () => 0)).toBe(800);
    expect(reconnectDelay(2, () => 0.5)).toBe(2000);
    expect(reconnectDelay(8, () => 1)).toBe(16_000);
  });

  it("cancels the server wake-up wait immediately when its owner exits", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForServer(
        {
          id: "asia",
          label: "Asia",
          wsUrl: "wss://game.example",
          httpUrl: "https://game.example",
          healthUrl: "https://game.example/health",
          infoUrl: "https://game.example/info",
        },
        () => undefined,
        60_000,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
