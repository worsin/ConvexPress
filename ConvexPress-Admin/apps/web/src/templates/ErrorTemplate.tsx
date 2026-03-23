/**
 * Error Template - Admin
 *
 * Displayed when a runtime error occurs in the admin panel.
 * Used as the defaultErrorComponent in TanStack Router.
 */

import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorTemplateProps {
  error: Error;
  reset?: () => void;
}

export function ErrorTemplate({ error, reset }: ErrorTemplateProps) {
  const router = useRouter();
  const isDev = import.meta.env.DEV;

  const handleRetry = () => {
    if (reset) {
      reset();
    } else {
      router.invalidate();
    }
  };

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center px-4">
      {/* Error Icon */}
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      </div>

      {/* Heading and Message */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground max-w-md">
          We encountered an unexpected error. Please try again, or return to the
          dashboard.
        </p>
      </div>

      {/* Error details in development */}
      {isDev && (
        <details className="w-full max-w-lg text-left">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Error details (development only)
          </summary>
          <pre className="mt-2 overflow-auto rounded border border-border bg-muted p-3 text-xs text-destructive">
            {error.message}
            {error.stack && (
              <>
                {"\n\n"}
                {error.stack}
              </>
            )}
          </pre>
        </details>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleRetry}>
          <RotateCcw className="size-4" data-icon="inline-start" />
          Try Again
        </Button>
        <Link to="/">
          <Button>
            <Home className="size-4" data-icon="inline-start" />
            Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
