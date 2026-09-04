/**
 * Depot · system.error — the runtime error screen as a card on a muted band.
 * Retry calls `reset` when the boundary supplied one, otherwise invalidates
 * the router (same as Core); error details show in development only.
 */
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

import type { ErrorSurfaceData } from "@/templates/packs/core/surfaces/system.error";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Label, buttonClasses } from "../parts";
import { SystemFrame } from "../parts/extra-commerce";

export default function DepotSystemError({ data }: SurfaceProps<ErrorSurfaceData>) {
  const { error, reset } = data;
  const router = useRouter();
  const isDev = import.meta.env.DEV;

  const retry = () => {
    if (reset) reset();
    else void router.invalidate();
  };

  return (
    <SystemFrame slot="error-page">
      <div className="flex size-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Error</Label>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
        <p className="text-[13px] leading-5 text-muted-foreground">We encountered an unexpected error. Please try again, or return to the home page.</p>
      </div>
      {isDev && (
        <details className="w-full text-left">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Error details (development only)</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-destructive">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : null}
          </pre>
        </details>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={retry}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <a href="/" className={buttonClasses("secondary")}>
          <Home className="size-4" aria-hidden="true" />
          Go home
        </a>
      </div>
    </SystemFrame>
  );
}
