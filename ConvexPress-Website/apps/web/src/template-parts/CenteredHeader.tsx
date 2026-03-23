/**
 * Centered Header Template Part
 *
 * A centered layout header with the site branding centered above the nav.
 * Suitable for editorial or magazine-style sites.
 */

import type { ReactNode } from "react";

interface CenteredHeaderProps {
  siteName?: string;
  tagline?: string;
  logo?: string | null;
  navigation?: ReactNode;
}

export function CenteredHeader({
  siteName = "SmithHarper",
  tagline,
  logo,
  navigation,
}: CenteredHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div
        className="mx-auto px-4 py-6 text-center"
        style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}
      >
        <div className="flex flex-col items-center gap-2">
          {logo && (
            <img src={logo} alt={siteName} className="h-10 w-auto" />
          )}
          <a
            href="/"
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
          >
            {siteName}
          </a>
          {tagline && (
            <p className="text-sm text-muted-foreground">{tagline}</p>
          )}
        </div>
        {navigation && (
          <nav className="mt-4 hidden md:flex justify-center">
            {navigation}
          </nav>
        )}
      </div>
    </header>
  );
}
