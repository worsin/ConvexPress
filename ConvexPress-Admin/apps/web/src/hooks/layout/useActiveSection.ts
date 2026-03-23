import { useRouterState } from "@tanstack/react-router";
import { ADMIN_NAV_SECTIONS } from "@/lib/admin-shell/nav-config";

/**
 * Determine which sidebar section contains the current route.
 * Returns the section ID or null if no match.
 */
export function useActiveSection(): string | null {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  for (const section of ADMIN_NAV_SECTIONS) {
    // Check children first for more specific matches
    if (section.children) {
      for (const child of section.children) {
        if (child.exact) {
          if (pathname === child.to) return section.id;
        } else {
          if (pathname.startsWith(child.to)) return section.id;
        }
      }
    }

    // Check section route itself
    if (pathname === section.to || pathname.startsWith(section.to + "/")) {
      return section.id;
    }
  }

  return null;
}
