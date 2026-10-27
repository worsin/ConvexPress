import { useContext } from "react";

import { LayoutShellContext } from "@/components/layout/LayoutShellProvider";
import type {
  LayoutShellActions,
  LayoutShellState,
} from "@/lib/layout/types";

type UseLayoutShellResult = LayoutShellState & LayoutShellActions;

/**
 * Access layout shell context (state + actions).
 * Must be used within a LayoutShellProvider.
 */
export function useLayoutShell(): UseLayoutShellResult {
  const context = useContext(LayoutShellContext);
  if (!context) {
    throw new Error(
      "useLayoutShell must be used within a LayoutShellProvider",
    );
  }
  return context;
}

/** The id of the site's mobile navigation drawer (components/layout/MobileNav.tsx). */
export const MOBILE_NAV_ID = "site-mobile-nav";

/**
 * Props for a header's menu button: it opens the mobile navigation dialog and
 * says whether it is open, so assistive technology announces "collapsed" or
 * "expanded" and can reach the drawer it controls.
 */
export function useMobileNavTrigger() {
  const { mobileNavOpen, toggleMobileNav } = useLayoutShell();
  return {
    onClick: toggleMobileNav,
    "aria-expanded": mobileNavOpen,
    "aria-haspopup": "dialog",
    "aria-controls": MOBILE_NAV_ID,
  } as const;
}
