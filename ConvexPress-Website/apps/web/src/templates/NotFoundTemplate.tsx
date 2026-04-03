/**
 * Not Found (404) Template
 *
 * Displayed when a page is not found.
 */

import type { ReactNode } from "react";

export interface NotFoundTemplateProps {
  children?: ReactNode;
  // Props from TanStack Router's NotFoundRouteProps
  data?: unknown;
  isNotFound?: boolean;
  routeId?: string;
}

export function NotFoundTemplate({ children }: NotFoundTemplateProps) {
  return (
    <div
      className="mx-auto flex min-h-[50vh] w-full flex-col items-center justify-center text-center"
      style={{ maxWidth: "var(--sh-layout-content, 720px)" }}
    >
      {children ?? (
        <>
          <h1
            className="text-6xl font-bold"
            style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
          >
            404
          </h1>
          <p className="mt-4 text-xl text-muted-foreground">
            The page you are looking for could not be found.
          </p>
          <a
            href="/"
            className="mt-8 inline-flex items-center px-6 py-3 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--sh-color-button-bg, #1e40af)",
              color: "var(--sh-color-button-text, #ffffff)",
              borderRadius: "var(--sh-button-radius, 0.375rem)",
            }}
          >
            Return Home
          </a>
        </>
      )}
    </div>
  );
}
