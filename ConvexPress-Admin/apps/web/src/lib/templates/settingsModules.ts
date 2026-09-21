/**
 * MIRROR of ConvexPress-Website/apps/web/src/templates/sdk/settingsModules.ts.
 * The Website owns the module schemas; keep this copy identical.
 */

export interface TemplateSettingsField {
  id: string;
  label: string;
  type: "color" | "font" | "select" | "toggle" | "text" | "number" | "image" | "menuLocation" | "range";
  default: unknown;
  options?: Array<{ value: string; label: string }>;
  brandBound?: boolean;
  surfaces?: string[];
  min?: number;
  max?: number;
}

export interface TemplateSettingsGroup {
  id: string;
  title: string;
  fields: TemplateSettingsField[];
}

import { readDraftField } from "./draftModel";

export const COLOR_TOKENS = [
  ["background", "Background"],
  ["foreground", "Text"],
  ["card", "Card"],
  ["card-foreground", "Card text"],
  ["muted", "Muted surface"],
  ["muted-foreground", "Muted text"],
  ["primary", "Primary"],
  ["primary-foreground", "On primary"],
  ["secondary", "Secondary"],
  ["secondary-foreground", "On secondary"],
  ["accent", "Accent"],
  ["accent-foreground", "On accent"],
  ["border", "Border"],
  ["input", "Input border"],
  ["ring", "Focus ring"],
  ["destructive", "Destructive"],
] as const;

export interface ColorPreset {
  id: string;
  name: string;
  colors: Record<string, string>;
}

export interface SettingsModule extends TemplateSettingsGroup {
  /** Optional named palettes a pack ships for the colors module. */
  presets?: ColorPreset[];
}

const field = (id: string, label: string, type: TemplateSettingsField["type"], def: unknown, extra: Partial<TemplateSettingsField> = {}): TemplateSettingsField => ({
  id,
  label,
  type,
  default: def,
  ...extra,
});

/** Standard modules. `default: null` for colours means "use the site palette / brand value". */
export const STANDARD_MODULES: Record<string, SettingsModule> = {
  colors: {
    id: "colors",
    title: "Colors",
    fields: COLOR_TOKENS.map(([token, label]) => field(token, label, "color", null, { brandBound: true })),
  },
  typography: {
    id: "typography",
    title: "Typography",
    fields: [
      field("display", "Display font", "font", null, { brandBound: true }),
      field("body", "Body font", "font", null, { brandBound: true }),
      field("scale", "Type scale", "select", "comfortable", {
        options: [
          { value: "compact", label: "Compact" },
          { value: "comfortable", label: "Comfortable" },
          { value: "spacious", label: "Spacious" },
        ],
      }),
    ],
  },
  layout: {
    id: "layout",
    title: "Layout",
    fields: [
      field("radius", "Corner radius", "select", null, {
        brandBound: true,
        options: [
          { value: "sharp", label: "Sharp" },
          { value: "subtle", label: "Subtle" },
          { value: "rounded", label: "Rounded" },
          { value: "pill", label: "Pill" },
        ],
      }),
      field("contentWidth", "Content width", "select", "wide", {
        options: [
          { value: "narrow", label: "Narrow" },
          { value: "wide", label: "Wide" },
          { value: "full", label: "Full" },
        ],
      }),
      field("sectionSpacing", "Section spacing", "select", "comfortable", {
        options: [{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "spacious", label: "Spacious" }],
      }),
      field("elementSpacing", "Content spacing", "select", "comfortable", {
        options: [{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "spacious", label: "Spacious" }],
      }),
      field("blockGap", "Space between blocks", "select", "none", {
        options: [{ value: "none", label: "None" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }],
      }),
    ],
  },
  shop: {
    id: "shop",
    title: "Shop",
    fields: [
      field("catalogVariant", "Catalog layout", "select", null, { surfaces: ["shop.catalog"] }),
      field("productVariant", "Product page layout", "select", null, { surfaces: ["shop.product"] }),
      field("gridDensity", "Product grid density", "select", "comfortable", {
        surfaces: ["shop.catalog"],
        options: [{ value: "comfortable", label: "Comfortable" }, { value: "dense", label: "Dense" }],
      }),
      field("cartPanel", "Cart", "select", "persistent", {
        surfaces: ["shop.catalog", "shop.product"],
        options: [
          { value: "persistent", label: "Persistent column" },
          { value: "drawer", label: "Drawer only" },
        ],
      }),
    ],
  },
  header: {
    id: "header",
    title: "Header",
    fields: [
      field("sticky", "Sticky header", "toggle", true, { surfaces: ["chrome.header"] }),
      field("showTagline", "Show tagline", "toggle", false, { surfaces: ["chrome.header"] }),
      field("ctaLabel", "Button label", "text", "", { surfaces: ["chrome.header"] }),
      field("ctaUrl", "Button link", "text", "", { surfaces: ["chrome.header"] }),
    ],
  },
  footer: {
    id: "footer",
    title: "Footer",
    fields: [
      field("showNewsletter", "Newsletter signup", "toggle", true, { surfaces: ["chrome.footer"] }),
      field("showSocial", "Social links", "toggle", true, { surfaces: ["chrome.footer"] }),
      field("copyright", "Copyright line", "text", "", { surfaces: ["chrome.footer"] }),
    ],
  },
};

export const RADIUS_VALUES: Record<string, string> = {
  sharp: "0rem",
  subtle: "0.375rem",
  rounded: "0.625rem",
  pill: "1.25rem",
};

export const CONTENT_WIDTH_VALUES: Record<string, string> = {
  narrow: "64rem",
  wide: "80rem",
  full: "100%",
};

/** Modules a pack includes, in order, with the pack's own groups appended. */
export function modulesFor(manifest: { modules?: string[]; settings?: TemplateSettingsGroup[]; presets?: Record<string, ColorPreset[]>; menuLocations?: Record<string, string>; defaults?: Record<string, Record<string, unknown>> } | undefined): SettingsModule[] {
  const included = (manifest?.modules ?? []).map((id) => STANDARD_MODULES[id]).filter((m): m is SettingsModule => Boolean(m)).map((module) => ({ ...module, presets: manifest?.presets?.[module.id] ?? module.presets, ...(module.id === "menuLayout" ? { fields: module.fields.map((field) => ({ ...field, default: manifest?.menuLocations?.[field.id] ?? field.default })) } : {}) }));
  return [...included, ...((manifest?.settings ?? []) as SettingsModule[])].map(module => ({
    ...module,
    fields: module.fields.map(field => {
      const packDefault = readDraftField(manifest?.defaults?.[module.id], field.id);
      return packDefault === undefined ? field : { ...field, default: packDefault };
    }),
  }));
}

/** Default values per module from the schema. */
export function defaultsFor(modules: SettingsModule[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const module of modules) {
    out[module.id] = Object.fromEntries(module.fields.map((f) => [f.id, f.default]));
  }
  return out;
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const FONT = /^[A-Za-z0-9][A-Za-z0-9 +-]{0,60}$/;

/** CSS for the colour / typography / layout modules. Unknown or empty values are skipped. */
export function settingsCss(values: Record<string, Record<string, unknown>>): { css: string; fonts: string[] } {
  const vars: string[] = [];
  const fonts: string[] = [];
  const colors = values.colors ?? {};
  for (const [token] of COLOR_TOKENS) {
    const value = colors[token];
    if (typeof value === "string" && HEX.test(value.trim())) vars.push(`--${token}: ${value.trim()};`);
  }
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
  if (scale === "compact") vars.push("--type-scale: 0.94;");
  if (scale === "spacious") vars.push("--type-scale: 1.06;");
  const layout = values.layout ?? {};
  if (typeof layout.radius === "string" && RADIUS_VALUES[layout.radius]) vars.push(`--radius: ${RADIUS_VALUES[layout.radius]};`);
  if (typeof layout.contentWidth === "string" && CONTENT_WIDTH_VALUES[layout.contentWidth]) vars.push(`--content-max-width: ${CONTENT_WIDTH_VALUES[layout.contentWidth]};`);
  return { css: vars.length ? `:root {\n${vars.join("\n")}\n}` : "", fonts };
}
