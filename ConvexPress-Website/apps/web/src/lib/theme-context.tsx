/**
 * Theme Context & Provider
 *
 * The theme system has been removed. This context now provides static defaults
 * so existing consumers (useSiteIdentity, ThemeStyleInjector, useLayoutConfig)
 * continue to work without breaking changes.
 *
 * Colors and styles come from CSS variables and Tailwind.
 * Site identity settings come from the Settings System.
 */

import { createContext, useContext, type ReactNode } from "react";

// ─── Context ─────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** Theme document is always null since the theme system was removed */
  theme: null;
  /** Global styles are always null since the theme system was removed */
  globalStyles: null;
  /** Never loading since there are no queries */
  isLoading: false;
}

const defaultValue: ThemeContextValue = {
  theme: null,
  globalStyles: null,
  isLoading: false,
};

const ThemeContext = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext value={defaultValue}>
      {children}
    </ThemeContext>
  );
}

/**
 * Hook to access theme data from any website component.
 * Returns null values since the theme system has been removed.
 * Styles are handled by CSS variables and Tailwind.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
