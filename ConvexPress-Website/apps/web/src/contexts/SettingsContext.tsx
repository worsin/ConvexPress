import { SiteTimeZoneProvider } from "./SiteTimeZoneContext";
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
import type { FunctionReturnType } from "convex/server";
import { api } from "@convexpress-website/backend/generated/api";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Public settings values exposed to the website frontend: exactly what the
 * `settings.queries.getPublic` query returns (its return validator is the
 * contract). Sensitive fields (adminEmail, moderationWordList, etc.) are
 * excluded by that query.
 */
export type PublicSettings = FunctionReturnType<typeof api.settings.queries.getPublic>;

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
  const { data: settings } = useQuery(convexQuery(api.settings.queries.getPublic, {}));

  // Titles built outside React (route heads) read the site name from here.
  if (settings?.siteTitle) rememberSiteName(settings.siteTitle);

  return (
    <SettingsContext value={settings ?? null}>
      <SiteTimeZoneProvider timeZone={settings?.timezone ?? "UTC"}>
        {children}
      </SiteTimeZoneProvider>
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
