import { useEffect, useState } from "react";
import { REGIONS, type RegionId } from "@/game/net/types";
import { shareText } from "@/lib/platform";
import { validateServerUrl } from "@/lib/serverConfig";
import { normalizeRoomCode } from "@/game/net/roomCode";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeRoomCode = () =>
  Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(
    "",
  );
export function OnlineLobby(props: {
  region: RegionId;
  onRegion: (region: RegionId) => void;
  room: string | undefined;
  onRoom: (code: string | undefined) => void;
  finding: boolean;
  onPlay: () => void;
  isWakingUp?: boolean;
  wakeElapsedMs?: number;
  customServerUrl: string;
  onCustomServerUrl: (url: string) => void;
}) {
  const {
    region,
    onRegion,
    room,
    onRoom,
    finding,
    onPlay,
    isWakingUp = false,
    wakeElapsedMs = 0,
    customServerUrl,
    onCustomServerUrl,
  } = props;
  const [online, setOnline] = useState(1842);
  const [joinCode, setJoinCode] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [urlError, setUrlError] = useState("");
  const [onlineStatus, setOnlineStatus] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const timer = setInterval(
      () => setOnline((count) => Math.max(900, count + Math.round((Math.random() - 0.5) * 40))),
      1500,
    );
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const shareRoomCode = async () => {
    if (!room) return;
    try {
      await shareText("Neon Serpent room", `Join my Neon Serpent room: ${room}`);
      setShareMessage("Room code shared");
      setTimeout(() => setShareMessage(""), 2000);
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "Could not share the room code.");
    }
  };

  if (finding) {
    const seconds = Math.min(60, Math.floor(wakeElapsedMs / 1000));
    return (
      <div className="flex w-full flex-col items-center gap-4 py-6" role="status">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-neon-cyan/20 border-t-neon-cyan" />
        <h1 className="text-glow text-center font-display text-3xl">
          {isWakingUp
            ? "Waking up the server..."
            : room
              ? `Joining room ${room}...`
              : "Finding a game..."}
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          {REGIONS.find((item) => item.id === region)?.label} · {online.toLocaleString()} players
          online
        </p>
        {!onlineStatus && (
          <div
            className="glass w-full rounded-xl border-amber-300/50 bg-amber-950/80 px-4 py-3"
            role="status"
          >
            <p className="text-sm font-semibold text-amber-100">
              You’re offline. Multiplayer will retry when your connection is back.
            </p>
          </div>
        )}
        {isWakingUp && (
          <div className="glass w-full rounded-xl border border-amber-400/30 bg-amber-950/30 p-4 text-amber-200">
            <p className="text-sm">Free servers can take up to a minute to start.</p>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-amber-950"
              role="progressbar"
              aria-label="Waiting for multiplayer server"
              aria-valuemin={0}
              aria-valuemax={60}
              aria-valuenow={seconds}
            >
              <div
                className="h-full animate-pulse rounded-full bg-amber-400 transition-[width]"
                style={{ width: `${Math.min(100, (wakeElapsedMs / 60_000) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs tabular-nums">{seconds} / 60 seconds</p>
            {seconds >= 45 && (
              <button
                type="button"
                onClick={onPlay}
                className="neon-btn glow-cyan mt-3 min-h-11 w-full px-4 text-sm"
              >
                Retry server connection
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <h1 className="text-glow text-center font-display text-4xl sm:text-5xl">Play online</h1>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-neon-lime" />
        {online.toLocaleString()} players online
      </p>
      {!onlineStatus && (
        <div
          className="glass mt-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border-amber-300/50 bg-amber-950/80 px-4 py-3"
          role="status"
        >
          <p className="text-sm font-semibold text-amber-100">
            You’re offline. Check your connection to join multiplayer.
          </p>
          <button
            type="button"
            onClick={() => onPlay()}
            className="neon-btn glow-cyan min-h-11 px-4 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-6 w-full">
        <p className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">
          Server region
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REGIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => onRegion(item.id)}
              aria-pressed={region === item.id}
              className={`neon-btn glow-cyan flex min-h-12 flex-col items-center px-2 py-2 text-sm ${region === item.id ? "" : "border-border bg-background text-foreground"}`}
            >
              {item.label}
              <span className="text-[10px] text-muted-foreground">~{item.basePing} ms</span>
            </button>
          ))}
        </div>
      </div>

      {room && (
        <div className="glass mt-6 flex w-full flex-col items-center gap-3 rounded-2xl p-4">
          <p className="text-xs tracking-widest text-muted-foreground uppercase">Private room</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-glow font-display text-4xl tracking-[0.3em]">{room}</span>
            <button
              onClick={() => void shareRoomCode()}
              className="neon-btn glow-magenta min-h-12 px-4 text-sm"
            >
              Share code
            </button>
          </div>
          {shareMessage && (
            <p role="status" className="text-xs text-muted-foreground">
              {shareMessage}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Share this code with friends</p>
          <button
            onClick={() => onRoom(undefined)}
            className="min-h-12 px-4 text-sm text-muted-foreground underline"
          >
            Leave room
          </button>
        </div>
      )}

      <button
        onClick={onPlay}
        className="neon-btn glow-lime mt-6 min-h-14 w-full px-8 py-4 font-display text-xl sm:w-auto sm:px-12"
      >
        {room ? "Start room" : "Quick Play"}
      </button>

      {!room && (
        <div className="mt-6 w-full border-t border-border pt-5">
          <p className="mb-2 text-center text-xs tracking-widest text-muted-foreground uppercase">
            Play with friends
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => onRoom(makeRoomCode())}
              className="neon-btn glow-magenta min-h-12 flex-1 px-4 py-2 text-sm"
            >
              Create private room
            </button>
            <form
              className="flex flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (joinCode.length === 5) onRoom(joinCode);
              }}
            >
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
                placeholder="CODE"
                aria-label="Room code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                enterKeyHint="go"
                spellCheck={false}
                maxLength={5}
                className="glass min-h-12 w-full min-w-0 rounded-xl px-3 py-2 text-center font-display tracking-[0.3em] uppercase outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={joinCode.length !== 5}
                className="neon-btn glow-cyan min-h-12 px-5 py-2 text-sm disabled:opacity-40"
              >
                Join
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="mt-6 w-full border-t border-border pt-5">
        <label
          htmlFor="custom-server-url"
          className="mb-2 block text-xs tracking-widest text-muted-foreground uppercase"
        >
          Custom server (optional)
        </label>
        <input
          id="custom-server-url"
          type="url"
          value={customServerUrl}
          onChange={(event) => {
            const value = event.target.value;
            onCustomServerUrl(value);
            if (!value.trim()) {
              setUrlError("");
              return;
            }
            try {
              validateServerUrl(value);
              setUrlError("");
            } catch (error) {
              setUrlError(error instanceof Error ? error.message : "Invalid server URL.");
            }
          }}
          placeholder="wss://your-server.example.com"
          aria-invalid={Boolean(urlError)}
          aria-describedby={urlError ? "custom-server-error" : undefined}
          className="glass min-h-12 w-full rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {urlError && (
          <p id="custom-server-error" className="mt-2 text-xs text-destructive">
            {urlError}
          </p>
        )}
      </div>
    </>
  );
}
