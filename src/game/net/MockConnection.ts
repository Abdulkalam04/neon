import { createGame, DT, update, type GameEvent, type GameState } from "@/game/core";
import { hexToHue } from "@/game/render/renderGame";
import {
  REGIONS,
  type ConnectionStatus,
  type GameConnection,
  type NetSnapshot,
  type RegionId,
  type SnakeSkin,
} from "./types";

const SNAPSHOT_HZ = 20;

/**
 * Fake server: runs the local game core; bots pretend to be other players.
 * Snapshots are sent at 20Hz with simulated latency so the client must interpolate.
 */
export class MockConnection implements GameConnection {
  private state: GameState | null = null;
  private stateCbs: ((s: NetSnapshot) => void)[] = [];
  private statusCbs: ((s: ConnectionStatus, ping: number) => void)[] = [];
  private input = { angle: null as number | null, boost: false };
  private timers: ReturnType<typeof setInterval>[] = [];
  private pending: GameEvent[] = [];
  private status: ConnectionStatus = "disconnected";
  private ping: number;
  private basePing: number;
  private reconnectUntil = 0;

  constructor(region: RegionId = "eu") {
    this.basePing = REGIONS.find((r) => r.id === region)?.basePing ?? 50;
    this.ping = this.basePing;
  }

  async connect(name: string, skin: SnakeSkin, roomCode?: string): Promise<void> {
    this.setStatus("connecting");
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    this.state = createGame({
      difficulty: roomCode ? "easy" : "normal",
      playerName: name || "Player",
      playerHue: hexToHue(skin.primary),
      seed: Date.now() & 0x7fffffff || 1,
    });
    this.setStatus("connected");

    let simAcc = 0;
    let last = performance.now();
    this.timers.push(
      setInterval(() => {
        const now = performance.now();
        simAcc += Math.min(0.25, (now - last) / 1000);
        last = now;
        const st = this.state!;
        while (simAcc >= DT) {
          update(st, { [st.playerId]: this.input }, DT);
          this.pending.push(...st.events);
          simAcc -= DT;
        }
      }, 1000 / 60),
      setInterval(() => this.emitSnapshot(), 1000 / SNAPSHOT_HZ),
      setInterval(() => this.tickNetwork(), 1000),
    );
  }

  sendInput(angle: number | null, boost: boolean) {
    if (this.status === "reconnecting") return;
    this.input = { angle, boost };
  }

  onState(cb: (snapshot: NetSnapshot) => void) {
    this.stateCbs.push(cb);
  }

  onStatus(cb: (status: ConnectionStatus, pingMs: number) => void) {
    this.statusCbs.push(cb);
    cb(this.status, this.ping);
  }

  disconnect() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.state = null;
    this.setStatus("disconnected");
    this.stateCbs = [];
    this.statusCbs = [];
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusCbs.forEach((cb) => cb(s, this.ping));
  }

  private tickNetwork() {
    const now = performance.now();
    if (this.status === "reconnecting" && now > this.reconnectUntil) this.setStatus("connected");
    else if (this.status === "connected" && Math.random() < 0.015) {
      this.reconnectUntil = now + 1500 + Math.random() * 1500;
      this.setStatus("reconnecting");
    }
    this.ping = Math.round(this.basePing + (Math.random() - 0.3) * this.basePing * 0.4);
    this.statusCbs.forEach((cb) => cb(this.status, this.ping));
  }

  private emitSnapshot() {
    const st = this.state;
    if (!st || this.status === "reconnecting") return;
    const snap: NetSnapshot = {
      tick: st.tick,
      worldRadius: st.worldRadius,
      youId: st.playerId,
      snakes: st.snakes.map((s) => ({
        id: s.id,
        name: s.name,
        isPlayer: s.isPlayer,
        hue: s.hue,
        skinIndex: s.skinIndex,
        alive: s.alive,
        angle: s.angle,
        body: s.body.map((p) => ({ x: p.x, y: p.y })),
        length: s.length,
        boosting: s.boosting,
        kills: s.kills,
      })),
      orbs: st.orbs.map((o) => ({ ...o })),
      events: this.pending,
    };
    this.pending = [];
    // Simulated one-way latency.
    setTimeout(() => this.stateCbs.forEach((cb) => cb(snap)), this.ping / 2);
  }
}
