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
      data-slot="not-found-page"
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
            className="mt-8 inline-flex items-center bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Return Home
          </a>
        </>
      )}
    </div>
  );
}
