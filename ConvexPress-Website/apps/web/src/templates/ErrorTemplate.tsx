/**
 * Error Template
 *
 * Displayed when a runtime error occurs.
 * Used as the defaultErrorComponent in TanStack Router.
 */

import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

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
    <div
      className="mx-auto flex min-h-[50vh] w-full flex-col items-center justify-center text-center"
      style={{ maxWidth: "var(--sh-layout-content, 720px)" }}
    >
      {/* Error Icon */}
      <div
        className="mb-6 flex size-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--sh-color-destructive-bg, #fef2f2)" }}
      >
        <AlertTriangle
          className="size-8"
          style={{ color: "var(--sh-color-destructive, #dc2626)" }}
          aria-hidden="true"
        />
      </div>

      {/* Heading */}
      <h1
        className="text-2xl font-bold"
        style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
      >
        Something went wrong
      </h1>

      {/* User-friendly message */}
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        We encountered an unexpected error. Please try again, or return to the
        home page.
      </p>

      {/* Error details in development */}
      {isDev && (
        <details className="mt-4 w-full max-w-lg text-left">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Error details (development only)
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs text-destructive">
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
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--sh-color-button-bg, #1e40af)",
            color: "var(--sh-color-button-text, #ffffff)",
            borderRadius: "var(--sh-button-radius, 0.375rem)",
          }}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Try Again
        </button>
        <a
          href="/"
          className="inline-flex items-center gap-2 border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          style={{
            borderColor: "var(--sh-color-border, #e5e7eb)",
            borderRadius: "var(--sh-button-radius, 0.375rem)",
          }}
        >
          <Home className="size-4" aria-hidden="true" />
          Go Home
        </a>
      </div>
    </div>
  );
}
