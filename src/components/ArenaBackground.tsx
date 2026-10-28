import { useEffect, useRef } from "react";

const COLORS = ["#22e4ff", "#ff2bd6", "#9dff3a"];

export function ArenaBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0,
      h = 0,
      raf = 0;
    let lastFrame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower = navigator.hardwareConcurrency <= 4;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const orbs = Array.from({ length: 70 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1.5 + Math.random() * 3,
      c: COLORS[Math.floor(Math.random() * 3)]!,
      p: Math.random() * 6.28,
    }));
    const snakes = Array.from({ length: 6 }, (_, i) => {
      const x = Math.random() * w,
        y = Math.random() * h;
      return {
        a: Math.random() * 6.28,
        c: COLORS[i % 3]!,
        body: Array.from({ length: 40 }, () => ({ x, y })),
        turn: 0,
      };
    });

    const tick = (t: number) => {
      if (document.hidden) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (lowPower && !reduced && t - lastFrame < 33) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastFrame = t;
      ctx.clearRect(0, 0, w, h);
      for (const o of orbs) {
        const pulse = 0.6 + 0.4 * Math.sin(t / 600 + o.p);
        ctx.shadowBlur = 14;
        ctx.shadowColor = o.c;
        ctx.fillStyle = o.c;
        ctx.globalAlpha = 0.35 + 0.4 * pulse;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r * pulse, 0, 6.28);
        ctx.fill();
      }
      for (const s of snakes) {
        s.turn += (Math.random() - 0.5) * 0.02;
        s.turn *= 0.98;
        s.a += s.turn;
        const head = s.body[0]!;
        let nx = head.x + Math.cos(s.a) * 1.4,
          ny = head.y + Math.sin(s.a) * 1.4;
        if (nx < -60) nx = w + 60;
        if (nx > w + 60) nx = -60;
        if (ny < -60) ny = h + 60;
        if (ny > h + 60) ny = -60;
        s.body.unshift({ x: nx, y: ny });
        s.body.pop();
        ctx.shadowColor = s.c;
        ctx.shadowBlur = 20;
        ctx.fillStyle = s.c;
        for (let i = s.body.length - 1; i >= 0; i -= 2) {
          const p = s.body[i]!;
          if (Math.abs(p.x - nx) > w / 2 || Math.abs(p.y - ny) > h / 2) continue;
          ctx.globalAlpha = 0.18 + 0.35 * (1 - i / s.body.length);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9 - i * 0.12, 0, 6.28);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
  );
}
