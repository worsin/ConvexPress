/**
 * Demo shop catalog contract.
 *
 * Two hand-authored catalogs (Northstar Coffee, Ridgeline Cycles) exercise the
 * shopping assistant's compatibility reasoning: products carry structured
 * attributes and a relation graph with human evidence strings.
 */

export type DemoRelationType =
  | "accessory_of"
  | "compatible_with"
  | "consumable_for"
  | "maintenance_for"
  | "upgrade_of"
  | "replacement_for"
  | "bundle_with"
  | "similar_to";

export interface DemoRelation {
  /** Slug of the product this relation hangs off (the "from" side). */
  from: string;
  /** Slug of the related product. */
  to: string;
  type: DemoRelationType;
  weight: number;
  evidence: string;
}

export interface DemoCategory {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface DemoProduct {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  description: string;
  /** Minor units. */
  priceMinor: number;
  compareAtMinor?: number;
  sku: string;
  stock: number;
  weightOz: number;
  /** Structured facts for the assistant (rendered as attributes on cards). */
  attributes: Record<string, string | number | boolean | string[]>;
  /** One line under the card. */
  summary: string;
  /** Image generation prompt (product only; style comes from the shop). */
  imagePrompt: string;
}

export interface DemoShop {
  key: string;
  /** Site + store identity written to settings. */
  siteTitle: string;
  tagline: string;
  storeName: string;
  storeEmail: string;
  currencyCode: string;
  currencySymbol: string;
  /** Brand doc written to the "brand" settings section. */
  brand: {
    moodPrompt: string;
    voice: string;
    industry: string;
    hardRules: string[];
    typography: { display: string; body: string; scale: "compact" | "comfortable" | "spacious" };
    density: "compact" | "comfortable" | "spacious";
    radius: "sharp" | "subtle" | "rounded" | "pill";
  };
  /** Public colour tokens applied by the storefront's ThemeStyleInjector. */
  palette: Array<{ slug: string; name: string; color: string }>;
  /** Shared style prefix for every product image. */
  imageStyle: string;
  assistant: {
    displayName: string;
    tagline: string;
    tone: string;
    starterPrompts: string[];
    disclosureText: string;
  };
  categories: DemoCategory[];
  products: DemoProduct[];
  relations: DemoRelation[];
}
