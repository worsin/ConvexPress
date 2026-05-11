import { ExternalLink, LayoutDashboard, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAdminBarVisibility } from "@/hooks/layout/useAdminBarVisibility";

/**
 * Thin bar at the very top of the page, visible only to logged-in administrators.
 * Provides quick links to the admin panel and "Edit This Page" for the current content.
 */
export function WebsiteAdminBar() {
  const { showAdminBar, dashboardUrl, editUrl } = useAdminBarVisibility();

  if (!showAdminBar) return null;

  return (
    <div
      data-slot="website-admin-bar"
      role="complementary"
      aria-label="Admin toolbar"
      className={cn(
        "z-50 flex h-8 w-full items-center justify-between bg-foreground px-4 text-background md:px-6 lg:px-8",
      )}
    >
      {/* Left side */}
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold">ConvexPress</span>
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-background/80 transition-colors hover:text-background"
        >
          <LayoutDashboard className="size-3" />
          Dashboard
        </a>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {editUrl && (
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-background/80 transition-colors hover:text-background"
          >
            <Pencil className="size-3" />
            Edit This Page
          </a>
        )}
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-background/80 transition-colors hover:text-background"
          aria-label="Open admin panel"
        >
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}
