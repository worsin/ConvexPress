import { useEffect, useRef } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

import { SearchForm } from "./SearchForm";

export interface NotFoundPageProps {
  data?: unknown;
  className?: string;
}

/**
 * 404 page content with search suggestion and navigation links.
 *
 * Logs 404 hits to the Convex notFound table for admin review.
 * The logging is fire-and-forget and runs once on mount.
 */
export function NotFoundPage({ className }: NotFoundPageProps) {
  const location = useLocation();
  const logNotFound = useMutation(api.routing.mutations.logNotFound);
  const hasLogged = useRef(false);

  // Log the 404 hit once on mount (fire-and-forget)
  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    const url = location.pathname + (location.search ? `?${location.search}` : "");

    logNotFound({
      url,
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent || undefined : undefined,
    }).catch(() => {
      // Fire-and-forget: silently ignore logging failures
    });
  }, [location.pathname, location.search, logNotFound]);

  return (
    <div
      data-slot="not-found-page"
      className={cn("flex flex-col items-center gap-6 py-16 text-center", className)}
    >
      {/* Error Code */}
      <div className="text-6xl font-bold text-muted-foreground/30">404</div>

      {/* Message */}
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold">Page Not Found</h1>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          The page you are looking for might have been removed, had its name changed,
          or is temporarily unavailable.
        </p>
      </div>

      {/* Search Form */}
      <div className="w-full max-w-md">
        <p className="mb-2 text-xs text-muted-foreground">
          Try searching for what you need:
        </p>
        <SearchForm autoFocus />
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <Link to="/" className={buttonVariants({ variant: "outline", size: "default" })}>
          <Home className="size-3" aria-hidden="true" />
          Go Home
        </Link>
        <Link to="/blog" className={buttonVariants({ variant: "outline", size: "default" })}>
          View Blog
        </Link>
      </div>
    </div>
  );
}
