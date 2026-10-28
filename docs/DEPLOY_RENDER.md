# Deploy the multiplayer server to Render

The server stores rooms and players in memory. Deploy exactly one instance and do
not enable autoscaling; multiple instances would create separate, incompatible
room lists.

## Deploy with the Blueprint

1. Push the project to a GitHub repository.
2. In Render, choose **New +** → **Blueprint** and connect the repository.
3. Render reads [`render.yaml`](../render.yaml) and creates the `neon-serpent-server`
   Web Service in Singapore. Change `region: singapore` in that file before
   deployment if another Render region is closer to your players.
4. In the service's **Environment** settings, set `ALLOWED_ORIGINS` to a
   comma-separated list of exact origins. Replace `<my-site>` with the website
   origin and do not include trailing slashes or URL paths:

   ```text
   https://<my-site>,http://localhost,https://localhost,capacitor://localhost
   ```

   `http://localhost` and `https://localhost` cover Capacitor Android WebViews;
   `capacitor://localhost` covers iOS. Add any local development origin you
   actually use. The originless-client flag is `ALLOW_NO_ORIGIN=false` by
   default; set it to `true` only when a native client that sends no `Origin`
   header needs access.
5. Wait for the first deploy to finish. Check
   `https://<service-name>.onrender.com/health` and expect `OK`. Check
   `/info` from a configured browser origin for service name, version, room,
   player, and region details.
6. Copy the service's `wss://<service-name>.onrender.com` address into the
   client's multiplayer server setting. Use `ws://localhost:<port>` for local
   development.

The Blueprint uses `npm ci && npm run server:build`, then starts the bundled
production entry with `npm run server:start`. No `tsx`, Vite aliases, or Vite
runtime is required in production.

## Free tier and always-on service

Render's free Web Services sleep after a period without inbound traffic.
Returning players can see a cold start of roughly 30–60 seconds. A paid Starter
instance remains awake and avoids that sleep/wake delay.

As an optional best-effort keep-alive, configure an uptime monitor to request
`GET /health` periodically (for example, every 10–14 minutes). It may reduce
sleep on a free service, but is not guaranteed to prevent it and does not
replace a paid always-on plan. The health endpoint is intentionally simple and
does not report room availability.

## Operations

- Keep `numInstances: 1`; do not configure autoscaling.
- `ALLOWED_ORIGINS` must contain the website and native WebView origins exactly.
- `ALLOW_NO_ORIGIN` defaults to `false`; explicitly enable it only for clients
  that truly omit `Origin`.
- `/info` is protected by the same origin allowlist. `/health` is public for
  Render's health check and uptime monitors.
- The server writes JSON startup, 30-second metrics, and slow-tick warning
  records to the Render service logs.
