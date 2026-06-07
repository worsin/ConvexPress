import { useMemo } from "react";

import { useSettings } from "@/contexts/SettingsContext";

interface PaletteEntry {
  slug?: unknown;
  color?: unknown;
}

const TOKEN_NAME_PATTERN = /^[a-z][a-z0-9-]{0,60}$/;
const COLOR_VALUE_PATTERN =
  /^(#[0-9a-fA-F]{3,8}|oklch\([^)]+\)|hsl\([^)]+\)|rgb\([^)]+\)|var\(--[a-z0-9-]+\))$/;

function toCssVariables(entries: PaletteEntry[] | undefined): string {
  if (!entries || entries.length === 0) return "";

  return entries
    .map((entry) => {
      if (typeof entry.slug !== "string" || typeof entry.color !== "string") {
        return null;
      }
      const slug = entry.slug.trim();
      const color = entry.color.trim();
      if (!TOKEN_NAME_PATTERN.test(slug) || !COLOR_VALUE_PATTERN.test(color)) {
        return null;
      }
      return `--${slug}: ${color};`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Injects active appearance color tokens as CSS variables for the public site.
 * The admin Colors page writes the palette, Convex exposes the public-safe
 * token list, and Tailwind variable classes consume the values immediately.
 */
export function ThemeStyleInjector() {
  const publicSettings = useSettings();
  const cssText = useMemo(
    () => toCssVariables((publicSettings as any)?.colorPalette as PaletteEntry[] | undefined),
    [publicSettings],
  );

  if (!cssText) return null;

  return (
    <style
      id="convexpress-theme-tokens"
      // Values are constrained to CSS color/token syntax above.
      dangerouslySetInnerHTML={{ __html: `:root {\n${cssText}\n}` }}
    />
  );
}
