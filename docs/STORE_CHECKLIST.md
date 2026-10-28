# Store listing and privacy checklist

Use this as a draft; review platform rules and replace placeholders before
submission.

## Listing draft

- **App name:** Neon Serpent
- **Short description (draft):** Battle rival neon snakes, grab glowing orbs, and grow into the arena's biggest serpent.
- **Long description (draft):**

  Slither into a glowing arena where every turn can change the match. Steer
  your neon serpent, collect orbs to grow, and outmaneuver rival snakes before
  they cut you off. Boost to make a bold escape or chase down an opening, but
  watch your size and the arena wall.

  Play offline against AI opponents whenever you like, or connect online to
  join a multiplayer room. Create a private room to play with friends, choose
  your snake look, and tune controls and graphics for your device.

  Neon Serpent is free to play. Online multiplayer requires an internet
  connection. Game rooms are temporary and may reset when the server restarts.

- **Keyword ideas:** snake game, arcade, neon, multiplayer, arena, slither,
  casual, offline, friends, reflex, io game. Check store metadata policies and
  avoid competitor trademarks.
- **Feature graphic:** exactly **1024 × 500 px**, PNG or JPEG.

## Screenshots to prepare

Capture genuine gameplay on each target form factor. Suggested exact portrait
captures below; keep UI and important gameplay inside platform-safe areas:

| Device category | Screenshot dimensions | Suggested minimum set |
| --------------- | --------------------: | --------------------: |
| Phone           |        1080 × 1920 px |                     4 |
| 7-inch tablet   |        1200 × 1920 px |                     4 |
| 10-inch tablet  |        1600 × 2560 px |                     4 |

Include menu/customization, an active match, online lobby/private room, and
pause/settings. Verify current Play Console dimension limits before upload.

## Content rating

Complete the Play Console questionnaire honestly. Expected topics include
mild, non-realistic cartoon snake collisions (no blood or graphic injury) and
online multiplayer with user-chosen nicknames/room codes. The game has no
player-to-player text chat or user-generated images. Reassess the answers if
features change.

## Privacy policy and Data safety

Host [`public/privacy-policy.html`](../public/privacy-policy.html) at a
publicly accessible HTTPS URL and enter that URL in the store listing. Replace
the contact placeholder, verify the descriptions against the actual deployed
server, and keep the policy available after release.

Draft Play Data safety disclosures to verify in Play Console:

- **Personal information — name:** player nickname, entered by the player and
  sent to the multiplayer server while online. Do not claim it is never
  collected if server logs or room state retain it.
- **App activity / gameplay:** temporary room participation and game state
  needed to operate multiplayer. The server stores active rooms in memory.
- **Device or other IDs / network information:** IP address and connection
  metadata are inherently visible to the server and hosting provider for
  networking, abuse limits, and service operation.
- **Collection/sharing:** disclose server/hosting-provider processing and any
  operational logs. Confirm current Render log retention and any other
  telemetry before answering. Do not claim no sharing if infrastructure
  providers process requests.
- **Purpose:** app functionality, multiplayer, security/abuse prevention, and
  diagnostics only if a configured error-report endpoint is enabled.
- **Retention/deletion:** active game rooms are in-memory and cleared on server
  restart; provider logs may have separate retention. Provide the contact below
  for privacy questions or requests.
- **Encryption:** online transport uses HTTPS/WSS. Local offline play does not
  transmit gameplay data.
- **Account deletion:** there is no player account at present. If accounts are
  added, update the policy and implement required deletion handling.

Data Safety is a developer declaration, not a legal determination. Review the
actual production server and all enabled integrations before submission.
