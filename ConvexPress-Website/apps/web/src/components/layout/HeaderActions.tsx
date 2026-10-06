import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { LogIn, ShoppingCart, UserPlus } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { HeaderSearchTrigger } from "./HeaderSearch";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { useSettings } from "@/contexts/SettingsContext";
import type { HeaderConfig } from "@/lib/layout/types";
import CoreCartDrawer from "@/templates/packs/core/surfaces/chrome.cartDrawer";
import { Surface } from "@/templates/sdk/Surface";

import { UserMenu } from "./UserMenu";
import { WebsiteNotificationBell } from "./WebsiteNotificationBell";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderActionsProps {
  className?: string;
  headerConfig?: HeaderConfig;
}

/**
 * Right-side header actions: search toggle, CTA button, dark mode toggle,
 * and user menu (or login link). Config-driven from admin header settings.
 */
export function HeaderActions({ className, headerConfig }: HeaderActionsProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const [cartOpen, setCartOpen] = useState(false);
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    (api as any).commerce.cart.getMine,
    commerceEnabled && isReady && sessionToken ? { sessionToken } : "skip",
  ) as { itemCount?: number } | null | undefined;

  // Config-driven visibility (defaults to showing everything if no config)
  const showDarkMode = headerConfig?.darkModeToggle?.enabled !== false;
  const showCta = headerConfig?.cta?.enabled === true;
  const showUserMenu = headerConfig?.userMenu?.enabled !== false;
  const guestDisplay = headerConfig?.userMenu?.guestDisplay ?? "login-register";

  return (
    <div
      data-slot="header-actions"
      className={cn("flex shrink-0 items-center gap-2", className)}
    >
      <HeaderSearchTrigger config={headerConfig?.search} />

      {commerceEnabled && (
        <>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Cart${cart?.itemCount ? `, ${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}` : ""}`}
          >
            <ShoppingCart className="size-4" aria-hidden="true" />
            {cart?.itemCount ? (
              <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                {cart.itemCount > 99 ? "99+" : cart.itemCount}
              </span>
            ) : null}
          </button>
          <Surface
            name="chrome.cartDrawer"
            data={{ open: cartOpen, onOpenChange: setCartOpen }}
            fallback={CoreCartDrawer}
          />
        </>
      )}

      {/* CTA button */}
      {showCta && headerConfig?.cta && (
        <CtaButton
          label={headerConfig.cta.label}
          url={headerConfig.cta.url}
          style={headerConfig.cta.style}
        />
      )}

      {/* Theme toggle */}
      {showDarkMode && <ThemeToggle variant={headerConfig?.darkModeToggle?.variant} />}

      {/* User menu or login link */}
      {showUserMenu && isLoaded && (
        <>
          {isSignedIn ? (
            <>
              <WebsiteNotificationBell />
              <UserMenu />
            </>
          ) : (
            guestDisplay !== "hidden" && (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="inline-flex size-8 shrink-0 items-center justify-center border border-border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted sm:h-auto sm:w-auto sm:px-3 sm:py-1.5"
                >
                  <LogIn className="size-4 sm:hidden" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Sign In</span>
                </Link>
                {guestDisplay === "login-register" && (
                  <Link
                    to="/register"
                    className="inline-flex size-8 shrink-0 items-center justify-center bg-foreground text-xs font-medium text-background transition-colors hover:bg-foreground/90 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5"
                  >
                    <UserPlus className="size-4 sm:hidden" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Register</span>
                  </Link>
                )}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

// ─── CTA Button ─────────────────────────────────────────────────────────────

interface CtaButtonProps {
  label: string;
  url: string;
  style: "filled" | "outline" | "ghost";
}

function CtaButton({ label, url, style }: CtaButtonProps) {
  const styleClasses =
    style === "outline"
      ? "border border-border bg-transparent text-foreground hover:bg-muted"
      : style === "ghost"
        ? "bg-transparent text-foreground hover:bg-muted"
        : "bg-foreground text-background hover:bg-foreground/90";

  return (
    <Link
      to={url}
      className={cn(
        "hidden items-center justify-center px-4 py-1.5 text-xs font-medium transition-colors md:inline-flex",
        styleClasses,
      )}
    >
      {label}
    </Link>
  );
}
