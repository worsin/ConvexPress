import { useMemo } from "react";

import { useSettings, type PublicSettings } from "@/contexts/SettingsContext";

import { paletteStyleBlocks, colorSchemeFor, type PaletteEntry } from "@/lib/theme/palette";
export { paletteStyleBlocks, colorSchemeFor } from "@/lib/theme/palette";

// Font family names as entered in Settings › Brand ("Space Grotesk", "Fraunces").
const FONT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 +-]{0,60}$/;

const RADIUS_TOKENS: Record<string, string> = {
  sharp: "0rem",
  subtle: "0.375rem",
  rounded: "0.625rem",
  pill: "1.25rem",
};

// Generic fallbacks for the two font roles. Serif display faces get a serif stack
// so the fallback frame still has the right character while the webfont loads.
const SERIF_HINTS = /fraunces|playfair|lora|merriweather|garamond|libre baskerville|dm serif|newsreader|source serif|crimson|cormorant|spectral|literata/i;

function cleanFont(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return FONT_NAME_PATTERN.test(name) ? name : null;
}

function fontStack(name: string): string {
  const generic = SERIF_HINTS.test(name) ? "Georgia, 'Times New Roman', serif" : "'Inter Variable', system-ui, sans-serif";
  return `'${name}', ${generic}`;
}

/** Brand typography + radius as CSS variables, and the Google Fonts request that backs them. */
export function brandCss(brand: PublicSettings["brandConfig"] | undefined): { css: string; fontsHref: string | null } {
  if (!brand) return { css: "", fontsHref: null };
  const display = cleanFont(brand.typography?.display);
  const body = cleanFont(brand.typography?.body);
  const radius = brand.radius ? RADIUS_TOKENS[brand.radius] : undefined;

  const vars: string[] = [];
  if (body) vars.push(`--font-sans: ${fontStack(body)};`);
  vars.push(`--font-display: ${display ? fontStack(display) : body ? fontStack(body) : "var(--font-sans)"};`);
  if (radius) vars.push(`--radius: ${radius};`);

  const families = [...new Set([display, body].filter((f): f is string => Boolean(f) && f !== "Inter"))];
  const fontsHref = families.length
    ? `https://fonts.googleapis.com/css2?${families
        .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
        .join("&")}&display=swap`
    : null;

  const css = [
    `:root {\n${vars.join("\n")}\n}`,
    // Headings and hero type carry the display face; everything else stays on the body face.
    `h1, h2, h3, .font-display { font-family: var(--font-display); }`,
  ].join("\n");
  return { css, fontsHref };
}

/** New backends project palette colors into templateConfig; emitting them twice prevents draft resets. */
export function legacyPaletteFor(settings: unknown): PaletteEntry[] | undefined {
  const value = settings as { templateConfig?: unknown; colorPalette?: PaletteEntry[] } | null;
  return value?.templateConfig ? undefined : value?.colorPalette;
}

/**
 * Injects the active site's design tokens for the public site: the color
 * palette from Appearance › Colors and the typography / radius from
 * Settings › Brand. Tailwind variable classes consume the values immediately,
 * so every storefront running from this codebase looks like its own brand.
 */
export function ThemeStyleInjector() {
  const publicSettings = useSettings();
  const paletteCss = useMemo(
    () => paletteStyleBlocks(legacyPaletteFor(publicSettings)),
    [publicSettings],
  );
  const brand = useMemo(() => brandCss(publicSettings?.brandConfig), [publicSettings]);

  const scheme = colorSchemeFor(legacyPaletteFor(publicSettings));
  const cssText = [
    paletteCss,
    scheme ? `:root:not(.dark) { color-scheme: ${scheme}; }\n.dark { color-scheme: dark; }` : "",
    brand.css,
  ]
    .filter(Boolean)
    .join("\n");
  if (!cssText) return null;

  return (
    <>
      {brand.fontsHref && <link rel="stylesheet" href={brand.fontsHref} />}
      <style
        id="convexpress-theme-tokens"
        // Values are constrained to CSS color/token/font-name syntax above.
        dangerouslySetInnerHTML={{ __html: cssText }}
      />
    </>
  );
}
