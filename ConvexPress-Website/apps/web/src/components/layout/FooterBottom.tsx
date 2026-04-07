import { cn } from "@/lib/utils";
import type { FooterConfig } from "@/lib/layout/types";

import { SocialLinks } from "./SocialLinks";

interface FooterBottomProps {
  siteTitle: string;
  className?: string;
  footerConfig?: FooterConfig;
}

/**
 * Bottom-most footer row with copyright notice, powered-by badge, and social links.
 * Config-driven from admin footer settings.
 */
export function FooterBottom({ siteTitle, className, footerConfig }: FooterBottomProps) {
  const year = new Date().getFullYear();

  // Use custom copyright text if provided, otherwise generate default
  const copyrightText = footerConfig?.bottomBar?.copyrightText
    ? footerConfig.bottomBar.copyrightText.replace("{year}", String(year)).replace("{site}", siteTitle)
    : `\u00A9 ${year} ${siteTitle}. All rights reserved.`;

  const showPoweredBy = footerConfig?.bottomBar?.poweredBy !== false;

  return (
    <div
      data-slot="footer-bottom"
      className={cn(
        "flex flex-col items-center justify-between gap-4 sm:flex-row",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-1 sm:items-start">
        <p className="text-xs text-muted-foreground">
          {copyrightText}
        </p>
        {showPoweredBy && (
          <p className="text-xs text-muted-foreground/60">
            Powered by ConvexPress
          </p>
        )}
      </div>
      <SocialLinks iconSize="sm" />
    </div>
  );
}
