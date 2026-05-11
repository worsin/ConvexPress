/**
 * Default Footer Template Part
 *
 * Full footer with site info, navigation, and copyright.
 */

import { useEffect, useState } from "react";
/** SSR-safe fallback year to avoid hydration mismatch */
const FALLBACK_YEAR = 2026;

interface DefaultFooterProps {
  siteName?: string;
  copyrightText?: string;
  showPoweredBy?: boolean;
}

export function DefaultFooter({
  siteName = "ConvexPress",
  copyrightText,
  showPoweredBy = true,
}: DefaultFooterProps) {
  // Use client-only year to avoid SSR hydration mismatch
  const [year, setYear] = useState<number>(FALLBACK_YEAR);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  const copyright = copyrightText || `\u00A9 ${year} ${siteName}. All rights reserved.`;

  return (
    <footer className="border-t border-border bg-background">
      <div
        className="mx-auto px-4 py-8"
        style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
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
