# Adaptive graphics and performance testing

## Quality modes

Graphics defaults to **Auto**. At startup the client combines the browser's
reported memory and CPU count, display size and pixel ratio, an optional WebGL
renderer hint, and a short Canvas 2D benchmark to choose an initial tier:

| Tier | Starting profile                | Intended devices                                |
| ---- | ------------------------------- | ----------------------------------------------- |
| 0    | Low resolution, minimal effects | Entry-level or software-rendered devices        |
| 1    | Reduced resolution and effects  | Older or lower-memory devices                   |
| 2    | Balanced detail                 | Unknown hardware and mid-range devices          |
| 3    | High detail                     | Recent devices with strong graphics performance |

Missing device information is treated as unknown, with a mid-range starting
point. Auto monitors frame intervals: sustained intervals above 20 ms lower one
quality step after two seconds; intervals below 14 ms raise one step after ten
seconds. Changes have a ten-second cooldown. Auto tuning changes resolution
first, then particle density, glow/shadows, background layers, trail sampling,
and detail effects. Settings can instead force High, Medium, or Low.

The renderer keeps the canvas's CSS dimensions stable and adjusts its backing
store. DPR is capped at 2 (1.5 on lower tiers), and lower tiers cap each backing
dimension at 2048 pixels. Battery Saver, or a supported Battery Status API
reading below 20% while not charging, limits rendering to 30 FPS. The game
simulation remains at its existing fixed 60 Hz update.

Canvas gradients and orb sprites are cached with bounded sizes, while reusable
buffers reduce transient render allocations. Caches are released when the app
is backgrounded or the page is hidden and rebuilt on demand. Context loss
stops rendering until restoration.

The profile also controls parallax dust, boost speed lines, and snake
scale/shine/eye detail. Arena rendering uses cached simplified skin variants
when reducing snake detail; the shared `drawSnake` implementation is unchanged
and customizer previews continue to use the original skin.

## Debugging on a low-end device

1. Use Chrome DevTools device emulation, select a small phone viewport, and
   enable **Performance > CPU throttling > 4x slowdown** (then repeat at 6x).
2. Select Auto and enable **Show FPS**. The overlay displays the current FPS,
   selected device tier, and backing-resolution scale. Confirm a sustained
   slowdown lowers one setting at a time and that sustained headroom gradually
   restores quality.
3. Record a Performance trace while playing a crowded match. Inspect long
   frames and scripting/Canvas time; repeat with Low and with Battery Saver.
4. In the console, inspect `navigator.deviceMemory` and
   `navigator.hardwareConcurrency` when available. They are hints, not reliable
   measurements, and browser privacy settings may hide them.
5. Test the actual Android/iOS WebView as well: emulation cannot reproduce GPU
   driver limits, thermal throttling, memory pressure, or background lifecycle
   behavior.

The target is 60 FPS on capable devices and a stable 30 FPS in Battery Saver.
Lower-end hardware may settle below 60 FPS, especially during crowded scenes.
No browser-side adaptive policy can guarantee that every phone will never
stutter, overheat, or run out of memory; validate on representative physical
devices and reduce the forced quality setting if a device remains slow.
