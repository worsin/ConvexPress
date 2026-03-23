/**
 * Minimal Footer Template Part
 *
 * A compact, single-line footer with copyright text.
 */

import { useEffect, useState } from "react";

/** SSR-safe fallback year to avoid hydration mismatch */
const FALLBACK_YEAR = 2026;

interface MinimalFooterProps {
  siteName?: string;
  copyrightText?: string;
}

export function MinimalFooter({
  siteName = "SmithHarper",
  copyrightText,
}: MinimalFooterProps) {
  // Use client-only year to avoid SSR hydration mismatch
  const [year, setYear] = useState<number>(FALLBACK_YEAR);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  const copyright = copyrightText || `\u00A9 ${year} ${siteName}`;

  return (
    <footer className="border-t border-border bg-background">
      <div
        className="mx-auto px-4 py-4"
        style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}
      >
        <p className="text-center text-xs text-muted-foreground">
          {copyright}
        </p>
      </div>
    </footer>
  );
}
