/**
 * Footer per dashboardConfig.footerVariant: the site footer (full or minimal)
 * or nothing at all.
 */

import { SiteFooter } from "@/components/layout/SiteFooter";
import type { DashboardConfig } from "@/lib/layout/types";

export function ShellFooter({ variant }: { variant: DashboardConfig["footerVariant"] }) {
  if (variant === "none") return null;
  return <SiteFooter variant={variant} />;
}
