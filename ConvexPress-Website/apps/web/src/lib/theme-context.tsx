/**
 * Theme Context & Provider
 *
 * Provides active theme data and global styles to all website components.
 * Wraps the root layout so every component can access theme configuration.
 *
 * Usage:
 *   const { theme, globalStyles } = useTheme();
 *   // theme = active theme document or null
 *   // globalStyles = compiled CSS, settings, styles, google font URLs
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

// ─── Typed Interfaces ────────────────────────────────────────────────────────
// These mirror the backend types from ConvexPress-Admin/packages/backend/convex/themes/types.ts
// Duplicated here to avoid cross-app import dependency.

interface ColorPaletteItem {
  slug: string;
  name: string;
  color: string;
}

interface GradientItem {
  slug: string;
  name: string;
  gradient: string;
}

interface FontFamilyItem {
  slug: string;
  name: string;
  fontFamily: string;
  provider?: string;
  googleFontUrl?: string;
}

interface FontSizeItem {
  slug: string;
  name: string;
  size: string;
}

interface SpacingSizeItem {
  slug: string;
  name: string;
  size: string;
}

export interface GlobalStylesSettings {
  color: {
    palette: ColorPaletteItem[];
    gradients?: GradientItem[];
    defaultPalette: boolean;
    background: boolean;
    text: boolean;
    link: boolean;
  };
  typography: {
    fontFamilies: FontFamilyItem[];
    fontSizes: FontSizeItem[];
    customFontSize: boolean;
    lineHeight: boolean;
    fontWeight: boolean;
    letterSpacing: boolean;
    textTransform: boolean;
  };
  spacing: {
    padding: boolean;
    margin: boolean;
    blockGap?: string;
    units: string[];
    spacingSizes?: SpacingSizeItem[];
  };
  layout: {
    contentSize: string;
    wideSize: string;
  };
  border?: {
    color: boolean;
    radius: boolean;
    style: boolean;
    width: boolean;
  };
}

export interface GlobalStylesStyles {
  color: {
    background: string;
    text: string;
  };
  typography: {
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
  };
  spacing?: {
    padding?: {
      top?: string;
      right?: string;
      bottom?: string;
      left?: string;
    };
  };
  elements?: {
    link?: {
      color?: { text?: string };
      typography?: { textDecoration?: string };
    };
    heading?: {
      color?: { text?: string };
      typography?: {
        fontFamily?: string;
        fontWeight?: string;
        lineHeight?: string;
      };
    };
    button?: {
      color?: { background?: string; text?: string };
      border?: { radius?: string };
    };
  };
}

export interface ThemeCustomizer {
  siteIdentity?: {
    logoId?: string;
    logoWidth?: number;
    siteIcon?: string;
    displaySiteTitle?: boolean;
    displayTagline?: boolean;
  };
  header?: {
    templatePartSlug?: string;
    sticky?: boolean;
    transparent?: boolean;
  };
  footer?: {
    templatePartSlug?: string;
    copyrightText?: string;
    showPoweredBy?: boolean;
  };
  sidebar?: {
    position?: "left" | "right" | "none";
    width?: string;
  };
  backgroundImage?: {
    imageId?: string;
    position?: string;
    size?: string;
    repeat?: string;
    attachment?: string;
  };
  customCss?: string;
}

export interface TemplateAssignments {
  index: string;
  home?: string;
  frontPage?: string;
  single?: string;
  page?: string;
  archive?: string;
  category?: string;
  tag?: string;
  author?: string;
  search?: string;
  notFound?: string;
}

/** Full theme document shape as returned by the getActive query. */
export interface ThemeDocument {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  description?: string;
  version: string;
  author?: string;
  screenshot?: string;
  isActive: boolean;
  isDefault: boolean;
  supports: Record<string, unknown>;
  globalStyles: {
    settings: GlobalStylesSettings;
    styles: GlobalStylesStyles;
  };
  customizer: ThemeCustomizer;
  templateAssignments: TemplateAssignments;
  createdAt: number;
  createdBy?: string;
  updatedAt: number;
  updatedBy?: string;
}

/** Data shape returned by the getGlobalStyles query. */
export interface GlobalStylesData {
  settings: GlobalStylesSettings;
  styles: GlobalStylesStyles;
  cssProperties: string;
  customCss: string;
  googleFontUrls: string[];
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** The active theme document, or null if loading/no theme */
  theme: ThemeDocument | null;
  /** Compiled global styles data */
  globalStyles: GlobalStylesData | null;
  /** Whether theme data is still loading */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: null,
  globalStyles: null,
  isLoading: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useQuery(api.themes.queries.getActive);
  const globalStyles = useQuery(api.themes.queries.getGlobalStyles);

  const isLoading = theme === undefined || globalStyles === undefined;

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({
      theme: (theme as ThemeDocument) ?? null,
      globalStyles: (globalStyles as GlobalStylesData) ?? null,
      isLoading,
    }),
    [theme, globalStyles, isLoading],
  );

  return (
    <ThemeContext value={contextValue}>
      {children}
    </ThemeContext>
  );
}

/**
 * Hook to access theme data from any website component.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
