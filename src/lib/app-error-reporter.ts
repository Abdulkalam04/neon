interface ErrorReport {
  type: "error" | "unhandledrejection";
  name: string;
  message: string;
  stack?: string;
  occurredAt: string;
}

let removeListeners: (() => void) | null = null;

function toReport(type: ErrorReport["type"], value: unknown): ErrorReport {
  const error = value instanceof Error ? value : new Error(String(value));
  return {
    type,
    name: error.name.slice(0, 120),
    message: error.message.slice(0, 1000),
    ...(error.stack ? { stack: error.stack.slice(0, 5000) } : {}),
    occurredAt: new Date().toISOString(),
  };
}

function report(type: ErrorReport["type"], value: unknown): void {
  const data = toReport(type, value);
  console.error("[app-error]", data);

  const endpoint = import.meta.env["VITE_ERROR_REPORT_URL"];
  if (!endpoint) return;

  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    keepalive: true,
  }).catch((error: unknown) => {
    console.warn("[app-error] Report delivery failed", error);
  });
}

export function installAppErrorReporter(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (removeListeners) return removeListeners;

  const onError = (event: ErrorEvent) =>
    report("error", event.error ?? event.message ?? "Unknown application error");
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    report("unhandledrejection", event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  removeListeners = () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    removeListeners = null;
  };
  return removeListeners;
}
