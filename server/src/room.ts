import type { WebSocket } from "ws";
import {
  addPlayerSnake,
  CFG,
  createGame,
  DT,
  removeSnake,
  snakeRadius,
  update,
} from "../../src/game/core";
import { addOrb } from "../../src/game/core/state";
import { rand } from "../../src/game/core/rng";
import type { GameEvent, GameState, Inputs, PlayerInput } from "../../src/game/core/types";
import type { NetSnapshot, NetSnake, SnakeSkin } from "../../src/game/net/types";
import type { ServerMessage } from "../../shared/protocol";
import { clampAngle, hexToHue } from "./validation";

export interface ConnectedClient {
  ws: WebSocket;
  snakeId: number;
  name: string;
  skin: SnakeSkin;
  lastInputSec: number;
  inputCountThisSec: number;
  pendingEvents: GameEvent[];
  lastKnownHead: { x: number; y: number };
}

const VIEW_RADIUS = 2500;
const VIEW_RADIUS_SQ = VIEW_RADIUS * VIEW_RADIUS;
const SIM_TICK_RATE = 60;
const SNAPSHOT_HZ = 20;
const MAX_INPUTS_PER_SEC = 120;
const TICK_BUDGET_MS = 1000 / SIM_TICK_RATE;

export class Room {
  public readonly id: string;
  public readonly isPrivate: boolean;
  public readonly region: string;
  public readonly maxPlayers: number = 30;

  public state: GameState;
  public clients: Map<number, ConnectedClient> = new Map();
  public emptySince: number | null = null;
  public lastTickMs = 0;

  private inputs: Inputs = {};
  private simTimer: NodeJS.Timeout | null = null;
  private snapTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(id: string, isPrivate: boolean, region = "eu", seed = Date.now()) {
    this.id = id;
    this.isPrivate = isPrivate;
    this.region = region;

    // Start with 12 bots and no human player initially
    this.state = createGame({
      difficulty: isPrivate ? "easy" : "normal",
      noPlayer: true,
      minTotalSnakes: 12,
      seed: seed & 0x7fffffff || 12345,
    });

    this.emptySince = Date.now();
    this.startLoop();
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  public hasSpace(): boolean {
    return this.clients.size < this.maxPlayers;
  }

  public addClient(ws: WebSocket, name: string, skin: SnakeSkin): number {
    const hue = hexToHue(skin.primary);
    const skinIndex = Math.floor(Math.random() * 1000);
    const snakeId = addPlayerSnake(this.state, name, hue, skinIndex);

    const client: ConnectedClient = {
      ws,
      snakeId,
      name,
      skin,
      lastInputSec: Math.floor(Date.now() / 1000),
      inputCountThisSec: 0,
      pendingEvents: [],
      lastKnownHead: { x: 0, y: 0 },
    };

    this.clients.set(snakeId, client);
    this.inputs[snakeId] = { angle: null, boost: false };
    this.emptySince = null;

    // Send welcome message
    const welcome: ServerMessage = {
      t: "welcome",
      youId: snakeId,
      worldRadius: this.state.worldRadius,
    };
    this.send(ws, welcome);

    return snakeId;
  }

  public removeClient(snakeId: number): void {
    const client = this.clients.get(snakeId);
    if (client) {
      this.clients.delete(snakeId);
      delete this.inputs[snakeId];
      this.dropDisconnectedSnakeFood(snakeId);
      removeSnake(this.state, snakeId);

      if (this.clients.size === 0) {
        this.emptySince = Date.now();
      }
    }
  }

  public handleInput(snakeId: number, rawAngle: unknown, rawBoost: unknown): void {
    const client = this.clients.get(snakeId);
    if (!client) return;

    // Rate-limiting check: max 120 inputs per second
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec !== client.lastInputSec) {
      client.lastInputSec = nowSec;
      client.inputCountThisSec = 1;
    } else {
      client.inputCountThisSec++;
      if (client.inputCountThisSec > MAX_INPUTS_PER_SEC) {
        return; // drop excess input
      }
    }

    const angle = clampAngle(rawAngle);
    const boost = Boolean(rawBoost);

    const inp: PlayerInput = { angle, boost };
    this.inputs[snakeId] = inp;
  }

  private startLoop(): void {
    // 60 Hz simulation loop
    this.simTimer = setInterval(() => {
      if (this.destroyed) return;
      this.tick();
    }, 1000 / SIM_TICK_RATE);

    // 20 Hz snapshot loop
    this.snapTimer = setInterval(() => {
      if (this.destroyed) return;
      this.broadcastSnapshots();
    }, 1000 / SNAPSHOT_HZ);
  }

  private tick(): void {
    const startedAt = performance.now();
    update(this.state, this.inputs, DT);
    this.lastTickMs = performance.now() - startedAt;
    if (this.lastTickMs > TICK_BUDGET_MS && Date.now() - this.lastSlowTickWarningAt >= 5000) {
      this.lastSlowTickWarningAt = Date.now();
      console.warn(
        JSON.stringify({
          event: "slow_simulation_tick",
          room: this.id,
          tickMs: Number(this.lastTickMs.toFixed(3)),
          budgetMs: Number(TICK_BUDGET_MS.toFixed(3)),
        }),
      );
    }

    // Queue events to all connected clients
    if (this.state.events.length > 0) {
      for (const client of this.clients.values()) {
        client.pendingEvents.push(...this.state.events);
      }
    }
  }

  private lastSlowTickWarningAt = 0;

  private dropDisconnectedSnakeFood(snakeId: number): void {
    const snake = this.state.snakes.find((candidate) => candidate.id === snakeId);
    if (!snake?.alive || snake.body.length === 0) return;

    const count = Math.max(
      CFG.deathOrbMin,
      Math.min(CFG.deathOrbMax, Math.round(snake.body.length / 3)),
    );
    const value = ((snake.length + snake.growth) * CFG.deathOrbShare) / count;
    const bodyRadius = snakeRadius(snake.length);
    const orbRadius = Math.min(
      CFG.deathOrbMaxRadius,
      CFG.deathOrbBaseRadius + Math.sqrt(value) * 4,
    );
    const last = snake.body.length - 1;
    for (let i = 0; i < count; i++) {
      const point = snake.body[count === 1 ? 0 : Math.round((i * last) / (count - 1))]!;
      addOrb(
        this.state,
        point.x + (rand(this.state) - 0.5) * bodyRadius * 1.8,
        point.y + (rand(this.state) - 0.5) * bodyRadius * 1.8,
        value,
        (snake.hue + (rand(this.state) - 0.5) * 40 + 360) % 360,
        orbRadius * (0.85 + rand(this.state) * 0.3),
        "death",
      );
    }
  }

  private broadcastSnapshots(): void {
    if (this.clients.size === 0) return;

    // Compute room-wide top 10 leaderboard
    const aliveSnakes = this.state.snakes.filter((s) => s.alive);
    aliveSnakes.sort((a, b) => b.length - a.length);
    const leaderboard = aliveSnakes.slice(0, 10).map((s) => ({
      name: s.name,
      score: Math.floor(s.length * 10),
    }));

    for (const [snakeId, client] of this.clients.entries()) {
      if (client.ws.readyState !== client.ws.OPEN) continue;

      const mySnake = this.state.snakes.find((s) => s.id === snakeId);
      if (mySnake && mySnake.body.length > 0) {
        client.lastKnownHead = { x: mySnake.body[0]!.x, y: mySnake.body[0]!.y };
      }
      const h = client.lastKnownHead;

      // Filter snakes within ~2500 units of player head, always include client's own snake
      const nearbySnakes: NetSnake[] = [];
      for (const s of this.state.snakes) {
        const isSelf = s.id === snakeId;
        const head = s.body[0];
        if (isSelf || (head && (head.x - h.x) ** 2 + (head.y - h.y) ** 2 <= VIEW_RADIUS_SQ)) {
          nearbySnakes.push({
            id: s.id,
            name: s.name,
            isPlayer: isSelf,
            hue: s.hue,
            skinIndex: s.skinIndex,
            alive: s.alive,
            angle: s.angle,
            body: s.body.map((p) => ({ x: p.x, y: p.y })),
            length: s.length,
            boosting: s.boosting,
            kills: s.kills,
          });
        }
      }

      // Filter orbs within ~2500 units of player head
      const nearbyOrbs = this.state.orbs.filter(
        (o) => (o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= VIEW_RADIUS_SQ,
      );

      const snapshot: NetSnapshot = {
        tick: this.state.tick,
        worldRadius: this.state.worldRadius,
        youId: snakeId,
        snakes: nearbySnakes,
        orbs: nearbyOrbs,
        events: client.pendingEvents,
        leaderboard,
      };
      client.pendingEvents = [];

      const msg: ServerMessage = {
        t: "state",
        ...snapshot,
      };
      this.send(client.ws, msg);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  public destroy(code = 1001, reason = "Room closed"): void {
    this.destroyed = true;
    if (this.simTimer) clearInterval(this.simTimer);
    if (this.snapTimer) clearInterval(this.snapTimer);
    this.simTimer = null;
    this.snapTimer = null;

    for (const client of this.clients.values()) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.close(code, reason);
      }
    }
    this.clients.clear();
    this.inputs = {};
  }
}
