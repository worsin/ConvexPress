/**
 * Settings Context - Website Frontend
 *
 * React context provider that exposes public-safe settings to all
 * website components via the useSettings() hook.
 *
 * Consumes the public settings query from the admin-owned Convex database.
 * This is the ConvexPress equivalent of WordPress's get_option() for
 * frontend rendering.
 *
 * Usage:
 *   // In a layout or root component:
 *   import { SettingsProvider } from "@/contexts/SettingsContext";
 *
 *   <SettingsProvider>
 *     <SiteHeader />
 *     {children}
 *     <SiteFooter />
 *   </SettingsProvider>
 *
 *   // In any child component:
 *   import { useSettings } from "@/contexts/SettingsContext";
 *
 *   const { siteTitle, tagline, dateFormat } = useSettings();
 */

import { createContext, useContext, type ReactNode } from "react";
import { convexQuery } from "@convex-dev/react-query";

import { rememberSiteName } from "@/lib/seo/head";
import { useQuery } from "@tanstack/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import type { DashboardConfig } from "@/lib/layout/types";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Public settings values exposed to the website frontend.
 * These are the fields returned by the getPublic query.
 * Sensitive fields (adminEmail, moderationWordList, etc.) are excluded.
 */
export interface PublicSettings {
  // General
  siteTitle: string;
  tagline: string;
  siteUrl: string;
  homeUrl: string;
  logoUrl?: string;
  siteLogo?: string;
  membershipEnabled: boolean;
  siteLanguage: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  weekStartsOn: number;

  // Reading
  homepageDisplays: "latest_posts" | "static_page" | "shop";
  homepageId: string | null;
  postsPageId: string | null;
  postsPerPage: number;
  feedItemCount: number;
  feedContentDisplay: "full" | "summary";
  searchEngineVisibility: boolean;

  // Discussion
  allowComments: boolean;
  requireNameEmail: boolean;
  requireRegistration: boolean;
  enableThreadedComments: boolean;
  threadedCommentsDepth: number;
  commentOrder: "asc" | "desc";
  showAvatars: boolean;
  avatarRating: "G" | "PG" | "R" | "X";
  defaultAvatar: string;

  // Permalinks
  permalinkStructure: string;
  categoryBase: string;
  tagBase: string;

  // Privacy
  privacyPolicyPageId: string | null;
  showPrivacyPolicyLink: boolean;

  // Website Appearance - Header & Footer configs
  headerConfig: Record<string, unknown> | null;
  footerConfig: Record<string, unknown> | null;

  // Public plugin flags
  plugins: {
    commerceEnabled?: boolean;
    commerceSubscriptionsEnabled?: boolean;
    commerceDigitalEnabled?: boolean;
    commerceReviewsEnabled?: boolean;
    commerceWishlistsEnabled?: boolean;
    commerceBundlesEnabled?: boolean;
    commerceReturnsEnabled?: boolean;
    membershipEnabled?: boolean;
    knowledgeBaseEnabled?: boolean;
    ticketsEnabled?: boolean;
    customFieldsEnabled?: boolean;
    recipesEnabled?: boolean;
    galleryEnabled?: boolean;
    lmsEnabled?: boolean;
    formsEnabled?: boolean;
    dashboardEnabled?: boolean;
    [key: string]: boolean | undefined;
  };

  // Customer dashboard shell configuration (Dashboard extension). Partial on
  // the wire; `useDashboardConfig()` merges it over the defaults.
  dashboardConfig?: Partial<DashboardConfig> | null;

  // Block editor runtime config. The front-end renderer uses this to
  // suppress blocks that an admin has disabled in Settings -> Blocks.
  blocksConfig: {
    disabledBlockNames: string[];
  } | null;

  // Commerce runtime config (currency, tax, shipping toggles, etc.)
  commerceConfig: {
    storeName?: string;
    storeEmail?: string;
    currencyCode?: string;
    currencySymbol?: string;
    pricesIncludeTax?: boolean;
    defaultCountryCode?: string;
    defaultState?: string;
    checkoutRequiresPhone?: boolean;
    allowGuestCheckout?: boolean;
    shippingEnabled?: boolean;
    shippingMethods?: Array<{ code: string; label: string }>;
    paymentMethods?: Array<{ code: string; label: string; enabled: boolean }>;
    preferredProvider?: string;
    liveRatesEnabled?: boolean;
    fallbackToManualRates?: boolean;
    fallbackMessage?: string;
    cheapestBadgeLabel?: string;
    fastestBadgeLabel?: string;
    bestOptionBadgeLabel?: string;
    [key: string]: unknown;
  } | null;

  // Shopping assistant rail configuration (Settings > Shop assistant).
  assistantConfig?: Record<string, unknown> | null;

  // Storefront layout presets (Settings > Shop layouts).
  layoutConfig?: {
    shopLayout?: string;
    productLayout?: string;
    cartPanel?: "persistent" | "drawer";
    gridDensity?: "comfortable" | "dense";
  } | null;

  // Brand inputs (Settings > Brand): fonts, corner radius, density, industry.
  brandConfig?: {
    typography?: { display?: string; body?: string; scale?: "compact" | "comfortable" | "spacious" };
    density?: "compact" | "comfortable" | "spacious";
    radius?: "sharp" | "subtle" | "rounded" | "pill";
    industry?: string;
  } | null;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const SettingsContext = createContext<PublicSettings | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * Wraps children with the public settings context.
 * Subscribes to Convex reactive query so settings update in real-time.
 *
 * Place this as high as possible in the component tree (root layout).
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const { data: settings } = useQuery(
    convexQuery(api.settings.queries.getPublic, {}) as any,
  ) as { data: PublicSettings | null | undefined };

  // Titles built outside React (route heads) read the site name from here.
  if (settings?.siteTitle) rememberSiteName(settings.siteTitle);

  return (
    <SettingsContext value={settings ?? null}>
      {children}
    </SettingsContext>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Access the public settings from any component within the SettingsProvider.
 *
 * Returns null while settings are loading (Convex query in flight).
 * Components should handle the null case with a loading state or defaults.
 *
 * @returns Public settings object or null if loading
 */
export function useSettings(): PublicSettings | null {
  return useContext(SettingsContext);
}

/**
 * Access a single settings value by key.
 * Returns undefined if settings are not loaded yet.
 *
 * @param key - The settings key to access
 * @returns The setting value or undefined
 */
export function useSetting<K extends keyof PublicSettings>(
  key: K,
): PublicSettings[K] | undefined {
  const settings = useContext(SettingsContext);
  return settings?.[key];
}
