import { useMobileMenuGeometry } from "@/hooks/layout/useMobileMenuGeometry";
import { MenuItemTarget } from "@/components/menus/MenuItemTarget";
/**
 * Journal · chrome.mobileNav — a full-height sheet with the menu set in large
 * display type. Same behaviour as Core: closes on route change and Escape,
 * locks body scroll, traps focus, and offers the account actions at the foot.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { useAuth, useClerk, useUser } from "@/lib/auth/clerk";
import type { ResolvedMenuItem } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import type { MobileNavSurfaceData } from "@/templates/packs/core/surfaces/chrome.mobileNav";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container } from "../parts";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function JournalChromeMobileNav({ data }: SurfaceProps<MobileNavSurfaceData>) {
  const { menu, siteIdentity, config, userMenu, open, onClose } = data;
  const { user } = useUser();
  const { isLoaded } = useAuth();
  const { signOut } = useClerk();
  const { to: dashboardPath } = useDashboardPath();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const prevPath = useRef(pathname);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on route change.
  useEffect(() => {
    if (pathname !== prevPath.current) {
      onClose();
      prevPath.current = pathname;
    }
  }, [pathname, onClose]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Focus trap.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const items = menu?.items.filter((item) => !item.isOrphaned) ?? [];
  const geometry = useMobileMenuGeometry(config, open, "w-80");

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden lg:hidden">
    {open && <div data-slot="mobile-nav-backdrop" className="pointer-events-auto absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />}
    <div
      ref={panelRef}
      data-slot="mobile-nav"
      data-variant={geometry.variant}
      style={geometry.style}
      role="dialog"
      aria-modal={open}
      aria-label="Navigation menu"
      {...(open ? {} : { inert: true })}
      className={cn(
        "absolute flex flex-col bg-background transition-transform duration-300 ease-out motion-reduce:transition-none",
        open && "pointer-events-auto",
        geometry.className,
      )}
    >
      <Container className="flex h-16 shrink-0 items-center justify-between border-b border-border">
        <Link to="/" onClick={onClose} className="font-display text-xl tracking-tight text-foreground no-underline">
          {siteIdentity?.title ?? ""}
        </Link>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="-mr-2 flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close navigation menu"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </Container>

      <nav aria-label="Mobile navigation" className="min-h-0 flex-1 overflow-y-auto">
        <Container className="py-8">
          {items.length > 0 ? (
            <ul role="list" className="flex flex-col divide-y divide-border">
              {items.map((item) => (
                <SheetItem key={item.id} item={item} depth={0} onNavigate={onClose} />
              ))}
            </ul>
          ) : (
            <Link to="/" onClick={onClose} className="block py-4 font-display text-3xl tracking-tight text-foreground">
              Home
            </Link>
          )}
        </Container>
      </nav>

      {userMenu?.enabled !== false && isLoaded && (user || userMenu?.guestDisplay !== "hidden") && <div className="shrink-0 border-t border-border">
        <Container className="flex flex-col gap-4 py-6">
          {isLoaded ? (
            user ? (
              <>
                <div className="flex items-center gap-3">
                  {user.imageUrl ? (
                    <img src={user.imageUrl} alt="" className="size-9 rounded-full object-cover" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {(user.firstName?.charAt(0) || "").toUpperCase()}
                      {(user.lastName?.charAt(0) || "").toUpperCase() || "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "User"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <Link to={dashboardPath() as any} onClick={onClose} className="text-sm tracking-wide text-foreground underline decoration-border underline-offset-[6px] hover:decoration-foreground">
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      signOut();
                    }}
                    className="text-sm tracking-wide text-foreground underline decoration-border underline-offset-[6px] hover:decoration-foreground"
                  >
                    Log out
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-6">
                <Link to="/login" onClick={onClose} className="text-sm tracking-wide text-foreground underline decoration-border underline-offset-[6px] hover:decoration-foreground">
                  Sign in
                </Link>
                {(userMenu?.guestDisplay ?? "login-register") === "login-register" && <Link to="/register" onClick={onClose} className="text-sm tracking-wide text-muted-foreground transition-colors hover:text-foreground">
                  Register
                </Link>}
              </div>
            )
          ) : null}
        </Container>
      </div>}
    </div>
    </div>
  );
}

function SheetItem({ item, depth, onNavigate }: { item: ResolvedMenuItem; depth: number; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (item.isOrphaned) return null;
  const hasChildren = item.children.length > 0;
  const linkProps = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
  const linkClass = cn(
    "block flex-1 py-4 tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    depth === 0 ? "font-display text-3xl" : "text-lg",
    item.cssClasses,
  );

  return (
    <li data-slot="mobile-nav-item" style={depth > 0 ? { paddingLeft: `${depth * 1.25}rem` } : undefined}>
      <div className="flex items-center gap-3">
        <MenuItemTarget item={item} className={linkClass} activeProps={{ className: "text-primary", "aria-current": "page" as const }} onClick={onNavigate} {...linkProps}>
            {item.label}
          </MenuItemTarget>
        {hasChildren && item.type !== "separator" ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label} submenu`}
            aria-expanded={expanded}
          >
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {hasChildren && (expanded || item.type === "separator") ? (
        <ul role="list" className="mb-2 flex flex-col border-t border-border">
          {item.children
            .filter((child) => !child.isOrphaned)
            .map((child) => (
              <SheetItem key={child.id} item={child} depth={depth + 1} onNavigate={onNavigate} />
            ))}
        </ul>
      ) : null}
    </li>
  );
}
