import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { HeaderConfig } from "@/lib/layout/types";

/**
 * Default header config matching HEADER_DEFAULTS from the admin backend.
 * Used as fallback when no settings are stored or still loading.
 */
const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  layout: { style: "standard", sticky: "always", background: "solid", height: "normal", bottomBorder: "subtle" },
  topBar: { enabled: false, leftContent: "contact", rightContent: "social", email: "", phone: "", announcementText: "" },
  logo: { enabled: true, showImage: true, showTitle: true, showTagline: false, size: "medium" },
  navigation: { enabled: true, menuSource: "primary", customLocation: "header", style: "inline", dropdownStyle: "flyout" },
  search: { enabled: true, variant: "inline", placeholder: "Search..." },
  cta: { enabled: false, label: "Get Started", url: "/register", style: "filled" },
  userMenu: { enabled: true, guestDisplay: "login-register", loggedInDisplay: "avatar-dropdown", dropdownPreset: "dashboard-profile-logout" },
  darkModeToggle: { enabled: true, variant: "icon" },
  mobileMenu: { variant: "drawer", drawerSide: "right" },
};

/**
 * Fetch header configuration from the admin settings system.
 * Reactive: updates in real-time when admin changes header settings.
 *
 * Returns sensible defaults while loading or if no config is stored.
 */
export function useHeaderConfig(): HeaderConfig {
  const publicSettings = useQuery(api.settings.queries.getPublic);

  if (!publicSettings?.headerConfig) {
    return DEFAULT_HEADER_CONFIG;
  }

  const raw = publicSettings.headerConfig as Record<string, unknown>;

  // Deep merge with defaults so any missing nested fields fall back gracefully
  return {
    layout: { ...DEFAULT_HEADER_CONFIG.layout, ...(raw.layout as object) },
    topBar: { ...DEFAULT_HEADER_CONFIG.topBar, ...(raw.topBar as object) },
    logo: { ...DEFAULT_HEADER_CONFIG.logo, ...(raw.logo as object) },
    navigation: { ...DEFAULT_HEADER_CONFIG.navigation, ...(raw.navigation as object) },
    search: { ...DEFAULT_HEADER_CONFIG.search, ...(raw.search as object) },
    cta: { ...DEFAULT_HEADER_CONFIG.cta, ...(raw.cta as object) },
    userMenu: { ...DEFAULT_HEADER_CONFIG.userMenu, ...(raw.userMenu as object) },
    darkModeToggle: { ...DEFAULT_HEADER_CONFIG.darkModeToggle, ...(raw.darkModeToggle as object) },
    mobileMenu: { ...DEFAULT_HEADER_CONFIG.mobileMenu, ...(raw.mobileMenu as object) },
  } as HeaderConfig;
}
