/**
 * Single Post Template
 *
 * Displays a single blog post with content area and optional sidebar.
 * Used for individual post pages (/blog/{slug}).
 */

import type { ReactNode } from "react";

interface SinglePostTemplateProps {
  children?: ReactNode;
  sidebar?: ReactNode;
}

export function SinglePostTemplate({ children, sidebar }: SinglePostTemplateProps) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}>
      <div className={sidebar ? "flex gap-8" : ""}>
        <article
          className="flex-1 min-w-0"
          style={{ maxWidth: "var(--sh-layout-content, 720px)" }}
        >
          {children}
        </article>
        {sidebar && (
          <aside className="hidden lg:block w-72 shrink-0">{sidebar}</aside>
        )}
      </div>
    </div>
  );
}
