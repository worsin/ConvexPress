/** Shared brand/template palette CSS with stable light/dark semantics. */
export interface PaletteEntry {
  slug?: unknown;
  color?: unknown;
}

const TOKEN_NAME_PATTERN = /^[a-z][a-z0-9-]{0,60}$/;
const COLOR_VALUE_PATTERN =
  /^(#[0-9a-fA-F]{3,8}|(?:oklch|hsl|rgb)\([^()<>{};\r\n]+\)|var\(--[a-z0-9-]+\))$/;
/** Relative luminance of a hex colour, or null when the value is not hex. */
function hexLuminance(value: string): number | null {
  const hex = value.trim().replace("#", "");
  const full = hex.length === 3 || hex.length === 4 ? hex.slice(0, 3).split("").map((c) => c + c).join("") : hex.slice(0, 6);
  if (full.length !== 6) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Tells the browser whether the site is dark or light so native UI
 * (scrollbars, form controls, the overscroll area) matches the palette.
 */
export function colorSchemeFor(entries: PaletteEntry[] | undefined): "light" | "dark" | null {
  const background = entries?.find((entry) => entry.slug === "background");
  if (!background || typeof background.color !== "string") return null;
  const luminance = hexLuminance(background.color);
  if (luminance === null) return null;
  return luminance < 0.3 ? "dark" : "light";
}

const DARK_PREFIX = "dark-";

function toCssVariables(entries: PaletteEntry[] | undefined, mode: "light" | "dark" = "light"): string {
  if (!entries || entries.length === 0) return "";

  return entries
    .map((entry) => {
      if (typeof entry.slug !== "string" || typeof entry.color !== "string") {
        return null;
      }
      let slug = entry.slug.trim();
      const color = entry.color.trim();
      const isDarkEntry = slug.startsWith(DARK_PREFIX);
      // `dark-<token>` entries only apply in dark mode, as `--<token>`.
      if (mode === "dark" ? !isDarkEntry : isDarkEntry) return null;
      if (isDarkEntry) slug = slug.slice(DARK_PREFIX.length);
      if (!TOKEN_NAME_PATTERN.test(slug) || !COLOR_VALUE_PATTERN.test(color)) {
        return null;
      }
      return `--${slug}: ${color};`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Scope the brand palette so the built-in dark tokens still win when the
 * visitor switches to dark mode. A light palette applies to `:root:not(.dark)`
 * only; a palette that is itself dark applies everywhere; explicit
 * `dark-<token>` entries apply under `.dark`.
 */
export function paletteStyleBlocks(entries: PaletteEntry[] | undefined): string {
  const light = toCssVariables(entries, "light");
  const dark = toCssVariables(entries, "dark");
  const scheme = colorSchemeFor(entries);
  const blocks: string[] = [];
  if (light) {
    blocks.push(scheme === "dark" ? `:root {\n${light}\n}` : `:root:not(.dark) {\n${light}\n}`);
  }
  if (dark) blocks.push(`.dark {\n${dark}\n}`);
  return blocks.join("\n");
}
