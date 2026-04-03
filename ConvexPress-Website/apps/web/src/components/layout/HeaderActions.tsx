import { Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";

import { UserMenu } from "./UserMenu";
import { WebsiteNotificationBell } from "./WebsiteNotificationBell";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderActionsProps {
  className?: string;
}

/**
 * Right-side header actions: search toggle button and user menu (or login link).
 */
export function HeaderActions({ className }: HeaderActionsProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const { toggleSearch } = useLayoutShell();

  return (
    <div
      data-slot="header-actions"
      className={cn("flex items-center gap-2", className)}
    >
      {/* Search toggle */}
      <button
        type="button"
        onClick={toggleSearch}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Toggle search"
      >
        <Search className="size-4" aria-hidden="true" />
      </button>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* User menu or login link */}
      {isLoaded && (
        <>
          {isSignedIn ? (
            <>
              <WebsiteNotificationBell />
              <UserMenu />
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sign In
            </Link>
          )}
        </>
      )}
    </div>
  );
}
