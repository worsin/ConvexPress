# Brand

How brand inputs translate into design decisions. This doc has two parts:

1. The **shape** of the brand doc in Convex (what fields exist).
2. The **mapping** from brand fields to specific design choices you make.

---

## 1. The brand doc

Pull it live at generation time:

```bash
bunx convex run settings:getBrand
```

(Run from any directory; Convex CLI uses `CONVEX_DEPLOY_KEY` from
`.env`.)

### Shape

```ts
interface BrandDoc {
	/** Free-form vibe description. The primary driver of design feel. */
	moodPrompt: string;
	/**
	 * One or more reference URLs (sites, image refs, Pinterest boards).
	 * If any look like image URLs, you may inspect them via a fetch.
	 */
	references?: string[];
	/**
	 * The user's verbal description of brand voice / tone of copy.
	 * "warm and direct", "playful", "formal expert", etc.
	 */
	voice?: string;
	/**
	 * Optional explicit color pins. When set, use these exactly as the
	 * primary palette. When undefined, you choose based on moodPrompt.
	 */
	palette?: {
		background?: string;       // hex or oklch
		foreground?: string;
		primary?: string;
		primaryForeground?: string;
		secondary?: string;
		accent?: string;
		muted?: string;
		destructive?: string;
		border?: string;
	};
	/**
	 * Optional explicit typography pins.
	 */
	typography?: {
		display?: string;          // Google Font name or system stack
		body?: string;
		scale?: "compact" | "comfortable" | "spacious";
	};
	/**
	 * Optional density override. Controls baseline padding & gap scale.
	 */
	density?: "compact" | "comfortable" | "spacious";
	/**
	 * Optional border-radius preference.
	 */
	radius?: "sharp" | "subtle" | "rounded" | "pill";
	/**
	 * Hard rules. Must-have / must-avoid. Treat as non-negotiable.
	 * Examples:
	 *   "phone number must be visible in header"
	 *   "no stock photography"
	 *   "always show the trust badges row on product pages"
	 */
	hardRules?: string[];
	/**
	 * Optional logo + favicon URLs already uploaded to the media library.
	 */
	logoUrl?: string;
	faviconUrl?: string;
	/**
	 * Optional industry / category tag. Used as a tie-breaker when the
	 * moodPrompt is ambiguous. e.g. "barbershop", "saas", "publication".
	 */
	industry?: string;
}
```

### If the brand doc query returns null

The brand doc hasn't been set up. **Don't proceed with template
generation.** Instead, suggest the user invoke `design:brand-discovery`
to author the brand doc first, then re-run. Output a clear message and
exit.

---

## 2. Brand → design mapping table

How to translate each brand field into concrete design choices.

### `moodPrompt` — the primary driver

Read the mood prompt carefully. Decompose it into:

- **Feel** (warm / cold / energetic / calm / minimal / ornate / playful / serious)
- **Era** (vintage / contemporary / futuristic)
- **Audience** (consumer / professional / niche-enthusiast / mass-market)
- **Tone** (editorial / commercial / personal / institutional)

Use these to choose:

| Feel | Maps to |
|---|---|
| warm / inviting | warm palette (oranges, ambers), generous spacing, rounded radii |
| cool / professional | blue/grey palette, tight spacing, subtle radii |
| energetic | high-saturation accent, bold display type, dynamic compositions |
| calm / minimal | low-saturation palette, lots of whitespace, simple type |
| ornate / editorial | serif display, magazine-style grid, image-led hero |
| playful | curved shapes, bright accents, casual copy |
| serious / institutional | conservative palette, structured grids, formal type |
| vintage | muted tones, serif/slab type, textured backgrounds |
| futuristic | mono/sans type, gradients, sharp geometry |

### `references[]`

If reference URLs look fetchable, inspect them. For image URLs, study
composition, palette, type pairings. Don't copy literally — translate
to this brand's context.

### `voice`

Influences copy you author (CTA labels, empty states, error messages).
If `voice` says "warm and direct", an empty cart says "Your cart's
empty — pick something good." If `voice` says "formal expert", the same
empty cart says "No items currently in your cart."

If the template has no authored copy (just data), `voice` doesn't bind.

### `palette` (optional pins)

**If set**, treat as authoritative. Map each pin to its corresponding
CSS variable. Update `apps/web/src/index.css` if necessary to wire the
variables. **You do not author colors elsewhere; you set the variables
and let the template inherit.**

**If undefined**, derive a palette from `moodPrompt` + `industry` and
write it to `apps/web/src/index.css` as `:root` CSS variables. Make
sure every variable from the architecture's list has a value.

### `typography` (optional pins)

**If `display` or `body` is set**, import that font (Google Fonts via
`@fontsource-variable/*` packages already in `package.json`, or `<link>`
in `apps/web/index.html` for new fonts you add).

**If `scale` is set**:

- `compact` — base font-size 14px, tight leading
- `comfortable` — base font-size 16px (default), normal leading
- `spacious` — base font-size 17-18px, generous leading

Apply via CSS variables or Tailwind config.

### `density`

Drives the *padding & gap* scale used across the template:

| density | spacing baseline |
|---|---|
| compact | `gap-2 / gap-4`, section `py-8` / `py-12` |
| comfortable | `gap-3 / gap-6`, section `py-12` / `py-16` |
| spacious | `gap-4 / gap-8`, section `py-16` / `py-24` |

### `radius`

Map directly to `--radius`:

| radius | `--radius` value |
|---|---|
| sharp | `0px` |
| subtle | `4px` |
| rounded | `12px` |
| pill | `9999px` (used for buttons; cards stay subtle) |

### `hardRules`

Non-negotiable. Read each rule and ensure the template satisfies it. If
a rule applies to the current route, implement it. If it doesn't apply
to this route, ignore. If a rule is ambiguous, surface that in the
generation report — don't guess.

Examples of how hard rules bind per route:

- "phone number must be visible in header" → `design:header` honors it
- "no stock photography" → don't insert any visual that requires stock; use data-driven imagery only
- "always show trust badges on product pages" → `design:single-product` adds a trust-badges row
- "free shipping callout above the fold on home" → `design:homepage` includes it

### `logoUrl` / `faviconUrl`

Use as the site's logo / favicon. The `<head>` for favicon is set in
`__root.tsx` — if you need to update it, do that as part of `design:header`
or a separate small concern, not inline in every template.

### `industry`

Tie-breaker. If `moodPrompt` says "minimal and clean" and `industry` is
"sushi restaurant", lean into food-photography-led composition. If
`industry` is "B2B SaaS", lean into product-screenshot-led composition.

---

## 3. The brand doesn't override the contract

Brand affects **how the template looks**. It does not override the
hard requirements in `CONTRACTS.md`. Accessibility, SEO, SSR, semantic
HTML — those bind regardless of brand.

If the brand requests something that violates a contract (e.g., "use a
red button with white text" where red/white fails contrast), surface the
conflict in the generation report and pick a brand-consistent
*accessible* alternative.
