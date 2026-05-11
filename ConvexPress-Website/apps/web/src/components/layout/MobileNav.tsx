import { Link, useRouterState } from "@tanstack/react-router";
import { useUser, useClerk, useAuth } from "@clerk/clerk-react";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import type { ResolvedMenu, SiteIdentity } from "@/lib/layout/types";

import { MobileNavItem } from "./MobileNavItem";
import { SiteBrand } from "./SiteBrand";

/**
 * Focusable selector for focus trap.
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MobileNavProps {
  menu: ResolvedMenu | undefined;
  siteIdentity: SiteIdentity | undefined;
}

/**
 * Mobile navigation overlay. Slides in from the left with a backdrop.
 * Visible only on viewports smaller than lg.
 * Includes focus trap for WCAG 2.1 AA compliance.
 */
export function MobileNav({ menu, siteIdentity }: MobileNavProps) {
  const { mobileNavOpen, closeMobileNav } = useLayoutShell();
  const { user } = useUser();
  const { isLoaded } = useAuth();
  const { signOut } = useClerk();
  const routerState = useRouterState();
  const prevPathRef = React.useRef(routerState.location.pathname);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  // Close on route change
  React.useEffect(() => {
    if (routerState.location.pathname !== prevPathRef.current) {
      closeMobileNav();
      prevPathRef.current = routerState.location.pathname;
    }
  }, [routerState.location.pathname, closeMobileNav]);

  // Close on Escape
  React.useEffect(() => {
    if (!mobileNavOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMobileNav();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen, closeMobileNav]);

  // Prevent body scroll when open
  React.useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  // Focus trap: trap Tab key within the mobile nav panel
  React.useEffect(() => {
    if (!mobileNavOpen || !panelRef.current) return;

    // Move focus to the close button when the panel opens
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      if (focusableElements.length === 0) return;

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  const visibleItems = menu?.items.filter((item) => !item.isOrphaned) ?? [];

  return (
    <>
      {/* Backdrop */}
      {mobileNavOpen && (
        <div
          data-slot="mobile-nav-backdrop"
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={closeMobileNav}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        ref={panelRef}
        data-slot="mobile-nav"
        role="dialog"
        aria-modal={mobileNavOpen}
        aria-label="Navigation menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-background shadow-lg transition-transform duration-300 lg:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <SiteBrand siteIdentity={siteIdentity} />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeMobileNav}
            className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close navigation menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Navigation items */}
        <nav
          aria-label="Mobile navigation"
          className="flex-1 overflow-y-auto"
        >
          {visibleItems.length > 0 ? (
            <ul role="list" className="py-2">
              {visibleItems.map((item) => (
                <MobileNavItem
                  key={item.id}
                  item={item}
                  depth={0}
                  onNavigate={closeMobileNav}
                />
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6">
              <Link
                to="/"
                onClick={closeMobileNav}
                className="block py-3 text-xs text-foreground hover:text-foreground/80"
              >
                Home
              </Link>
            </div>
          )}
        </nav>

        {/* User actions at bottom */}
        <div className="border-t border-border p-4">
          {isLoaded && (
            <>
              {user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {user.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt=""
                        className="size-8 rounded-none object-cover"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center bg-muted text-xs font-medium text-muted-foreground">
                        {(user.firstName?.charAt(0) || "").toUpperCase()}
                        {(user.lastName?.charAt(0) || "").toUpperCase() || "U"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {[user.firstName, user.lastName]
                          .filter(Boolean)
                          .join(" ") || "User"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.primaryEmailAddress?.emailAddress}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to="/dashboard"
                      onClick={closeMobileNav}
                      className="flex-1 border border-border bg-background px-2 py-1.5 text-center text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      Dashboard
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileNav();
                        signOut();
                      }}
                      className="flex-1 border border-border bg-background px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      Log Out
                    </button>
                  </div>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={closeMobileNav}
                  className="block w-full border border-border bg-background px-3 py-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Sign In
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
