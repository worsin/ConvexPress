import { cn } from "@/lib/utils";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { useLayoutConfig } from "@/hooks/layout/useLayoutConfig";

import { FooterBottom } from "./FooterBottom";
import { FooterNav } from "./FooterNav";
import { FooterWidgetAreas } from "./FooterWidgetAreas";

interface SiteFooterProps {
  variant?: "full" | "minimal";
}

/**
 * Site-wide footer with widget areas, footer navigation, copyright notice, and social links.
 * "minimal" variant shows only the copyright line (used in dashboard layout).
 */
export function SiteFooter({ variant = "full" }: SiteFooterProps) {
  const siteIdentity = useSiteIdentity();
  const layoutConfig = useLayoutConfig();
  const siteTitle = siteIdentity?.title ?? "SmithHarper";

  if (variant === "minimal") {
    return (
      <footer
        data-slot="site-footer"
        role="contentinfo"
        className="border-t border-border bg-background"
      >
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 lg:px-8">
          <FooterBottom siteTitle={siteTitle} />
        </div>
      </footer>
    );
  }

  return (
    <footer
      data-slot="site-footer"
      role="contentinfo"
      className={cn(
        "border-t border-border bg-muted/30",
      )}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8 lg:py-12">
        {/* Widget areas */}
        <FooterWidgetAreas columns={layoutConfig.footerColumns} />

        {/* Footer navigation */}
        <div className="mt-8 border-t border-border pt-6">
          <FooterNav />
        </div>

        {/* Copyright + social */}
        <div className="mt-6 border-t border-border pt-6">
          <FooterBottom siteTitle={siteTitle} />
        </div>
      </div>
    </footer>
  );
}
