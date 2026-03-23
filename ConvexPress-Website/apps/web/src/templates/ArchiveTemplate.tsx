/**
 * Archive Template
 *
 * Displays a list of posts for category, tag, author, or date archives.
 * Supports an optional sidebar.
 */

import type { ReactNode } from "react";

interface ArchiveTemplateProps {
  children?: ReactNode;
  sidebar?: ReactNode;
  title?: string;
  description?: string;
}

export function ArchiveTemplate({
  children,
  sidebar,
  title,
  description,
}: ArchiveTemplateProps) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}>
      {(title || description) && (
        <header className="mb-8 border-b border-border pb-6">
          {title && (
            <h1
              className="text-3xl font-bold"
              style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
            >
              {title}
            </h1>
          )}
          {description && (
            <p className="mt-2 text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      <div className={sidebar ? "flex gap-8" : ""}>
        <main className="flex-1 min-w-0">{children}</main>
        {sidebar && (
          <aside className="hidden lg:block w-72 shrink-0">{sidebar}</aside>
        )}
      </div>
    </div>
  );
}
