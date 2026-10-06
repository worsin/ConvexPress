/**
 * Settings modules: the reusable Customize groups a template pack can include
 * (plan §13–14). Each module is a schema; values are stored per pack under
 * `appearance.template.settings[packId][moduleId]` and read through
 * `useTemplateSettings()`. Colours, fonts and radius become CSS variables, so
 * a change is live the moment the draft or the saved value changes.
 */

import { blockLayoutCss } from "./blockLayout";
import { paletteStyleBlocks, colorSchemeFor } from "@/lib/theme/palette";
import { RADIUS_VALUES, CONTENT_WIDTH_VALUES } from "./settingsSchema";
export * from "./settingsSchema";

const FONT = /^[A-Za-z0-9][A-Za-z0-9 +-]{0,60}$/;

/** CSS for the colour / typography / layout modules. Unknown or empty values are skipped. */
export function settingsCss(values: Record<string, Record<string, unknown>>): { css: string; fonts: string[] } {
  const vars: string[] = [];
  const fonts: string[] = [];
  const colors = values.colors ?? {};
  const entries = Object.entries(colors).map(([slug, color]) => ({ slug, color }));
  const colorCss = paletteStyleBlocks(entries);
  const scheme = colorSchemeFor(entries);
  const typography = values.typography ?? {};
  const display = typeof typography.display === "string" && FONT.test(typography.display) ? typography.display : null;
  const body = typeof typography.body === "string" && FONT.test(typography.body) ? typography.body : null;
  if (body) {
    vars.push(`--font-sans: '${body}', 'Inter Variable', system-ui, sans-serif;`);
    if (body !== "Inter") fonts.push(body);
  }
  if (display) {
    vars.push(`--font-display: '${display}', var(--font-sans);`);
    if (display !== "Inter" && display !== body) fonts.push(display);
  }
  const scale = typography.scale;
  vars.push(`--type-scale: ${scale === "compact" ? 0.94 : scale === "spacious" ? 1.06 : 1};`);
  const layout = values.layout ?? {};
  if (typeof layout.radius === "string" && Object.hasOwn(RADIUS_VALUES, layout.radius)) vars.push(`--radius: ${RADIUS_VALUES[layout.radius]};`);
  if (typeof layout.contentWidth === "string" && Object.hasOwn(CONTENT_WIDTH_VALUES, layout.contentWidth)) vars.push(`--content-max-width: ${CONTENT_WIDTH_VALUES[layout.contentWidth]};`);
  else vars.push("--content-max-width: 80rem;");
  vars.push(...blockLayoutCss(layout));
  return { css: [colorCss, scheme ? `:root:not(.dark) { color-scheme: ${scheme}; }\n.dark { color-scheme: dark; }` : "", vars.length ? `:root {\n${vars.join("\n")}\n}` : ""].filter(Boolean).join("\n"), fonts };
}
