/**
 * Default Sidebar Template Part
 */

import type { ReactNode } from "react";

interface DefaultSidebarProps {
  children?: ReactNode;
}

export function DefaultSidebar({ children }: DefaultSidebarProps) {
  return (
    <aside className="space-y-6">
      {children ?? (
        <div className="rounded border border-border p-4">
          <h3
            className="mb-2 text-sm font-semibold"
            style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
          >
            Sidebar
          </h3>
          <p className="text-xs text-muted-foreground">
            Explore recent content and site resources.
          </p>
        </div>
      )}
    </aside>
  );
}
