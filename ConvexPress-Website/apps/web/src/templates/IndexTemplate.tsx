/**
 * Index Template
 *
 * Universal fallback template. Displays a simple content area
 * with sidebar support. Used when no specific template is assigned.
 */

import type { ReactNode } from "react";

interface IndexTemplateProps {
  children?: ReactNode;
  sidebar?: ReactNode;
}

export function IndexTemplate({ children, sidebar }: IndexTemplateProps) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}>
      <div className={sidebar ? "flex gap-8" : ""}>
        <main className="flex-1 min-w-0">
          {children ?? (
            <div className="py-12 text-center text-muted-foreground">
              <p>No content to display.</p>
            </div>
          )}
        </main>
        {sidebar && (
          <aside className="hidden lg:block w-72 shrink-0">{sidebar}</aside>
        )}
      </div>
    </div>
  );
}
