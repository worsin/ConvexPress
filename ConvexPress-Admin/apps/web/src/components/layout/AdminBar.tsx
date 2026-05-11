import { ExternalLink, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron";
import { useAdminShell } from "@/hooks/layout/useAdminShell";
import { ModeToggle } from "@/components/mode-toggle";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

interface AdminBarProps {
  siteTitle: string;
}

export function AdminBar({ siteTitle }: AdminBarProps) {
  const { toggleMobileSidebar } = useAdminShell();

  // Pattern: the entire header is a drag region; only the actual interactive
  // elements opt out via `app-no-drag` so empty space between them stays drag.
  const noDrag = isElectron() ? "app-no-drag" : "";

  return (
    <header
      role="banner"
      className={cn(
        "sticky top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-background px-4",
        isElectron() && "app-drag",
      )}
    >
      {/* Left side */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={toggleMobileSidebar}
          className={cn(
            "inline-flex items-center justify-center rounded-sm p-1.5 transition-colors hover:bg-muted md:hidden",
            noDrag,
          )}
          aria-label="Toggle navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>

        {/* Site name + Visit Site link */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
            noDrag,
          )}
        >
          <span className="font-medium">{siteTitle}</span>
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>

      {/* Center - Command Palette Search. Wrapper stays drag; the search bar
          opts out so the input + clickable hint remain interactive. */}
      <div className="hidden flex-1 justify-center md:flex">
        <div className={noDrag}>
          <AdminSearchBar />
        </div>
      </div>

      {/* Right side — wrapper is drag; each control opts out individually */}
      <div className="flex items-center gap-1">
        <div className={noDrag}>
          <NotificationBell />
        </div>
        <div className={noDrag}>
          <ModeToggle />
        </div>
        <div className={noDrag}>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
