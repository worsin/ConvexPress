import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { SiteIdentity } from "@/lib/layout/types";

interface SiteBrandProps {
  siteIdentity: SiteIdentity | undefined;
  className?: string;
}

/**
 * Logo image and/or site title text, linking to the homepage.
 */
export function SiteBrand({ siteIdentity, className }: SiteBrandProps) {
  // Loading skeleton
  if (!siteIdentity) {
    return (
      <div
        data-slot="site-brand"
        className={cn("flex items-center gap-2", className)}
      >
        <div className="h-5 w-24 animate-pulse bg-muted" />
      </div>
    );
  }

  const showLogo = !!siteIdentity.logoUrl;
  const showTitle = !showLogo || siteIdentity.showTitleWithLogo !== false;

  return (
    <Link
      to="/"
      data-slot="site-brand"
      className={cn(
        "flex items-center gap-2 text-foreground no-underline",
        className,
      )}
    >
      {showLogo && (
        <img
          src={siteIdentity.logoUrl}
          alt={siteIdentity.logoAlt || siteIdentity.title}
          className="h-8 w-auto"
          width={32}
          height={32}
        />
      )}
      {showTitle && (
        <span className="text-sm font-semibold text-foreground">
          {siteIdentity.title}
        </span>
      )}
    </Link>
  );
}
