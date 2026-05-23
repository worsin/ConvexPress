/**
 * Columns Footer Template Part
 *
 * Multi-column footer with widget areas and copyright bar.
 */

import { useEffect, useState, type ReactNode } from "react";

/** SSR-safe fallback year to avoid hydration mismatch */
const FALLBACK_YEAR = 2026;

interface ColumnsFooterProps {
  siteName?: string;
  copyrightText?: string;
  showPoweredBy?: boolean;
  columns?: ReactNode[];
}

export function ColumnsFooter({
  siteName = "ConvexPress",
  copyrightText,
  showPoweredBy = true,
  columns,
}: ColumnsFooterProps) {
  // Use client-only year to avoid SSR hydration mismatch
  const [year, setYear] = useState<number>(FALLBACK_YEAR);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  const copyright = copyrightText || `\u00A9 ${year} ${siteName}. All rights reserved.`;

  return (
    <footer className="border-t border-border bg-background">
      <div
        className="mx-auto px-4 py-10"
        style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}
      >
        {/* Widget columns */}
        {columns && columns.length > 0 ? (
          <div className="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((col, i) => (
              <div key={i}>{col}</div>
            ))}
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
              >
                About
              </h4>
              <p className="text-sm text-muted-foreground">
                A modern website powered by ConvexPress.
              </p>
            </div>
            <div>
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
              >
                Navigation
              </h4>
              <p className="text-sm text-muted-foreground">
                Browse site updates and featured resources.
              </p>
            </div>
            <div>
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
              >
                Categories
              </h4>
              <p className="text-sm text-muted-foreground">
                Discover topics, collections, and guides.
              </p>
            </div>
            <div>
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
              >
                Connect
              </h4>
              <p className="text-sm text-muted-foreground">
                Reach the team through the contact and support pages.
              </p>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex flex-col items-center gap-2 border-t border-border pt-6 text-center">
          <p className="text-sm text-muted-foreground">{copyright}</p>
          {showPoweredBy && (
            <p className="text-xs text-muted-foreground/60">
              Powered by ConvexPress
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
