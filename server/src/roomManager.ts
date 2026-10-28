import { Room } from "./room";

const EMPTY_ROOM_TIMEOUT_MS = 30_000;

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private publicCounter = 1;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupEmptyRooms();
    }, 5000);
  }

  public getOrCreatePublicRoom(region = "eu"): Room {
    const reg = region || "eu";
    for (const room of this.rooms.values()) {
      if (!room.isPrivate && room.region === reg && room.hasSpace()) {
        return room;
      }
    }

    const roomId = `pub_${reg}_${this.publicCounter++}`;
    const room = new Room(roomId, false, reg);
    this.rooms.set(roomId, room);
    return room;
  }

  public getOrCreatePrivateRoom(rawCode?: string): Room {
    let code = (rawCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
    if (code.length < 5) {
      code = this.generateRoomCode();
    }

    const existing = this.rooms.get(code);
    if (existing) {
      return existing;
    }

    const room = new Room(code, true, "global");
    this.rooms.set(code, room);
    return room;
  }

  public getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  public getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  public getTotalPlayers(): number {
    let count = 0;
    for (const r of this.rooms.values()) {
      count += r.clientCount;
    }
    return count;
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  public getAverageTickMs(): number {
    if (this.rooms.size === 0) return 0;
    let total = 0;
    for (const room of this.rooms.values()) total += room.lastTickMs;
    return total / this.rooms.size;
  }

  public getMaxTickMs(): number {
    let max = 0;
    for (const room of this.rooms.values()) max = Math.max(max, room.lastTickMs);
    return max;
  }

  public cleanupEmptyRooms(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms.entries()) {
      if (
        room.clientCount === 0 &&
        room.emptySince !== null &&
        now - room.emptySince >= EMPTY_ROOM_TIMEOUT_MS
      ) {
        room.destroy();
        this.rooms.delete(id);
      }
    }
  }

  public generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  public destroy(code = 1001, reason = "Server shutting down"): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const room of this.rooms.values()) {
      room.destroy(code, reason);
    }
    this.rooms.clear();
  }
}
