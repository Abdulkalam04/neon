import { mapDeviceToTier, type DeviceProfile, type DeviceSignals } from "./qualityProfile";

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

function getWebGlRenderer(canvas: HTMLCanvasElement): string | undefined {
  const gl =
    canvas.getContext("webgl") ??
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
  if (!gl) return undefined;
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = extension
    ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return typeof renderer === "string" ? renderer : undefined;
}

function runCanvasBenchmark(durationMs = 1000): Promise<number> {
  if (typeof document === "undefined") return Promise.resolve(60_000);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return Promise.resolve(30_000);

  let operations = 0;
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const benchmarkChunk = () => {
      const chunkStartedAt = performance.now();
      while (performance.now() - chunkStartedAt < 12) {
        const position = operations % 192;
        ctx.fillStyle = `hsl(${operations % 360} 80% 55%)`;
        ctx.beginPath();
        ctx.arc(position, (position * 7) % 192, 9 + (operations % 8), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(position, (position * 11) % 192, 36, 3);
        operations++;
      }
      if (performance.now() - startedAt >= durationMs) {
        canvas.width = canvas.height = 1;
        resolve(operations);
      } else {
        setTimeout(benchmarkChunk, 0);
      }
    };
    benchmarkChunk();
  });
}

export async function profileDevice(): Promise<DeviceProfile> {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as NavigatorWithMemory);
  const screenSize =
    typeof screen === "undefined" ? { width: undefined, height: undefined } : screen;
  let renderer: string | undefined;
  if (typeof document !== "undefined") {
    try {
      renderer = getWebGlRenderer(document.createElement("canvas"));
    } catch {
      renderer = undefined;
    }
  }

  const benchmarkScore = await runCanvasBenchmark();
  const signals: DeviceSignals = {
    ...(typeof nav?.deviceMemory === "number" ? { memoryGb: Math.min(8, nav.deviceMemory) } : {}),
    ...(typeof nav?.hardwareConcurrency === "number"
      ? { hardwareConcurrency: nav.hardwareConcurrency }
      : {}),
    ...(typeof window === "undefined" ? {} : { devicePixelRatio: window.devicePixelRatio }),
    ...(typeof screenSize.width === "number" ? { screenWidth: screenSize.width } : {}),
    ...(typeof screenSize.height === "number" ? { screenHeight: screenSize.height } : {}),
    ...(renderer ? { renderer } : {}),
    benchmarkScore,
  };
  return { ...signals, tier: mapDeviceToTier(signals), benchmarkScore };
}
