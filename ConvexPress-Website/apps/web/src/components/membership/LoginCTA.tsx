/**
 * LoginCTA
 *
 * Inline call-to-action card shown to logged-out visitors when they hit
 * membership-restricted content. Links to /login and /register with a
 * `returnTo` query param so the user returns to the gated page after auth.
 */
import { Link, useLocation } from "@tanstack/react-router";
import { LogIn } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface LoginCTAProps {
  /** Optional heading override. */
  title?: string;
  /** Optional description override. */
  description?: string;
  className?: string;
}

export function LoginCTA({
  title = "Sign in to continue",
  description = "This content is for members. Sign in to read it.",
  className,
}: LoginCTAProps) {
  const location = useLocation();

  // Build a return path that preserves the current pathname and any hash.
  // Search params from the current location are intentionally omitted here
  // because they are rarely meaningful to replay through auth; keeping just
  // the canonical path avoids edge cases with auth-side search param parsing.
  const nextPath =
    location.pathname + (location.hash ? `#${location.hash}` : "");

  return (
    <div
      data-slot="membership-login-cta"
      className={cn(
        "flex flex-col items-center gap-4 border border-border bg-card p-6 text-center text-card-foreground",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-none bg-muted text-muted-foreground">
        <LogIn className="size-5" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          to="/login"
          search={{ returnTo: nextPath }}
          className={cn(buttonVariants({ variant: "default", size: "default" }))}
        >
          Sign in
        </Link>
        <Link
          to="/register"
          search={{ returnTo: nextPath }}
          className={cn(buttonVariants({ variant: "outline", size: "default" }))}
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
