/**
 * Brand mark per `dashboardConfig.brandMark`:
 *   site    → site logo + title (from settings)
 *   custom  → customLogoUrl (title as alt), title hidden when the image loads
 *   none    → site title only
 */

import { Link } from "@tanstack/react-router";

import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import type { DashboardConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  config: DashboardConfig;
  /** Where the mark links: the dashboard home. */
  href: string;
  /** Icon-only presentation for the collapsed sidebar. */
  compact?: boolean;
  className?: string;
}

export function BrandMark({ config, href, compact = false, className }: BrandMarkProps) {
  const identity = useSiteIdentity();
  const title = identity?.title ?? "";
  const logoUrl =
    config.brandMark === "custom" && config.customLogoUrl
      ? config.customLogoUrl
      : config.brandMark === "site"
        ? identity?.logoUrl
        : undefined;
  const initial = title.trim().charAt(0).toUpperCase() || "•";

  return (
    <Link
      to={href}
      data-slot="dashboard-brand"
      aria-label={`${title} dashboard home`}
      className={cn(
        "flex min-w-0 items-center gap-2.5 text-foreground no-underline outline-hidden",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        className,
      )}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={compact ? title : ""}
          width={28}
          height={28}
          className="size-7 shrink-0 object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initial}
        </span>
      )}
      {!compact && (
        <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
      )}
    </Link>
  );
}
