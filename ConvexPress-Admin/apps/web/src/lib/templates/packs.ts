/**
 * Installed template packs as the admin knows them. Mirrors each pack's
 * `template.json` in the Website checkout (the admin cannot import Website
 * files). `check:templates` on the Website side compares the two.
 */

export interface TemplatePackSummary {
  id: string;
  name: string;
  version: string;
  tagline: string;
  description: string;
  author?: string;
  bestFor?: string[];
  /** Surface ids the pack implements itself; the rest fall back to Core. */
  surfaces: string[];
  variants?: Record<string, string[]>;
  modules?: string[];
}

export const TEMPLATE_PACKS: TemplatePackSummary[] = [
  {
    id: "core",
    name: "Core",
    version: "1.0.0",
    tagline: "The built-in front end, every area covered",
    description:
      "The storefront as shipped: centred content, configurable header and footer, the boutique and marketplace shop layouts, five product page layouts. Every surface is implemented, so it is the fallback for any surface another template leaves out.",
    author: "ConvexPress",
    bestFor: ["Any site as the safe default", "Sites that customise through the header, footer and colour settings"],
    // Core renders every surface: the ones not yet extracted into pack files are the routes' own defaults.
    surfaces: ["*"],
    variants: {
      "shop.catalog": ["boutique", "marketplace"],
      "shop.product": ["classic", "marketplace", "split", "showcase", "minimal"],
    },
    modules: ["colors", "typography", "layout", "header", "footer", "menuLayout", "shop", "pageTemplates"],
  },
];

export function getTemplatePack(id: string): TemplatePackSummary | undefined {
  return TEMPLATE_PACKS.find((pack) => pack.id === id);
}
