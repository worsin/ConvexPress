/**
 * Page Overrides Context
 *
 * Allows child route components (blog posts, pages) to communicate
 * per-content layout overrides to the parent marketing layout.
 *
 * Used for:
 * - hideHeader: Post/page configured in admin to hide the site header
 * - hideFooter: Post/page configured in admin to hide the site footer
 * - layoutId: Per-content layout override (for future use)
 *
 * Usage in a child route (e.g., blog/$slug.tsx):
 *   const { setOverrides } = usePageOverrides();
 *   useEffect(() => {
 *     setOverrides({ hideHeader: post.hideHeader, hideFooter: post.hideFooter });
 *     return () => setOverrides({});
 *   }, [post]);
 *
 * Usage in the parent layout (_marketing.tsx):
 *   const { overrides } = usePageOverrides();
 *   {!overrides.hideHeader && <SiteHeader />}
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface PageOverrides {
  hideHeader?: boolean;
  hideFooter?: boolean;
  layoutId?: string;
}

interface PageOverridesContextValue {
  overrides: PageOverrides;
  setOverrides: (overrides: PageOverrides) => void;
}

const PageOverridesContext = createContext<PageOverridesContextValue>({
  overrides: {},
  setOverrides: () => {},
});

export function PageOverridesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverridesState] = useState<PageOverrides>({});

  const setOverrides = useCallback((next: PageOverrides) => {
    setOverridesState(next);
  }, []);

  return (
    <PageOverridesContext value={{ overrides, setOverrides }}>
      {children}
    </PageOverridesContext>
  );
}

export function usePageOverrides(): PageOverridesContextValue {
  return useContext(PageOverridesContext);
}
