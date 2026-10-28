import { createServer } from "./server";

async function main() {
  const port = parseInt(process.env["PORT"] || "3000", 10);
  const instance = await createServer({ port });

  console.log(
    JSON.stringify({
      event: "server_listening",
      host: instance.address,
      port: instance.port,
    }),
  );

  const shutdown = async (signal: string) => {
    console.log(`[server] Received ${signal}, shutting down gracefully...`);
    try {
      await instance.close();
      console.log("[server] Server closed successfully.");
      process.exit(0);
    } catch (err) {
      console.error("[server] Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
