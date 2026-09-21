/**
 * Error Template - Admin
 *
 * Displayed when a runtime error occurs in the admin panel.
 * Used as the defaultErrorComponent in TanStack Router.
 */

import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useControlShell } from "@/control/ControlShellContext";
import { StandaloneFrame } from "@/control/components/StandaloneFrame";

interface ErrorTemplateProps {
  error: Error;
  reset?: () => void;
}

export function ErrorTemplate({ error, reset }: ErrorTemplateProps) {
  const router = useRouter();
  const shell = useControlShell();
  const isDev = import.meta.env.DEV;
  const backendMismatch = shell !== null
    && /\[CONVEX [QMA]\([^)]+\)\]/.test(error.message)
    && /Could not find public function for '[^']+'/.test(error.message);
  // Production Convex errors omit the backend's diagnostic message. Identify
  // the failed self-access query without guessing whether it is a version,
  // connection or authorization problem, and retain operator recovery.
  const accessUnavailable = shell !== null
    && /\[CONVEX Q\(users:(?:getCurrentRoleAccess|getCurrentUser)\)\]/.test(error.message);

  const handleRetry = () => {
    if (reset) {
      reset();
    } else {
      router.invalidate();
    }
  };

  const content = (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center px-4">
      {/* Error Icon */}
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      </div>

      {/* Heading and Message */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          {backendMismatch ? "This environment needs an update" : accessUnavailable ? "Unable to verify access to this environment" : "Something went wrong"}
        </h1>
        <p className="text-sm text-muted-foreground max-w-md">
          {backendMismatch
            ? "This desktop app needs a newer backend for the selected environment. Update that environment, then try again. Your operator session is still available."
            : accessUnavailable
            ? "Open Sites to check this environment's connection and backend version, then try again. Your operator session is still available."
            : "We encountered an unexpected error. Please try again, or return to the dashboard."}
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
        {shell ? <Button onClick={() => shell.openSites()}><Home className="size-4" data-icon="inline-start" />Open Sites</Button> : <Link to="/">
          <Button>
            <Home className="size-4" data-icon="inline-start" />
            Dashboard
          </Button>
        </Link>}
      </div>
    </div>
  );
  // Site authorization and route errors must not remove control-plane recovery
  // controls. This frame uses the operator context and grants no site access.
  return shell ? <StandaloneFrame>{content}</StandaloneFrame> : content;
}
