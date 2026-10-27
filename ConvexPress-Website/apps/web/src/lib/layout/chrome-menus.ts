import { STANDARD_MODULES } from "@/templates/sdk/settingsSchema";

/** An installed pack's manifest by id (the registry's getTemplatePack), undefined if not installed. */
type PackLookup = (packId: string) => { menuLocations?: Record<string, string> } | undefined;

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Locations the header and footer read without a Menu locations field. */
const DIRECT_LOCATIONS = ["social", "mobile"];

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {};

/**
 * The menu locations the site's header and footer will read: each Menu
 * locations field resolved as useMenuForLocation resolves it (the site's saved
 * choice, else the pack's default, else the field's own), plus the ones read
 * directly. The marketing layout prefetches these so the header and footer
 * render in the first server flush instead of streaming in after the page,
 * which pushed the page down as the header arrived. A location read only in a
 * Customizer draft is still fetched on demand.
 */
export function chromeMenuLocations(publicSettings: unknown, previewPack: unknown, pack: PackLookup): string[] {
  const installed = (value: unknown) => (typeof value === "string" && SLUG.test(value) && pack(value) ? value : null);
  const config = record(record(publicSettings).templateConfig);
  const packId = installed(previewPack) ?? installed(config.active) ?? "core";
  const menuLocations = pack(packId)?.menuLocations ?? {};
  const saved = record(record(record(config.settings)[packId]).menuLayout);
  const locations = new Set<string>(DIRECT_LOCATIONS);
  for (const field of STANDARD_MODULES.menuLayout?.fields ?? []) {
    const chosen = saved[field.id] ?? menuLocations[field.id] ?? field.default;
    if (typeof chosen === "string" && SLUG.test(chosen)) locations.add(chosen);
  }
  return [...locations];
}
