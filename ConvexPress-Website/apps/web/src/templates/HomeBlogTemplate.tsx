/**
 * Home Blog Template
 *
 * Displays the latest blog posts in a grid layout.
 * Used for the blog home page (/blog or / when set to latest posts).
 */

import type { ReactNode } from "react";

interface HomeBlogTemplateProps {
  children?: ReactNode;
  sidebar?: ReactNode;
}

export function HomeBlogTemplate({ children, sidebar }: HomeBlogTemplateProps) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}>
      <header className="mb-8 border-b border-border pb-6">
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
        >
          Blog
        </h1>
      </header>
      <div className={sidebar ? "flex gap-8" : ""}>
        <main className="flex-1 min-w-0">
          {children}
        </main>
        {sidebar && (
          <aside className="hidden lg:block w-72 shrink-0">{sidebar}</aside>
        )}
      </div>
    </div>
  );
}
