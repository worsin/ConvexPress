import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";
import { LogIn, UserPlus } from "lucide-react";
import { lazy, Suspense } from "react";

import { cn } from "@/lib/utils";
import { HeaderSearchTrigger } from "./HeaderSearch";
import { useSettings } from "@/contexts/SettingsContext";
import { siteSignUpPath } from "@/lib/auth/signUpPath";
import type { HeaderConfig } from "@/lib/layout/types";

import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeToggle";
import { isPublicPluginEnabled } from "@/lib/plugins/public";

// The cart is the storefront's: its code loads only where the storefront is on.
const HeaderCart = lazy(() => import("./HeaderCart"));
// Notifications are for signed-in members: visitors never download them.
const WebsiteNotificationBell = lazy(async () => ({ default: (await import("./WebsiteNotificationBell")).WebsiteNotificationBell }));

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
  const settings = useSettings();
  // The cart belongs to the storefront; a subscription-only site has none.
  const commerceEnabled = isPublicPluginEnabled("commerceStorefront", settings);

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
        // Holds the button's place while the cart's code loads.
        <Suspense fallback={<span className="size-8" aria-hidden="true" />}>
          <HeaderCart />
        </Suspense>
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
      {showDarkMode && <ThemeToggle customize="header.darkModeToggle.variant" variant={headerConfig?.darkModeToggle?.variant} />}

      {/* User menu or login link */}
      {showUserMenu && isLoaded && (
        <>
          {isSignedIn ? (
            <>
              <Suspense fallback={<span className="size-8" aria-hidden="true" />}>
                <WebsiteNotificationBell />
              </Suspense>
              <UserMenu />
            </>
          ) : (
            guestDisplay !== "hidden" && (
              <div className="flex items-center gap-2">
                <Link
                  data-customize="header.userMenu.guestDisplay" to="/login"
                  className="inline-flex size-8 shrink-0 items-center justify-center border border-border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted sm:h-auto sm:w-auto sm:px-3 sm:py-1.5"
                >
                  <LogIn className="size-4 sm:hidden" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Sign In</span>
                </Link>
                {guestDisplay === "login-register" && (
                  <Link
                    data-customize="header.userMenu.guestDisplay" to={siteSignUpPath(settings?.signUpPath)}
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
      data-customize="header.cta.label" to={url}
      className={cn(
        "hidden items-center justify-center px-4 py-1.5 text-xs font-medium transition-colors md:inline-flex",
        styleClasses,
      )}
    >
      {label}
    </Link>
  );
}
