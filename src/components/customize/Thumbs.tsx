import { useEffect, useRef } from "react";
import { onSpriteLoaded, preloadSprites } from "@/game/render/spriteSkins";
import { drawSnake, type EyeShape, type Point, type SnakeSkin } from "@/game/render/drawSnake";

/**
 * Every preview in the customizer is drawn with the *same* `drawSnake` renderer
 * the arena uses (AGENTS.md rule), so a thumbnail always matches in-game looks.
 */

type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** Sizes a canvas to its CSS box (HiDPI aware) and redraws on resize / dep change. */
function useCanvas(draw: DrawFn, deps: readonly unknown[], animate = false) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    const paint = (t: number) => {
      const w = c.clientWidth,
        h = c.clientHeight;
      if (w === 0 || h === 0) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h, t);
    };
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate && !reduce) {
      const loop = (t: number) => {
        paint(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
    paint(0);
    preloadSprites();
    const off = onSpriteLoaded(() => paint(0));
    const ro = new ResizeObserver(() => paint(0));
    ro.observe(c);
    return () => {
      off();
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, ...deps]);

  return ref;
}

/** Points for a vertical snake: head at (cx, headY), body running up the canvas. */
function verticalBody(
  n: number,
  cx: number,
  headY: number,
  spacing: number,
  amp: number,
  phase = 0,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      x: cx + Math.sin(i * 0.5 + phase) * amp * Math.min(1, i / 3),
      y: headY - i * spacing,
    });
  }
  return pts;
}

/** Skin used for thumbnails: no heavy glow so small previews stay crisp. */
const calm = (skin: SnakeSkin): SnakeSkin => ({
  ...skin,
  glow: Math.min(skin.glow, 0.25),
  sparkle: false,
});

/** Tall card thumbnail: the whole snake, head at the bottom (like the reference grid). */
export function SnakeCardThumb({
  skin,
  className,
  radius,
}: {
  skin: SnakeSkin;
  className?: string;
  /** Fixed body radius in px (smaller = more segments visible, good for comparing patterns). */
  radius?: number;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      const r = radius ?? Math.max(7, Math.min(22, w * 0.15));
      const sp = r * 0.92;
      const headY = h - r * 3.2;
      const n = Math.max(6, Math.min(80, Math.floor((headY - r * 2.5) / sp)));
      drawSnake(ctx, calm(skin), verticalBody(n, w / 2, headY, sp, r * 0.3), {
        radius: r,
        time: 0,
      });
    },
    [skin],
  );
  return <canvas ref={ref} className={className ?? "h-full w-full"} aria-hidden />;
}

/** Close-up of a head so the eye shape (and colour) is visible at a glance. */
export function EyeThumb({
  skin,
  shape,
  className,
}: {
  skin: SnakeSkin;
  shape: EyeShape;
  className?: string;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      const r = Math.min(w, h) * 0.34;
      const s: SnakeSkin = {
        ...calm(skin),
        hat: "none",
        back: "none",
        wings: "none",
        eyes: { ...skin.eyes, shape, followMouse: false },
      };
      drawSnake(ctx, s, verticalBody(2, w / 2, h * 0.5, r * 0.8, 0), { radius: r, time: 0 });
    },
    [skin, shape],
  );
  return <canvas ref={ref} className={className ?? "h-full w-full"} aria-hidden />;
}

/**
 * Animated card for one boost effect, drawn on the player's CURRENT snake so the
 * player sees exactly what the effect will look like on their own skin.
 */
export function EffectThumb({
  skin,
  boost,
  className,
}: {
  skin: SnakeSkin;
  boost: SnakeSkin["boost"];
  className?: string;
}) {
  const ref = useCanvas(
    (ctx, w, h, t) => {
      const r = Math.max(6, Math.min(12, w * 0.12));
      const sp = r * 0.9;
      const headY = h - r * 3.4;
      // keep the tail (and its trail) below the card label
      const n = Math.max(6, Math.min(48, Math.floor((headY - r * 2 - 34) / sp)));
      const pts = verticalBody(n, w / 2, headY, sp, r * 0.5, -t / 450);
      drawSnake(ctx, { ...skin, boost }, pts, { radius: r, time: t, boosting: true });
    },
    [skin, boost],
    true,
  );
  return <canvas ref={ref} className={className ?? "h-full w-full"} aria-hidden />;
}

/**
 * Big animated preview (the snake card on the left). Eyes follow the pointer and
 * pressing/holding shows the boost effect, exactly like before the redesign.
 */
export function PreviewSnake({
  skin,
  boosting: forceBoost = false,
}: {
  skin: SnakeSkin;
  boosting?: boolean;
}) {
  const skinRef = useRef(skin);
  skinRef.current = skin;
  const forceRef = useRef(forceBoost);
  forceRef.current = forceBoost;
  const pointer = useRef<Point | null>(null);
  const boosting = useRef(false);

  const ref = useCanvas(
    (ctx, w, h, t) => {
      const r = Math.max(9, Math.min(w * 0.16, 22));
      const sp = r * 0.9;
      const headY = h - r * 2.4;
      const n = Math.max(8, Math.min(80, Math.floor((headY - r * 1.5) / sp)));
      const pts = verticalBody(n, w / 2, headY, sp, r * 0.55, -t / 450);
      drawSnake(ctx, skinRef.current, pts, {
        radius: r,
        time: t,
        lookAt: pointer.current,
        boosting: boosting.current || forceRef.current,
      });
    },
    [],
    true,
  );

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const move = (e: PointerEvent) => {
      const b = c.getBoundingClientRect();
      pointer.current = { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const down = (e: PointerEvent) => {
      boosting.current = true;
      move(e);
    };
    const up = () => (boosting.current = false);
    const leave = () => {
      pointer.current = null;
      boosting.current = false;
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointerleave", leave);
    window.addEventListener("pointerup", up);
    return () => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerup", up);
    };
  }, [ref]);

  return (
    <canvas
      ref={ref}
      aria-label="Live snake preview. Move the pointer to make it look around; hold to boost."
      className="h-full w-full cursor-crosshair touch-none"
    />
  );
}
