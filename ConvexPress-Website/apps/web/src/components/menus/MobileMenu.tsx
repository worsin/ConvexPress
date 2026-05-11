import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import type { ResolvedMenu } from "@/lib/layout/types";

import { MobileMenuItem } from "./MobileMenuItem";

interface MobileMenuProps {
  /** Whether the mobile menu overlay is open */
  isOpen: boolean;
  /** Close the mobile menu */
  onClose: () => void;
  /** Menu location slug to display (defaults to "mobile", falls back to "header") */
  location?: string;
  /** Site name to display in the header */
  siteName?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Mobile navigation overlay. Slides in from the left with a backdrop.
 * Falls back from "mobile" menu location to "header" if mobile location is unset.
 *
 * Features:
 * - Slide-in panel with backdrop
 * - Escape key to close
 * - Body scroll lock when open
 * - Auto-close on route change (handled by parent)
 * - Accordion submenus for nested items
 */
export function MobileMenu({
  isOpen,
  onClose,
  location = "mobile",
  siteName = "Menu",
  className,
}: MobileMenuProps) {
  const mobileMenu = useMenuForLocation(location);
  const headerMenu = useMenuForLocation("header");

  // Fall back to header menu if mobile location is unset
  const menu: ResolvedMenu | undefined = mobileMenu ?? headerMenu;

  // Close on Escape
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const visibleItems = menu?.items.filter((item) => !item.isOrphaned) ?? [];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          data-slot="mobile-menu-backdrop"
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        data-slot="mobile-menu"
        role="dialog"
        aria-modal={isOpen}
        aria-label="Navigation menu"
        aria-hidden={!isOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-background shadow-lg transition-transform duration-300 lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
          className,
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold text-foreground">
            {siteName}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close navigation menu"
          >
            <X className="size-5" aria-hidden="true" />
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
                <MobileMenuItem
                  key={item.id}
                  item={item}
                  depth={0}
                  onNavigate={onClose}
                />
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                No menu assigned to this location.
              </p>
            </div>
          )}
        </nav>
      </div>
    </>
  );
}
