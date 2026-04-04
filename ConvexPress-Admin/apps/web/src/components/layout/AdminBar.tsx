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

  return (
    <header
      role="banner"
      className={cn(
        "sticky top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-background px-4",
      )}
      style={isElectron() ? { WebkitAppRegion: "drag" } as React.CSSProperties : undefined}
    >
      {/* Left side — no-drag so buttons/links are clickable */}
      <div className="flex items-center gap-3" style={isElectron() ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}>
        {/* Electron: spacer for traffic lights */}
        {isElectron() && <div className="w-14" />}
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={toggleMobileSidebar}
          className="inline-flex items-center justify-center rounded-sm p-1.5 transition-colors hover:bg-muted md:hidden"
          aria-label="Toggle navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>

        {/* Site name + Visit Site link */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-medium">{siteTitle}</span>
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>

      {/* Center - Command Palette Search */}
      <div className="hidden flex-1 justify-center md:flex" style={isElectron() ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}>
        <AdminSearchBar />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1" style={isElectron() ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}>
        <NotificationBell />
        <ModeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
