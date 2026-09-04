/**
 * Depot · chrome.mobileNav — the menu behind the hamburger as a drawer with
 * grouped links. Departments with children become a labelled group; the rest
 * sit under "Browse"; the account block at the bottom matches Core (dashboard
 * / log out, or sign in). Base UI's Dialog supplies the focus trap, scroll
 * lock and Escape handling.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Link, useRouterState } from "@tanstack/react-router";
import { ShoppingCart, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useSettings } from "@/contexts/SettingsContext";
import { useAuth, useClerk, useUser } from "@/lib/auth/clerk";
import type { ResolvedMenuItem, SiteIdentity } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import type { MobileNavSurfaceData } from "@/templates/packs/core/surfaces/chrome.mobileNav";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Label, buttonClasses } from "../parts";

export default function DepotMobileNav({ data }: SurfaceProps<MobileNavSurfaceData>) {
  const { menu, siteIdentity, config, open, onClose } = data;
  const routerState = useRouterState();
  const prevPathRef = useRef(routerState.location.pathname);

  // Close on route change (same as Core).
  useEffect(() => {
    if (routerState.location.pathname !== prevPathRef.current) {
      prevPathRef.current = routerState.location.pathname;
      onClose();
    }
  }, [routerState.location.pathname, onClose]);

  const visibleItems = menu?.items.filter((item) => !item.isOrphaned) ?? [];
  const groups = visibleItems.filter((item) => item.children.length > 0);
  const singles = visibleItems.filter((item) => item.children.length === 0);
  const side = config?.drawerSide ?? "left";
  const fullscreen = config?.variant === "fullscreen";

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-200 data-closed:opacity-0 data-open:opacity-100 lg:hidden" />
        <DialogPrimitive.Popup
          data-slot="mobile-nav"
          aria-label="Navigation menu"
          className={cn(
            "fixed inset-y-0 z-50 flex flex-col bg-background shadow-lg outline-hidden transition-transform duration-300 lg:hidden",
            fullscreen ? "inset-x-0 w-full" : "w-80 max-w-[88vw]",
            !fullscreen && side === "left" && "left-0 data-closed:-translate-x-full",
            !fullscreen && side === "right" && "right-0 data-closed:translate-x-full",
            fullscreen && "data-closed:-translate-y-full",
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <Brand siteIdentity={siteIdentity} onNavigate={onClose} />
            <DialogPrimitive.Close
              className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close navigation menu"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-4 py-3">
            {visibleItems.length === 0 ? (
              <Group label="Browse">
                <NavLink label="Home" url="/" onNavigate={onClose} />
              </Group>
            ) : (
              <div className="flex flex-col gap-4">
                {singles.length > 0 && (
                  <Group label="Browse">
                    {singles.map((item) => (
                      <NavLink key={item.id} label={item.label} url={item.url} target={item.target} rel={item.rel} cssClasses={item.cssClasses} onNavigate={onClose} />
                    ))}
                  </Group>
                )}
                {groups.map((group) => (
                  <Group key={group.id} label={group.label}>
                    <NavLink label={`All ${group.label}`} url={group.url} target={group.target} rel={group.rel} cssClasses={group.cssClasses} onNavigate={onClose} strong />
                    {flatten(group.children).map(({ item, depth }) => (
                      <NavLink key={item.id} label={item.label} url={item.url} target={item.target} rel={item.rel} cssClasses={item.cssClasses} depth={depth} onNavigate={onClose} />
                    ))}
                  </Group>
                ))}
              </div>
            )}
          </nav>

          <AccountBlock onNavigate={onClose} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function flatten(items: ResolvedMenuItem[], depth = 0): Array<{ item: ResolvedMenuItem; depth: number }> {
  const out: Array<{ item: ResolvedMenuItem; depth: number }> = [];
  for (const item of items) {
    if (item.isOrphaned) continue;
    out.push({ item, depth });
    if (item.children.length > 0) out.push(...flatten(item.children, depth + 1));
  }
  return out;
}

function Brand({ siteIdentity, onNavigate }: { siteIdentity: SiteIdentity | undefined; onNavigate: () => void }) {
  if (!siteIdentity) return <div className="h-5 w-24 animate-pulse rounded-md bg-muted" aria-hidden="true" />;
  const showLogo = !!siteIdentity.logoUrl;
  const showTitle = !showLogo || siteIdentity.showTitleWithLogo !== false;
  return (
    <Link to="/" onClick={onNavigate} className="flex items-center gap-2 text-foreground no-underline">
      {showLogo && <img src={siteIdentity.logoUrl} alt={siteIdentity.logoAlt || siteIdentity.title} className="h-8 w-auto" width={32} height={32} />}
      {showTitle && <span className="text-base font-bold tracking-tight">{siteIdentity.title}</span>}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label as="p" className="px-2">
        {label}
      </Label>
      <ul role="list" className="flex flex-col rounded-md border border-border bg-card">
        {children}
      </ul>
    </div>
  );
}

function NavLink({
  label,
  url,
  target,
  rel,
  cssClasses,
  depth = 0,
  strong = false,
  onNavigate,
}: {
  label: string;
  url: string;
  target?: string;
  rel?: string;
  cssClasses?: string;
  depth?: number;
  strong?: boolean;
  onNavigate: () => void;
}) {
  const className = cn(
    "flex min-h-10 items-center border-b border-border px-3 py-2 text-[13px] text-foreground transition-colors last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    strong && "font-semibold",
    cssClasses,
  );
  const style = depth > 0 ? { paddingLeft: `${12 + depth * 14}px` } : undefined;
  const linkProps = { ...(target ? { target } : {}), ...(rel ? { rel } : {}) };
  const external = url.startsWith("http://") || url.startsWith("https://");
  return (
    <li>
      {external ? (
        <a href={url} className={className} style={style} onClick={onNavigate} {...linkProps}>
          {label}
        </a>
      ) : (
        <Link to={url} className={className} style={style} onClick={onNavigate} activeProps={{ className: "bg-muted font-semibold", "aria-current": "page" as const }} {...linkProps}>
          {label}
        </Link>
      )}
    </li>
  );
}

function AccountBlock({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useUser();
  const { isLoaded } = useAuth();
  const { signOut } = useClerk();
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;

  return (
    <div className="flex flex-col gap-2 border-t border-border p-4">
      {commerceEnabled && (
        <Link to="/cart" onClick={onNavigate} className={buttonClasses("secondary", "md", "w-full")}>
          <ShoppingCart className="size-4" aria-hidden="true" />
          Cart
        </Link>
      )}
      {isLoaded &&
        (user ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {user.imageUrl ? (
                <img src={user.imageUrl} alt="" className="size-8 rounded-md object-cover" />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  {(user.firstName?.charAt(0) || "").toUpperCase()}
                  {(user.lastName?.charAt(0) || "").toUpperCase() || "U"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-foreground">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/dashboard" onClick={onNavigate} className={buttonClasses("secondary", "sm")}>
                Dashboard
              </Link>
              <button
                type="button"
                onClick={() => {
                  onNavigate();
                  signOut();
                }}
                className={buttonClasses("secondary", "sm")}
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <Link to="/login" onClick={onNavigate} className={buttonClasses("primary", "md", "w-full")}>
            Sign in
          </Link>
        ))}
    </div>
  );
}
