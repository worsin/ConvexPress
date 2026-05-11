/**
 * Default Sidebar Template Part
 *
 * Standard sidebar with widget area placeholder.
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
            Add widgets to populate this sidebar area.
          </p>
        </div>
      )}
    </aside>
  );
}
