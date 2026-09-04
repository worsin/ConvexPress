/**
 * Mobile navigation drawer (Base UI Dialog). Slides in from the left with
 * the full sidebar nav, topbar links, and profile links stacked.
 */

import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { NavItemLink } from "./NavItemLink";
import { useDashboardShell } from "./DashboardShellContext";

export function MobileDrawer() {
  const { mobileNavOpen, closeMobileNav } = useLayoutShell();
  const { config, sidebarNav, topbarNav, profileNav, badges, to } = useDashboardShell();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Close when the route changes (a link was followed).
  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  const extra = [...(config.layout !== "sidebar" ? topbarNav : []), ...profileNav].filter(
    (item) => item.kind === "link" && !sidebarNav.some((entry) => entry.kind === "link" && entry.href === item.href),
  );

  return (
    <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={(open) => !open && closeMobileNav()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
        <DialogPrimitive.Popup
          data-slot="dashboard-mobile-drawer"
          aria-label="Dashboard navigation"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-sidebar text-sidebar-foreground shadow-2xl outline-hidden md:hidden",
            "data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left duration-200",
          )}
        >
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
            <BrandMark config={config} href={to("")} className="min-w-0 flex-1" />
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className="flex size-8 items-center justify-center text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Dashboard" className="min-h-0 flex-1 overflow-y-auto py-3">
            <ul role="list" className="space-y-0.5 px-2">
              {sidebarNav.map((item) => (
                <NavItemLink key={item.id} item={item} badges={badges} onNavigate={closeMobileNav} />
              ))}
              {extra.length > 0 && <li role="separator" aria-hidden="true" className="my-2 h-px bg-sidebar-border" />}
              {extra.map((item) => (
                <NavItemLink key={item.id} item={item} badges={badges} onNavigate={closeMobileNav} />
              ))}
            </ul>
          </nav>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
