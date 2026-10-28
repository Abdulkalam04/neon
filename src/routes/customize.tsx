import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft, Heart, Pencil, Sparkles, Star, PawPrint, PartyPopper } from "lucide-react";
import { ArenaBackground } from "@/components/ArenaBackground";
import { useGameStore } from "@/lib/store";
import { SKIN_PRESETS, SKIN_TAGS, type SkinPreset, type SkinTag } from "@/game/render/skinPresets";
import {
  BOOST_LIST,
  DEFAULT_SKIN,
  type EyeShape,
  type SkinPattern,
  type SnakeSkin,
} from "@/game/render/drawSnake";
import { EffectThumb, EyeThumb, PreviewSnake, SnakeCardThumb } from "@/components/customize/Thumbs";
import { currentStorage, readLastScreen } from "@/lib/appPersistence";

export const Route = createFileRoute("/customize")({
  validateSearch: (search: Record<string, unknown>): { tab: Tab } => ({
    tab: search["tab"] === "style" ? "style" : "snakes",
  }),
  head: () => ({
    meta: [
      { title: "Customize Snake — Neon Serpent" },
      {
        name: "description",
        content: "Design your snake: pick a skin, a unique design, colors, eyes and boost effects.",
      },
      { property: "og:title", content: "Customize Snake — Neon Serpent" },
      {
        property: "og:description",
        content: "Design your snake: pick a skin, a unique design, colors, eyes and boost effects.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Customize,
});

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

const PALETTES: { name: string; primary: string; secondary: string }[] = [
  { name: "Toxic", primary: "#9dff3a", secondary: "#1a3a00" },
  { name: "Sunset", primary: "#ff7a2a", secondary: "#ff2b8a" },
  { name: "Ocean", primary: "#22e4ff", secondary: "#1a4cff" },
  { name: "Candy", primary: "#ff7ad9", secondary: "#7af0ff" },
  { name: "Gold", primary: "#ffd23a", secondary: "#a86a00" },
  { name: "Ghost", primary: "#e8f0ff", secondary: "#7a86a8" },
  { name: "Lava", primary: "#ff3a1a", secondary: "#ffb01a" },
  { name: "Mint", primary: "#5affc0", secondary: "#e0fff4" },
  { name: "Royal", primary: "#8a7bff", secondary: "#ffd23a" },
  { name: "Cyber", primary: "#22e4ff", secondary: "#ff2bd6" },
  { name: "Forest", primary: "#3aa84a", secondary: "#c9ff6a" },
  { name: "Ice", primary: "#bff6ff", secondary: "#4aa8ff" },
];

/**
 * Designs that look clearly different from each other. The renderer has a few
 * more patterns (dots, zebra, tiger, glow-pulse, ...) but at snake size they are
 * near-duplicates of these, so they are not offered here.
 */
const DESIGNS: { id: SkinPattern; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "gradient", label: "Gradient" },
  { id: "stripes", label: "Stripes" },
  { id: "candy", label: "Candy" },
  { id: "coral", label: "Rings" },
  { id: "leopard", label: "Spots" },
  { id: "galaxy", label: "Galaxy" },
  { id: "rainbow", label: "Rainbow" },
];

const EYES: EyeShape[] = ["round", "oval", "angry", "cute", "sleepy", "cyclops", "heart"];

const EFFECT_LABEL: Record<string, string> = {
  flame: "Flame",
  electric: "Lightning",
  bubbles: "Bubbles",
  rainbow: "Rainbow",
  stardust: "Stardust",
};

type Tab = "snakes" | "style";
const TABS: { id: Tab; label: string }[] = [
  { id: "snakes", label: "Snakes" },
  { id: "style", label: "Style" },
];

const TAG_ICON: Record<SkinTag, typeof Star> = {
  classic: Star,
  animals: PawPrint,
  fantasy: Sparkles,
  festive: PartyPopper,
};

/** The fields that make up a snake's "look" (as opposed to its effects). */
const designOf = (s: SnakeSkin): Partial<SnakeSkin> => ({
  sprite: s.sprite,
  pattern: s.pattern,
  primary: s.primary,
  secondary: s.secondary,
  eyes: s.eyes,
  shading: s.shading ?? "flat",
});
const sameDesign = (a: SnakeSkin, b: SnakeSkin) =>
  JSON.stringify(designOf(a)) === JSON.stringify(designOf(b));
const sameSkin = (a: SnakeSkin, b: SnakeSkin) => JSON.stringify(a) === JSON.stringify(b);

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function Customize() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const skin = useGameStore((s) => s.skin);
  const replaceSkin = useGameStore((s) => s.replaceSkin);
  const nickname = useGameStore((s) => s.nickname);
  const setNickname = useGameStore((s) => s.setNickname);
  const favorites = useGameStore((s) => s.favorites);
  const toggleFavorite = useGameStore((s) => s.toggleFavorite);
  const basePresetId = useGameStore((s) => s.basePresetId);
  const setBasePresetId = useGameStore((s) => s.setBasePresetId);

  const [category, setCategory] = useState<string>("all");

  useLayoutEffect(() => {
    const storage = currentStorage();
    const saved = storage ? readLastScreen(storage) : null;
    if (!saved || saved.path !== "/customize") return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    return () => cancelAnimationFrame(frame);
  }, []);

  const base = SKIN_PRESETS.find((p) => p.id === basePresetId) ?? SKIN_PRESETS[0]!;
  const activePreset = SKIN_PRESETS.find((p) => sameSkin(p.skin, skin));
  const caption = activePreset?.name ?? (sameDesign(skin, base.skin) ? base.name : "My Snake");
  const blurb = activePreset?.desc ?? "Your own mix of design, colors and effects.";

  const chooseSnake = (p: SkinPreset) => {
    replaceSkin(p.skin);
    setBasePresetId(p.id);
  };

  return (
    <div className="bg-arena relative min-h-screen overflow-hidden">
      <ArenaBackground />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pt-5 pb-10 sm:px-6">
        <header className="flex items-center gap-4">
          <Link
            to="/"
            aria-label="Back to main menu"
            className="neon-btn glow-cyan inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Menu
          </Link>
          <h1 className="text-glow animate-float-in font-display text-3xl leading-none sm:text-5xl">
            CUSTOMIZE
          </h1>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          {/* ------------------------------------------------ live preview */}
          <section
            aria-label="Your snake"
            className="glass animate-float-in flex h-[24rem] flex-col rounded-2xl p-4 lg:sticky lg:top-5 lg:h-[34rem]"
          >
            <label className="flex items-center gap-2 rounded-xl border border-input bg-background/60 px-3 py-2 focus-within:border-ring focus-within:shadow-[0_0_20px_-4px_var(--neon-cyan)]">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your name"
                maxLength={16}
                aria-label="Nickname"
                className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-muted-foreground"
              />
              <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </label>

            <div className="my-2 min-h-0 flex-1">
              <PreviewSnake skin={skin} boosting={tab === "style"} />
            </div>

            <div className="text-center" aria-live="polite">
              <div className="font-display text-xl">{caption}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {tab === "style"
                  ? "Your effects are shown live on the snake."
                  : "Move the mouse to look around. Hold to boost."}
              </p>
            </div>
          </section>

          {/* ------------------------------------------------ tabbed panel */}
          <section className="glass animate-float-in flex min-w-0 flex-col rounded-2xl p-4 [animation-delay:120ms] sm:p-5">
            <div
              role="tablist"
              aria-label="Customization sections"
              className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-input bg-background/40 p-1"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() =>
                    void navigate({
                      to: "/customize",
                      search: { tab: t.id },
                      replace: true,
                    })
                  }
                  className={`min-h-11 rounded-lg px-4 py-2.5 font-display text-sm tracking-wide uppercase transition ${
                    tab === t.id
                      ? "bg-[color-mix(in_oklab,var(--neon-cyan)_22%,transparent)] text-foreground shadow-[0_0_18px_-4px_var(--neon-cyan)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "snakes" ? (
              <SnakesTab
                category={category}
                setCategory={setCategory}
                skin={skin}
                favorites={favorites}
                onFav={toggleFavorite}
                onPick={chooseSnake}
              />
            ) : (
              <StyleTab skin={skin} base={base} blurb={blurb} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

/** A selectable card in the app's neon style. */
function Card({
  selected,
  label,
  onClick,
  className = "",
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={`neon-btn glow-cyan relative flex flex-col items-center justify-center overflow-hidden p-2 ${
        selected
          ? "bg-[color-mix(in_oklab,var(--neon-cyan)_26%,transparent)] shadow-[0_0_24px_-4px_var(--neon-cyan)] ring-2 ring-[var(--neon-cyan)]"
          : ""
      } ${className}`}
    >
      {children}
      {selected && (
        <span className="absolute inset-x-0 bottom-0 bg-[var(--neon-cyan)] py-0.5 text-center text-[0.65rem] font-bold tracking-wider text-[oklch(0.14_0.04_265)] uppercase">
          Selected
        </span>
      )}
    </button>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-sm tracking-widest text-[var(--neon-cyan)] uppercase">
        {children}
      </h2>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Snakes tab                                                                 */
/* -------------------------------------------------------------------------- */

function SnakesTab({
  category,
  setCategory,
  skin,
  favorites,
  onFav,
  onPick,
}: {
  category: string;
  setCategory: (c: string) => void;
  skin: SnakeSkin;
  favorites: string[];
  onFav: (id: string) => void;
  onPick: (p: SkinPreset) => void;
}) {
  const chips = useMemo(
    () => [
      { id: "all", label: "All", count: SKIN_PRESETS.length },
      ...SKIN_TAGS.map((t) => ({
        id: t.id as string,
        label: t.label,
        count: SKIN_PRESETS.filter((p) => p.tag === t.id).length,
      })),
      {
        id: "favorites",
        label: "Favorites",
        count: SKIN_PRESETS.filter((p) => favorites.includes(`skin:${p.id}`)).length,
      },
    ],
    [favorites],
  );
  const items = SKIN_PRESETS.filter((p) =>
    category === "all"
      ? true
      : category === "favorites"
        ? favorites.includes(`skin:${p.id}`)
        : p.tag === category,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Skin categories">
        {chips.map((c) => (
          <button
            key={c.id}
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase transition ${
              category === c.id
                ? "border-[var(--neon-cyan)] bg-[color-mix(in_oklab,var(--neon-cyan)_22%,transparent)] shadow-[0_0_14px_-4px_var(--neon-cyan)]"
                : "border-input text-muted-foreground hover:border-[var(--neon-cyan)] hover:text-foreground"
            }`}
          >
            {c.label} <span className="opacity-60">{c.count}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
          No favorites yet. Tap the heart on a snake to save it here.
        </div>
      ) : (
        <div
          role="list"
          aria-label="Snakes"
          className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3 pr-1 pb-2 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto"
        >
          {items.map((p) => {
            const TagIcon = TAG_ICON[p.tag];
            const fav = favorites.includes(`skin:${p.id}`);
            return (
              <div role="listitem" key={p.id} className="relative aspect-[1/2.1]">
                <Card
                  className="h-full w-full !p-1"
                  selected={sameSkin(p.skin, skin)}
                  label={`${p.name} snake`}
                  onClick={() => onPick(p)}
                >
                  <TagIcon
                    className="absolute top-1.5 left-1.5 size-3.5 text-muted-foreground"
                    aria-hidden
                  />
                  <SnakeCardThumb skin={p.skin} />
                </Card>
                <button
                  type="button"
                  aria-pressed={fav}
                  aria-label={
                    fav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`
                  }
                  onClick={() => onFav(`skin:${p.id}`)}
                  className={`absolute top-1.5 right-1.5 z-10 transition ${
                    fav
                      ? "text-[var(--neon-magenta)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Heart className="size-4" fill={fav ? "currentColor" : "none"} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Style tab                                                                  */
/* -------------------------------------------------------------------------- */

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-input bg-background/50 p-1.5 pr-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-lg border-0 bg-transparent"
        aria-label={label}
      />
      <span className="flex flex-col leading-tight">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="font-mono text-sm">{value}</span>
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs tracking-wide text-muted-foreground uppercase">
        <span>{label}</span>
        <span className="text-foreground">{display}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--neon-cyan)]"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-input bg-background/50 px-3 py-2.5 text-left"
    >
      <span className="text-xs tracking-wide uppercase">{label}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-[var(--neon-cyan)]" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function StyleTab({ skin, base, blurb }: { skin: SnakeSkin; base: SkinPreset; blurb: string }) {
  const setSkin = useGameStore((s) => s.setSkin);

  // Designs are drawn with the snake's own colours, or the default neon pair when the
  // current snake is an illustration (whose colours are baked into its pictures).
  const designColors = skin.sprite
    ? { primary: DEFAULT_SKIN.primary, secondary: DEFAULT_SKIN.secondary }
    : { primary: skin.primary, secondary: skin.secondary };
  const plain = (s: SnakeSkin): SnakeSkin => ({ ...s, sprite: undefined });

  const isDefault = sameDesign(skin, base.skin);

  /** Pick a design: switches an illustrated snake to a drawn one using the same effects. */
  const pickDesign = (pattern: SkinPattern) =>
    setSkin({
      ...designColors,
      pattern,
      sprite: undefined,
      shading: "flat",
      eyes: skin.sprite ? DEFAULT_SKIN.eyes : skin.eyes,
    });
  const pickDefault = () => setSkin(designOf(base.skin));
  const pickColors = (primary: string, secondary: string) =>
    setSkin({ primary, secondary, sprite: undefined, shading: "flat" });

  return (
    <div className="flex flex-col gap-7 pr-1 pb-2 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto">
      {/* ------------------------------------------------ Design */}
      <section>
        <SectionTitle hint="Default keeps the snake you chose. The others re-draw it with a different design.">
          Design
        </SectionTitle>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
          <Card
            className="aspect-[1/1.9] !p-1"
            selected={isDefault}
            label={`Default design (${base.name})`}
            onClick={pickDefault}
          >
            <SnakeCardThumb skin={base.skin} radius={9} />
            <span className="absolute top-1.5 left-0 right-0 text-center text-[0.65rem] font-bold tracking-wider uppercase">
              Default
            </span>
          </Card>
          {DESIGNS.map((d) => (
            <Card
              key={d.id}
              className="aspect-[1/1.9] !p-1"
              selected={!isDefault && !skin.sprite && skin.pattern === d.id}
              label={`${d.label} design`}
              onClick={() => pickDesign(d.id)}
            >
              <SnakeCardThumb
                radius={9}
                skin={plain({ ...skin, ...designColors, pattern: d.id, shading: "flat" })}
              />
              <span className="absolute top-1.5 left-0 right-0 text-center text-[0.65rem] font-bold tracking-wider uppercase">
                {d.label}
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ Colors */}
      <section>
        <SectionTitle hint="Colors apply to drawn designs. Picking one turns an illustrated snake into a drawn one; choose Default to bring it back.">
          Colors
        </SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <ColorField
            label="Primary"
            value={skin.primary}
            onChange={(primary) => pickColors(primary, skin.secondary)}
          />
          <ColorField
            label="Secondary"
            value={skin.secondary}
            onChange={(secondary) => pickColors(skin.primary, secondary)}
          />
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
          {PALETTES.map((p) => (
            <Card
              key={p.name}
              className="h-16 !p-1"
              selected={
                !skin.sprite && p.primary === skin.primary && p.secondary === skin.secondary
              }
              label={`${p.name} colors`}
              onClick={() => pickColors(p.primary, p.secondary)}
            >
              <span
                className="mb-3 h-4 w-[80%] rounded-full"
                style={{ background: `linear-gradient(90deg, ${p.primary}, ${p.secondary})` }}
              />
              <span className="absolute bottom-1 text-[0.65rem] tracking-wide uppercase">
                {p.name}
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ Eyes */}
      <section>
        <SectionTitle>Eyes</SectionTitle>
        {skin.sprite ? (
          <p className="rounded-xl border border-dashed border-input p-4 text-sm text-muted-foreground">
            Illustrated snakes already have their own face. Pick a design above to choose eyes.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3">
              {EYES.map((e) => (
                <Card
                  key={e}
                  className="aspect-square !p-1"
                  selected={skin.eyes.shape === e}
                  label={`${e} eyes`}
                  onClick={() => setSkin({ eyes: { ...skin.eyes, shape: e } })}
                >
                  <EyeThumb skin={skin} shape={e} />
                </Card>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ColorField
                label="Eye color"
                value={skin.eyes.color}
                onChange={(color) => setSkin({ eyes: { ...skin.eyes, color } })}
              />
              <Toggle
                label="Looks toward mouse"
                checked={skin.eyes.followMouse}
                onChange={(followMouse) => setSkin({ eyes: { ...skin.eyes, followMouse } })}
              />
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------ Effects */}
      <section>
        <SectionTitle hint="Every effect is shown on your own snake. The big preview plays your chosen boost effect live.">
          Boost effect
        </SectionTitle>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
          {BOOST_LIST.map((b) => (
            <Card
              key={b}
              className="aspect-[1/1.5] !p-1"
              selected={skin.boost === b}
              label={`${EFFECT_LABEL[b]} boost effect`}
              onClick={() => setSkin({ boost: b })}
            >
              <EffectThumb skin={skin} boost={b} />
              <span className="absolute top-1.5 left-0 right-0 text-center text-[0.65rem] font-bold tracking-wider uppercase">
                {EFFECT_LABEL[b]}
              </span>
            </Card>
          ))}
        </div>

        <div className="mt-4">
          <Slider
            label="Body glow"
            value={skin.glow}
            onChange={(glow) => setSkin({ glow })}
            display={`${Math.round(skin.glow * 100)}%`}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{blurb}</p>
      </section>
    </div>
  );
}
