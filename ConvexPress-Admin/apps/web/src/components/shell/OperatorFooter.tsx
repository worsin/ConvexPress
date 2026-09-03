/**
 * Sidebar footer — who is signed in, theme toggle, sidebar collapse.
 *
 * Standalone mode shows the outer operator (name + platform role). Single-site
 * mode shows the site user. Sign-out lives behind the identity so it is never
 * one stray click away.
 */

import { ChevronsLeft, ChevronsRight, LogOut, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useControlShell } from "@/control/ControlShellContext";
import { useOptionalLocalAuthContext } from "@/lib/local-auth-context";
import { cn } from "@/lib/utils";
import { initialsFor } from "./environment-presentation";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  manager: "Business manager",
  member: "Member",
  viewer: "Viewer",
};

export function ThemeSegment({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "app-no-drag flex items-center gap-0.5 rounded-lg border border-border p-0.5",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Light theme"
        aria-pressed={!isDark}
        onClick={() => setTheme("light")}
        className={cn(
          "grid h-6 w-[26px] place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
          !isDark && "bg-card text-foreground shadow-soft",
        )}
      >
        <Sun aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Dark theme"
        aria-pressed={isDark}
        onClick={() => setTheme("dark")}
        className={cn(
          "grid h-6 w-[26px] place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
          isDark && "bg-card text-foreground shadow-soft",
        )}
      >
        <Moon aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}

interface OperatorFooterProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  /** Site-user role name, used when not running standalone. */
  siteRoleName?: string | null;
}

export function OperatorFooter({
  collapsed,
  onToggleCollapse,
  siteRoleName,
}: OperatorFooterProps) {
  const shell = useControlShell();
  const localAuth = useOptionalLocalAuthContext();
  const identity = shell?.operator ?? localAuth?.user ?? null;
  const displayName = identity?.displayName || identity?.email || "Signed in";
  const email = identity?.email ?? "";
  const roleLabel = shell
    ? ROLE_LABELS[shell.operator.role] ?? shell.operator.role
    : siteRoleName ?? "";
  const signOut = shell ? shell.signOut : (localAuth?.logout ?? (async () => {}));
  const signOutLabel = shell
    ? "Sign out of ConvexPress control plane"
    : "Log out";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border-t border-sidebar-border px-2 py-2.5",
        collapsed && "flex-col px-1",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu for ${displayName}`}
          className={cn(
            "app-no-drag flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent",
            collapsed ? "justify-center" : "flex-1",
          )}
        >
          <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-foreground text-[11.5px] font-semibold tracking-[0.02em] text-background">
            {initialsFor(displayName)}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-[1.2]">
              <span className="truncate text-[13px] font-semibold text-foreground">
                {displayName}
              </span>
              {roleLabel && (
                <span className="truncate text-[11.5px] text-muted-foreground">
                  {roleLabel}
                </span>
              )}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-60">
          <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2.5">
            <span className="block text-[13px] font-semibold text-foreground">{displayName}</span>
            {email && (
              <span className="block truncate text-[12px] text-muted-foreground">{email}</span>
            )}
          </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem aria-label={signOutLabel} onClick={() => void signOut()}>
            <LogOut aria-hidden="true" />
            {shell ? "Sign out" : "Log out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {!collapsed && <ThemeSegment />}

      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="app-no-drag grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {collapsed ? (
            <ChevronsRight aria-hidden="true" className="size-4" />
          ) : (
            <ChevronsLeft aria-hidden="true" className="size-4" />
          )}
        </button>
      )}
    </div>
  );
}
