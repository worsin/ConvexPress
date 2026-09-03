import { ExternalLink, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron";
import { useAdminShell } from "@/hooks/layout/useAdminShell";
import { useControlShell } from "@/control/ControlShellContext";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { EnvironmentChip } from "@/components/shell/EnvironmentChip";
import { EnvironmentMenu } from "@/components/shell/EnvironmentMenu";
import { EnvironmentSwitch } from "@/components/shell/EnvironmentSwitch";
import { ShellTopbar } from "@/components/shell/ShellTopbar";
import { environmentIdentityLabel } from "@/control/components/EnvironmentBar";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

interface AdminBarProps {
  siteTitle: string;
}

/**
 * Admin topbar. In standalone mode the right side carries the environment
 * switch and its options menu; the left side names the site and its
 * environment so production is unmistakable on every route.
 */
export function AdminBar({ siteTitle }: AdminBarProps) {
  const { toggleMobileSidebar } = useAdminShell();
  const shell = useControlShell();

  // The entire header is a drag region; interactive elements opt out.
  const noDrag = isElectron() ? "app-no-drag" : "";
  const visitHref = shell?.selectedEnvironment?.siteOrigin ?? "/";
  const title = shell?.selectedWebsite?.title ?? siteTitle;

  const activeEnvironment =
    shell?.selectedEnvironment
      ? environmentIdentityLabel(shell.selectedWebsite?.title ?? null, shell.selectedEnvironment)
      : null;

  return (
    <ShellTopbar
      activeEnvironment={activeEnvironment}
      left={
        <>
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className={cn(
              "inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-muted md:hidden",
              noDrag,
            )}
            aria-label="Toggle navigation menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <a
            href={visitHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink-2 transition-colors hover:text-foreground",
              noDrag,
            )}
          >
            <span className="max-w-[220px] truncate font-medium">{title}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          </a>

          {shell?.selectedEnvironment && (
            <EnvironmentChip
              environment={shell.selectedEnvironment}
              size="sm"
              className="hidden lg:inline-flex"
            />
          )}
        </>
      }
      center={
        <div className={cn("w-full min-w-0 max-w-[340px]", noDrag)}>
          <AdminSearchBar className="w-full" />
        </div>
      }
      right={
        <>
          {shell && (
            <>
              <EnvironmentSwitch className="hidden sm:flex" />
              <EnvironmentMenu />
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <div className={noDrag}>
            <NotificationBell />
          </div>
          <div className={noDrag}>
            <UserMenu />
          </div>
        </>
      }
    />
  );
}
