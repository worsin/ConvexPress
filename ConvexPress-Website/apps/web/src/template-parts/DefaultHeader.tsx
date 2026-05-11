/**
 * Default Header Template Part
 *
 * Standard site header with logo, site title, and navigation.
 * This is the default header used when no other header part is assigned.
 */

import type { ReactNode } from "react";

interface DefaultHeaderProps {
  siteName?: string;
  tagline?: string;
  logo?: string | null;
  navigation?: ReactNode;
}

export function DefaultHeader({
  siteName = "ConvexPress",
  tagline,
  logo,
  navigation,
}: DefaultHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div
        className="mx-auto flex items-center justify-between px-4 py-4"
        style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}
      >
        <div className="flex items-center gap-3">
          {logo && (
            <img src={logo} alt={siteName} className="h-8 w-auto" />
          )}
          <div>
            <a
              href="/"
              className="text-lg font-bold"
              style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
            >
              {siteName}
            </a>
            {tagline && (
              <p className="text-xs text-muted-foreground">{tagline}</p>
            )}
          </div>
        </div>
        {navigation && <nav className="hidden md:flex">{navigation}</nav>}
      </div>
    </header>
  );
}
