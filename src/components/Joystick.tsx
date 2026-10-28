import { useEffect, useRef, useState } from "react";

type JoystickMode = "floating" | "fixed";

export function Joystick({
  onAngle,
  onBoost,
  mode = "floating",
}: {
  onAngle: (a: number | null) => void;
  onBoost: (b: boolean) => void;
  mode?: JoystickMode;
}) {
  const activeStick = useRef<number | null>(null);
  const activeBoost = useRef<number | null>(null);
  const lastRightTap = useRef(0);
  const boostTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onAngle, onBoost });
  callbacks.current = { onAngle, onBoost };
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [boosting, setBoosting] = useState(false);
  const R = 50;

  const resetStick = () => {
    activeStick.current = null;
    setKnob({ x: 0, y: 0 });
    onAngle(null);
  };
  const move = (e: React.PointerEvent) => {
    const b = base.current?.getBoundingClientRect();
    if (!b) return;
    const cx = mode === "floating" ? origin.x : b.left + b.width / 2;
    const cy = mode === "floating" ? origin.y : b.top + b.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    setKnob({ x: dx * k, y: dy * k });
    if (d > 12) onAngle(Math.atan2(dy, dx));
  };
  const boostEnd = () => {
    activeBoost.current = null;
    setBoosting(false);
    onBoost(false);
  };

  useEffect(() => {
    const reset = () => {
      activeStick.current = null;
      activeBoost.current = null;
      if (boostTapTimer.current) clearTimeout(boostTapTimer.current);
      boostTapTimer.current = null;
      setKnob({ x: 0, y: 0 });
      setBoosting(false);
      callbacks.current.onAngle(null);
      callbacks.current.onBoost(false);
    };
    window.addEventListener("neon-reset-input", reset);
    return () => {
      window.removeEventListener("neon-reset-input", reset);
      if (boostTapTimer.current) clearTimeout(boostTapTimer.current);
    };
  }, []);

  return (
    <>
      {mode === "floating" && (
        <div
          className="joystick-surface"
          onPointerDown={(e) => {
            if (e.clientX > window.innerWidth / 2 || activeStick.current !== null) return;
            activeStick.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            setOrigin({ x: e.clientX, y: e.clientY });
            setKnob({ x: 0, y: 0 });
            onAngle(null);
          }}
          onPointerMove={(e) => {
            if (activeStick.current === e.pointerId) move(e);
          }}
          onPointerUp={(e) => {
            if (activeStick.current === e.pointerId) resetStick();
          }}
          onPointerCancel={(e) => {
            if (activeStick.current === e.pointerId) resetStick();
          }}
          onLostPointerCapture={(e) => {
            if (activeStick.current === e.pointerId) resetStick();
          }}
        />
      )}
      <div
        className="boost-surface"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" || e.clientX <= window.innerWidth / 2) return;
          const now = performance.now();
          if (now - lastRightTap.current < 280) {
            onBoost(true);
            navigator.vibrate?.(12);
            if (boostTapTimer.current) clearTimeout(boostTapTimer.current);
            boostTapTimer.current = window.setTimeout(() => {
              boostTapTimer.current = null;
              onBoost(false);
            }, 520);
          }
          lastRightTap.current = now;
        }}
      />
      <div
        ref={base}
        className={`joystick glass touch-none rounded-full ${mode === "fixed" ? "joystick-fixed" : "joystick-floating"}`}
        style={
          mode === "floating"
            ? { left: origin.x, top: origin.y, transform: "translate(-50%, -50%)" }
            : undefined
        }
        onPointerDown={(e) => {
          if (mode === "floating") return;
          if (activeStick.current !== null) return;
          activeStick.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (mode === "floating") setOrigin({ x: e.clientX, y: e.clientY });
          move(e);
        }}
        onPointerMove={(e) => {
          if (activeStick.current === e.pointerId) move(e);
        }}
        onPointerUp={(e) => {
          if (activeStick.current === e.pointerId) resetStick();
        }}
        onPointerCancel={(e) => {
          if (activeStick.current === e.pointerId) resetStick();
        }}
        onLostPointerCapture={(e) => {
          if (activeStick.current === e.pointerId) resetStick();
        }}
      >
        <span className="joystick-arrow" aria-hidden />
        <div
          className="joystick-knob"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>
      <button
        id="boost-btn"
        aria-label="Boost"
        className={`boost-control neon-btn glow-magenta ${boosting ? "boosting" : ""}`}
        onPointerDown={(e) => {
          if (activeBoost.current !== null) return;
          activeBoost.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          setBoosting(true);
          onBoost(true);
          navigator.vibrate?.(12);
        }}
        onPointerUp={(e) => {
          if (activeBoost.current === e.pointerId) boostEnd();
        }}
        onPointerCancel={(e) => {
          if (activeBoost.current === e.pointerId) boostEnd();
        }}
        onLostPointerCapture={(e) => {
          if (activeBoost.current === e.pointerId) boostEnd();
        }}
      >
        <span className="boost-ring" aria-hidden />
        <span className="relative z-10">BOOST</span>
      </button>
    </>
  );
}
