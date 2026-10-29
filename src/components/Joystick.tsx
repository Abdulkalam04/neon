import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const JOYSTICK_RADIUS = 50;
const DEAD_ZONE = 11;
const DOUBLE_TAP_WINDOW_MS = 280;
const DOUBLE_TAP_BOOST_MS = 520;

type PointerEventHandler = (event: ReactPointerEvent<HTMLDivElement>) => void;

export function Joystick({
  onAngle,
  onBoost,
  controlScale = 1,
  opacity = 0.8,
}: {
  onAngle: (angle: number | null) => void;
  onBoost: (boosting: boolean) => void;
  controlScale?: number;
  opacity?: number;
}) {
  const activeStick = useRef<number | null>(null);
  const activeRightTap = useRef<number | null>(null);
  const activeBoost = useRef<number | null>(null);
  const lastRightTap = useRef(0);
  const boostTapTimer = useRef<number | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const surface = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onAngle, onBoost });
  const [boosting, setBoosting] = useState(false);
  callbacks.current = { onAngle, onBoost };

  const hideStick = useCallback(() => {
    activeStick.current = null;
    if (base.current) {
      base.current.style.transition = "none";
      base.current.style.opacity = "0";
      base.current.style.visibility = "hidden";
    }
    if (knob.current) {
      knob.current.style.transform = "translate3d(0, 0, 0)";
    }
    callbacks.current.onAngle(null);
  }, []);

  const reset = useCallback(() => {
    hideStick();
    activeRightTap.current = null;
    lastRightTap.current = 0;
    activeBoost.current = null;
    if (boostTapTimer.current !== null) {
      window.clearTimeout(boostTapTimer.current);
      boostTapTimer.current = null;
    }
    setBoosting(false);
    callbacks.current.onBoost(false);
  }, [hideStick]);

  const updateStick = (clientX: number, clientY: number) => {
    const stickKnob = knob.current;
    if (!stickKnob) return;

    const dx = clientX - centerRef.current.x;
    const dy = clientY - centerRef.current.y;
    const distance = Math.hypot(dx, dy);
    const radius = JOYSTICK_RADIUS * controlScale;
    const scale = distance > radius ? radius / distance : 1;
    const knobX = dx * scale;
    const knobY = dy * scale;

    stickKnob.style.transform = `translate3d(${knobX}px, ${knobY}px, 0)`;
    callbacks.current.onAngle(distance > DEAD_ZONE ? Math.atan2(dy, dx) : null);
  };

  const startStick: PointerEventHandler = (event) => {
    if (event.button !== 0 || activeStick.current !== null) return;

    // Do not start joystick if touch lands on a HUD button, link, or interactive card
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, [role='button'], a, input, .hud-card")) {
      return;
    }
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    if (hit?.closest("button, [role='button'], a, input, .hud-card")) {
      return;
    }

    activeStick.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture errors
    }

    centerRef.current = { x: event.clientX, y: event.clientY };

    const stick = base.current;
    const stickKnob = knob.current;
    if (stick) {
      stick.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%) scale(${controlScale})`;
      stick.style.visibility = "visible";
      stick.style.transition = "opacity 100ms ease-out";
      stick.style.opacity = String(opacity);
    }
    if (stickKnob) {
      stickKnob.style.transform = "translate3d(0, 0, 0)";
    }

    callbacks.current.onAngle(null);
  };

  const moveStick: PointerEventHandler = (event) => {
    if (activeStick.current !== event.pointerId) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    if (coalesced && coalesced.length > 0) {
      for (const sample of coalesced) {
        if (sample) {
          updateStick(sample.clientX, sample.clientY);
        }
      }
    } else {
      updateStick(event.clientX, event.clientY);
    }
  };

  const endStick: PointerEventHandler = (event) => {
    if (activeStick.current === event.pointerId) {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
      }
      hideStick();
    }
  };

  const endRightTap: PointerEventHandler = (event) => {
    if (activeRightTap.current === event.pointerId) {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
      }
      activeRightTap.current = null;
    }
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("neon-reset-input", reset);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("neon-reset-input", reset);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (boostTapTimer.current !== null) window.clearTimeout(boostTapTimer.current);
      callbacks.current.onAngle(null);
      callbacks.current.onBoost(false);
    };
  }, [reset]);

  return (
    <>
      <div
        ref={surface}
        className="joystick-surface"
        onPointerDown={startStick}
        onPointerMove={moveStick}
        onPointerUp={endStick}
        onPointerCancel={endStick}
        onLostPointerCapture={endStick}
      />
      <div
        className="boost-surface"
        onPointerDown={(event) => {
          if (
            event.pointerType === "mouse" ||
            event.button !== 0 ||
            activeRightTap.current !== null
          ) {
            return;
          }
          activeRightTap.current = event.pointerId;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Ignore
          }
          const now = performance.now();
          if (now - lastRightTap.current < DOUBLE_TAP_WINDOW_MS) {
            callbacks.current.onBoost(true);
            if (boostTapTimer.current !== null) window.clearTimeout(boostTapTimer.current);
            boostTapTimer.current = window.setTimeout(() => {
              boostTapTimer.current = null;
              callbacks.current.onBoost(false);
            }, DOUBLE_TAP_BOOST_MS);
          }
          lastRightTap.current = now;
        }}
        onPointerUp={endRightTap}
        onPointerCancel={endRightTap}
        onLostPointerCapture={endRightTap}
      />
      <div
        ref={base}
        aria-hidden="true"
        className="joystick glass rounded-full"
        style={
          {
            "--control-scale": controlScale,
            "--joystick-opacity": opacity,
          } as React.CSSProperties
        }
      >
        <span className="joystick-arrow" aria-hidden />
        <div ref={knob} className="joystick-knob" />
      </div>
      <button
        id="boost-btn"
        type="button"
        aria-label="Boost"
        className={`boost-control neon-btn glow-magenta ${boosting ? "boosting" : ""}`}
        style={{ "--control-scale": controlScale } as React.CSSProperties}
        onPointerDown={(event) => {
          if (event.button !== 0 || activeBoost.current !== null) return;
          activeBoost.current = event.pointerId;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Ignore
          }
          setBoosting(true);
          callbacks.current.onBoost(true);
        }}
        onPointerUp={(event) => {
          if (activeBoost.current !== event.pointerId) return;
          activeBoost.current = null;
          setBoosting(false);
          callbacks.current.onBoost(false);
        }}
        onPointerCancel={(event) => {
          if (activeBoost.current !== event.pointerId) return;
          activeBoost.current = null;
          setBoosting(false);
          callbacks.current.onBoost(false);
        }}
        onLostPointerCapture={(event) => {
          if (activeBoost.current !== event.pointerId) return;
          activeBoost.current = null;
          setBoosting(false);
          callbacks.current.onBoost(false);
        }}
      >
        <span className="boost-ring" aria-hidden />
        <span className="relative z-10">BOOST</span>
      </button>
    </>
  );
}
