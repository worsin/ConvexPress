import { useSettings } from "@/contexts/SettingsContext";
import type { FooterConfig } from "@/lib/layout/types";

/**
 * Default footer config matching FOOTER_DEFAULTS from the admin backend.
 * Used as fallback when no settings are stored or still loading.
 */
const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  rows: [],
  layout: { columns: "4", background: "dark", backgroundImageId: null, topBorder: "subtle", padding: "normal" },
  branding: { enabled: true, showLogo: true, showDescription: true, description: "", showSocial: true },
  navColumns: { enabled: true, columns: [{ heading: "Company", menuSource: "footer-1" }, { heading: "Resources", menuSource: "footer-2" }] },
  newsletter: { enabled: true, heading: "Stay Updated", subtext: "Get the latest posts delivered to your inbox.", buttonText: "Subscribe" },
  contactInfo: { enabled: false, address: "", phone: "", email: "" },
  bottomBar: { enabled: true, copyrightText: "", legalLinks: "privacy-terms", poweredBy: true },
};

/**
 * Fetch footer configuration from the admin settings system.
 * Reactive: updates in real-time when admin changes footer settings.
 *
 * Returns sensible defaults while loading or if no config is stored.
 */
export function useFooterConfig(): FooterConfig {
  const publicSettings = useSettings();

  if (!publicSettings?.footerConfig) {
    return DEFAULT_FOOTER_CONFIG;
  }

  const raw = publicSettings.footerConfig as Record<string, unknown>;

  // Deep merge with defaults so any missing nested fields fall back gracefully
  return {
    rows: Array.isArray(raw.rows) ? (raw.rows as FooterConfig["rows"]) : DEFAULT_FOOTER_CONFIG.rows,
    layout: { ...DEFAULT_FOOTER_CONFIG.layout, ...(raw.layout as object) },
    branding: { ...DEFAULT_FOOTER_CONFIG.branding, ...(raw.branding as object) },
    navColumns: {
      ...DEFAULT_FOOTER_CONFIG.navColumns,
      ...(raw.navColumns as object),
      // Ensure columns array falls back to default if not present
      columns: (raw.navColumns as Record<string, unknown>)?.columns
        ? ((raw.navColumns as Record<string, unknown>).columns as FooterConfig["navColumns"]["columns"])
        : DEFAULT_FOOTER_CONFIG.navColumns.columns,
    },
    newsletter: { ...DEFAULT_FOOTER_CONFIG.newsletter, ...(raw.newsletter as object) },
    contactInfo: { ...DEFAULT_FOOTER_CONFIG.contactInfo, ...(raw.contactInfo as object) },
    bottomBar: { ...DEFAULT_FOOTER_CONFIG.bottomBar, ...(raw.bottomBar as object) },
  } as FooterConfig;
}
