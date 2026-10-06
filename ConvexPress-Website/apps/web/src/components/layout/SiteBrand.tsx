import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { resolveHeaderBrand } from "@/lib/layout/headerBrand";
import type { HeaderConfig, SiteIdentity } from "@/lib/layout/types";

interface SiteBrandProps {
  siteIdentity: SiteIdentity | undefined;
  className?: string;
  logo?: HeaderConfig["logo"];
}

/**
 * Logo image and/or site title text, linking to the homepage.
 */
export function SiteBrand({ siteIdentity, className, logo }: SiteBrandProps) {
  if (logo?.enabled === false) return null;
  // Loading skeleton
  if (!siteIdentity) {
    return (
      <div
        data-slot="site-brand" data-customize="header.logo.showTitle"
        className={cn("flex items-center gap-2", className)}
      >
        <div className="h-5 w-24 animate-pulse bg-muted" />
      </div>
    );
  }

  const { showImage: showLogo, showTitle, showTagline, imageSize } = resolveHeaderBrand(siteIdentity, logo ?? {
    enabled: true, showImage: true, showTitle: true, showTagline: false, size: "medium",
  });
  if (!showLogo && !showTitle && !showTagline) return null;

  return (
    <Link
      to="/"
      data-slot="site-brand" data-customize="header.logo.showTitle"
      className={cn(
        "flex min-w-0 items-center gap-2 text-foreground no-underline",
        className,
      )}
    >
      {showLogo && (
        <img
          src={siteIdentity.logoUrl}
          alt={siteIdentity.logoAlt || siteIdentity.title}
          className="w-auto min-w-0 max-w-32 object-contain"
          style={{ height: imageSize }}
          width={imageSize}
          height={imageSize}
        />
      )}
      {(showTitle || showTagline) && (
        <span className="min-w-0">
          {showTitle && <span className="block min-w-0 truncate text-sm font-semibold text-foreground">{siteIdentity.title}</span>}
          {showTagline && <span className="block truncate text-xs text-muted-foreground">{siteIdentity.tagline}</span>}
        </span>
      )}
    </Link>
  );
}
