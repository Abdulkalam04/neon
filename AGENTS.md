<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture rules

- Game rules live in `src/game/core/` as pure TypeScript (no React, DOM or canvas); `update(state, inputs, dt)` mutates in place for speed and returns the state. Why: keeps the simulation testable and reusable for a future server.
- Rendering lives in `src/game/render/`; `drawSnake` is the single snake renderer used by both the customize preview and the game. Why: skins look identical everywhere.
- The play loop uses a fixed 60 Hz timestep with requestAnimationFrame rendering, and collisions use a spatial hash grid. Why: deterministic, fast with many snakes.
- Core randomness uses the seeded RNG stored in GameState, never Math.random. Why: deterministic replays/tests.
- Online play goes through the GameConnection interface in src/game/net; the UI never imports MockConnection internals, so a WebSocket implementation can swap in without UI changes.
- Illustrated skins are registered in SPRITE_SKINS with head/body PNG pairs in public/skins; keep the customizer preview and arena on the shared drawSnake renderer. Why: one catalog and renderer keep skin appearance consistent.
- The customizer currently has Snakes and Style tabs in the dark neon theme. Keep route state and preview behavior consistent across both tabs.
- Accessories are not part of the current customizer UI; do not add accessory-specific UI or rendering unless the feature is explicitly requested.
