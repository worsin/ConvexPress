import type { RequestReadLedger } from "../helpers/requestReadLedger";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getDefaults } from "./defaults";
import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";

type Fields = Record<string, unknown>;
export interface AppearanceValues {
  active: string;
  overrides: Record<string, string>;
  variants: Record<string, string>;
  settings: Record<string, Record<string, Fields>>;
}
const record = (value: unknown): Fields => value && typeof value === "object" && !Array.isArray(value) ? value as Fields : {};

/** Fill legacy values once. Explicit template configuration always wins. */
export function projectLegacyAppearance(raw: unknown, layout: unknown, palette: unknown): AppearanceValues {
  const source = record(raw);
  const active = typeof source.active === "string" && source.active ? source.active : "core";
  const settings = { ...record(source.settings) } as AppearanceValues["settings"];
  const pack = { ...record(settings[active]) } as Record<string, Fields>;
  const shop = { ...record(pack.shop) };
  const colors = { ...record(pack.colors) };
  const variants = { ...record(source.variants) } as Record<string, string>;
  const legacy = record(layout);
  for (const [legacyKey, field, surface] of [["shopLayout", "catalogVariant", "shop.catalog"], ["productLayout", "productVariant", "shop.product"]]) {
    const effective = variants[surface] ?? shop[field] ?? legacy[legacyKey];
    if (typeof effective === "string" && effective) {
      variants[surface] ??= effective;
      shop[field] ??= effective;
    }
  }
  for (const key of ["cartPanel", "gridDensity"]) if (shop[key] == null && legacy[key] != null) shop[key] = legacy[key];
  if (Array.isArray(palette)) for (const entry of palette) {
    const { slug, color } = record(entry);
    if (typeof slug === "string" && /^[a-z][a-z0-9-]{0,65}$/.test(slug.trim()) && typeof color === "string" && colors[slug.trim()] == null) colors[slug.trim()] = color;
  }
  if (Object.keys(shop).length) pack.shop = shop;
  if (Object.keys(colors).length) pack.colors = colors;
  if (Object.keys(pack).length) settings[active] = pack;
  return { active, overrides: { ...record(source.overrides) } as Record<string, string>, variants, settings };
}

/** Convert former flat Customizer aliases once so nested controls can subsequently change them. */
function normalizeChromeAliases(section: "header" | "footer", source: Fields): Fields {
  const out = { ...source };
  const map = section === "header"
    ? [["sticky", "layout", "sticky"], ["showTagline", "logo", "showTagline"], ["ctaLabel", "cta", "label"], ["ctaUrl", "cta", "url"]]
    : [["showNewsletter", "newsletter", "enabled"], ["showSocial", "branding", "showSocial"], ["copyright", "bottomBar", "copyrightText"]];
  for (const [alias, module, field] of map) {
    if (out[alias] === undefined) continue;
    const fields = { ...record(out[module]) };
    if (!(field in fields)) fields[field] = alias === "sticky" && typeof out[alias] === "boolean" ? (out[alias] ? "always" : "none") : out[alias];
    if (alias === "ctaLabel" && !("enabled" in fields)) fields.enabled = Boolean(out[alias]);
    out[module] = fields;
    delete out[alias];
  }
  return out;
}

/** Nested builder config: stored overrides win; arrays and explicit null reset values remain intact. */
function mergeMissing(source: Fields, overrides: Fields): Fields {
  const merged = { ...source, ...overrides };
  for (const key of Object.keys(overrides)) {
    const from = source[key], to = overrides[key];
    if (from && to && typeof from === "object" && typeof to === "object" && !Array.isArray(from) && !Array.isArray(to)) merged[key] = mergeMissing(record(from), record(to));
  }
  return merged;
}

export async function readAppearance(ctx: Pick<QueryCtx, "db">, budget?: RequestReadLedger) {
  budget?.beforeRead();
  const doc = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "appearance.template")).unique();
  budget?.record(doc);
  const version = doc?.legacyAppearanceMigration?.version ?? 0;
  if (version >= 2) {
    return { doc, values: { ...getDefaults("appearance.template"), ...record(doc?.values) } as unknown as AppearanceValues };
  }
  let values: AppearanceValues;
  if (version >= 1) {
    // Version 1 already cut off palette/shop sources. Never revive resets during the chrome upgrade.
    values = { ...getDefaults("appearance.template"), ...record(doc?.values) } as unknown as AppearanceValues;
  } else {
    budget?.beforeRead();
    const layout = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "commerce.layout")).unique();
    budget?.record(layout);
    budget?.beforeRead();
    const theme = await ctx.db.query("themes").withIndex("by_active", q => q.eq("isActive", true)).first();
    budget?.record(theme);
    const globalPalette = record(record(record(record(theme).globalStyles).settings).color).palette;
    const palette = Array.isArray(globalPalette) ? globalPalette : theme?.colorPalette;
    values = projectLegacyAppearance(doc?.values, layout?.values, palette);
  }
  const pack = { ...values.settings[values.active] };
  for (const section of ["header", "footer"] as const) {
    budget?.beforeRead();
    const legacy = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", section)).unique();
    budget?.record(legacy);
    const overrides = normalizeChromeAliases(section, record(pack[section]));
    if (legacy || Object.keys(overrides).length) pack[section] = mergeMissing(record(legacy?.values), overrides);
  }
  return { doc, values: { ...values, settings: { ...values.settings, ...(Object.keys(pack).length ? { [values.active]: pack } : {}) } } };

}

export async function persistLegacyAppearance(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const { doc, values } = await readAppearance(ctx);
  if ((doc?.legacyAppearanceMigration?.version ?? 0) >= 2) return false;
  const now = Date.now();
  const update = { values, updatedAt: now, updatedBy: userId, legacyAppearanceMigration: { version: 2, migratedAt: now } };
  if (doc) await patchWithMediaReferences<"settings">(ctx, "settings", doc._id, update);
  else await insertWithMediaReferences<"settings">(ctx, "settings", { section: "appearance.template", ...update });
  return true;
}

/** Compatibility DTO for older storefront builds, derived exclusively from the template. */
export function legacyShopProjection(values: AppearanceValues) {
  const shop = values.settings[values.active]?.shop ?? {};
  return {
    ...getDefaults("commerce.layout"),
    ...(typeof (values.variants["shop.catalog"] ?? shop.catalogVariant) === "string" ? { shopLayout: values.variants["shop.catalog"] ?? shop.catalogVariant } : {}),
    ...(typeof (values.variants["shop.product"] ?? shop.productVariant) === "string" ? { productLayout: values.variants["shop.product"] ?? shop.productVariant } : {}),
    ...(shop.cartPanel != null ? { cartPanel: shop.cartPanel } : {}),
    ...(shop.gridDensity != null ? { gridDensity: shop.gridDensity } : {}),
  };
}
