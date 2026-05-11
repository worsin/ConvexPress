/**
 * Minimal Header Template Part
 *
 * A clean, minimal header with just the site title and navigation.
 * No tagline, compact layout.
 */

import type { ReactNode } from "react";

interface MinimalHeaderProps {
  siteName?: string;
  logo?: string | null;
  navigation?: ReactNode;
}

export function MinimalHeader({
  siteName = "ConvexPress",
  logo,
  navigation,
}: MinimalHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div
        className="mx-auto flex items-center justify-between px-4 py-3"
        style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}
      >
        <a href="/" className="flex items-center gap-2">
          {logo && <img src={logo} alt={siteName} className="h-6 w-auto" />}
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
          >
            {siteName}
          </span>
        </a>
        {navigation && <nav className="hidden md:flex">{navigation}</nav>}
      </div>
    </header>
  );
}
