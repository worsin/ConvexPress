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

import type { ReactNode } from "react";
import { convexQuery } from "@convex-dev/react-query";

import { rememberSiteName } from "@/lib/seo/head";
import { useQuery } from "@tanstack/react-query";
import { api } from "@convexpress-website/backend/generated/api";

import { SettingsContext } from "./SettingsValue";

export { useSetting, useSettings, type PublicSettings } from "./SettingsValue";

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
