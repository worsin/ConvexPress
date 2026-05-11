/**
 * Routing Context - Website Frontend
 *
 * React context provider that exposes URL generation functions to all
 * website components via the useRouting() hook.
 *
 * Reads permalink settings from the SettingsContext and provides
 * typed URL generator functions for posts, pages, categories, tags,
 * and authors. All URL generation functions are based on the current
 * permalink structure, so URLs update reactively if settings change.
 *
 * Usage:
 *   // In a layout or root component:
 *   import { RoutingProvider } from "@/contexts/RoutingContext";
 *
 *   <RoutingProvider>
 *     {children}
 *   </RoutingProvider>
 *
 *   // In any child component:
 *   import { useRouting } from "@/contexts/RoutingContext";
 *
 *   const { postUrl, pageUrl, categoryUrl, tagUrl, authorUrl } = useRouting();
 *   const url = postUrl(post);
 */

import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";

import { useSettings } from "@/contexts/SettingsContext";
import {
  generatePostUrl,
  generatePageUrl,
  generateCategoryUrl,
  generateTagUrl,
  generateAuthorUrl,
  type PermalinkSettings,
  type PostForUrl,
  type PageForUrl,
  type CategoryForUrl,
  type TagForUrl,
  type AuthorForUrl,
} from "@/lib/url-generator";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoutingContextValue {
  /** Generate a URL for a post based on current permalink settings. */
  postUrl: (post: PostForUrl) => string;
  /** Generate a URL for a page (always /{slug}/). */
  pageUrl: (page: PageForUrl) => string;
  /** Generate a URL for a category archive. */
  categoryUrl: (category: CategoryForUrl) => string;
  /** Generate a URL for a tag archive. */
  tagUrl: (tag: TagForUrl) => string;
  /** Generate a URL for an author archive. */
  authorUrl: (author: AuthorForUrl) => string;
  /** Current permalink settings (resolved from Convex). */
  permalinkSettings: PermalinkSettings;
  /** Whether permalink settings are loaded. */
  isReady: boolean;
}

// ─── Default Permalink Settings ─────────────────────────────────────────────

const DEFAULT_SETTINGS: PermalinkSettings = {
  structure: "post_name",
  categoryBase: "category",
  tagBase: "tag",
};

// ─── Context ────────────────────────────────────────────────────────────────

const RoutingContext = createContext<RoutingContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

interface RoutingProviderProps {
  children: ReactNode;
}

/**
 * Wraps children with the routing context.
 * Reads permalink settings from the SettingsContext (Convex reactive query)
 * and provides URL generation functions.
 *
 * Place this inside SettingsProvider in the component tree.
 */
export function RoutingProvider({ children }: RoutingProviderProps) {
  const settings = useSettings();

  // Resolve permalink settings from the public settings object
  const permalinkSettings: PermalinkSettings = useMemo(() => {
    if (!settings) return DEFAULT_SETTINGS;

    return {
      structure: (settings.permalinkStructure as PermalinkSettings["structure"]) || "post_name",
      categoryBase: (settings.categoryBase as string) || "category",
      tagBase: (settings.tagBase as string) || "tag",
    };
  }, [settings]);

  const isReady = settings !== null;

  // ─── URL Generator Functions ──────────────────────────────────────────

  const postUrl = useCallback(
    (post: PostForUrl) => generatePostUrl(post, permalinkSettings),
    [permalinkSettings],
  );

  const pageUrl = useCallback(
    (page: PageForUrl) => generatePageUrl(page),
    [],
  );

  const categoryUrl = useCallback(
    (category: CategoryForUrl) => generateCategoryUrl(category, permalinkSettings),
    [permalinkSettings],
  );

  const tagUrl = useCallback(
    (tag: TagForUrl) => generateTagUrl(tag, permalinkSettings),
    [permalinkSettings],
  );

  const authorUrl = useCallback(
    (author: AuthorForUrl) => generateAuthorUrl(author),
    [],
  );

  // ─── Context Value ────────────────────────────────────────────────────

  const value: RoutingContextValue = useMemo(
    () => ({
      postUrl,
      pageUrl,
      categoryUrl,
      tagUrl,
      authorUrl,
      permalinkSettings,
      isReady,
    }),
    [postUrl, pageUrl, categoryUrl, tagUrl, authorUrl, permalinkSettings, isReady],
  );

  return (
    <RoutingContext value={value}>
      {children}
    </RoutingContext>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the routing context from any component within the RoutingProvider.
 *
 * Returns URL generation functions that respect the current permalink settings.
 *
 * @throws Error if used outside RoutingProvider
 */
export function useRouting(): RoutingContextValue {
  const context = useContext(RoutingContext);
  if (!context) {
    throw new Error("useRouting must be used within a RoutingProvider");
  }
  return context;
}
