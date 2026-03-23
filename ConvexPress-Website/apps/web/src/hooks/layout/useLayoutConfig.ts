import { DEFAULT_LAYOUT_CONFIG } from "@/lib/layout/constants";
import type { LayoutConfig } from "@/lib/layout/types";
import { useTheme } from "@/lib/theme-context";

/** Partial layout config from theme supports/customizer */
type ThemeLayoutConfig = Partial<LayoutConfig>;

/**
 * Derive layout configuration from the active theme.
 * Returns sensible defaults while the theme is loading or if not configured.
 *
 * Data source: Theme System via ThemeContext (api.themes.queries.getActive).
 * The theme document contains layout configuration in its customizer or
 * supports/globalStyles fields.
 */
export function useLayoutConfig(): LayoutConfig {
  const { theme, isLoading } = useTheme();

  if (isLoading || !theme) {
    return DEFAULT_LAYOUT_CONFIG;
  }

  // Extract layout config from theme supports (customizer doesn't include layout in its type)
  const supports = theme.supports as { layout?: ThemeLayoutConfig } | undefined;
  const layout = supports?.layout;

  if (!layout) {
    return DEFAULT_LAYOUT_CONFIG;
  }

  return {
    contentMaxWidth: layout.contentMaxWidth ?? DEFAULT_LAYOUT_CONFIG.contentMaxWidth,
    sidebarPosition: layout.sidebarPosition ?? DEFAULT_LAYOUT_CONFIG.sidebarPosition,
    sidebarWidgetArea: layout.sidebarWidgetArea ?? DEFAULT_LAYOUT_CONFIG.sidebarWidgetArea,
    headerStyle: layout.headerStyle ?? DEFAULT_LAYOUT_CONFIG.headerStyle,
    footerColumns: layout.footerColumns ?? DEFAULT_LAYOUT_CONFIG.footerColumns,
    stickyHeader: layout.stickyHeader ?? DEFAULT_LAYOUT_CONFIG.stickyHeader,
  };
}
