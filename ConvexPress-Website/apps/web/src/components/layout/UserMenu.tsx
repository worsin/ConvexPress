import { useUser, useClerk } from "@/lib/auth/clerk";
import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import { useDashboardConfig, useDashboardPath } from "@/hooks/useDashboardConfig";
import { AccountMenuItems } from "@/dashboard/shell/AccountMenuItems";
import { useDashboardMenu } from "@/dashboard/shell/useDashboardMenu";
import type { NavItem } from "@/dashboard/nav";

/**
 * User avatar and dropdown menu in the header for authenticated users.
 *
 * Items come from the dashboard-profile menu location (dashboardConfig.
 * profileLocation) when a menu is assigned; otherwise the header's
 * `userMenu.dropdownPreset` decides between the built-in presets. Every
 * dashboard href is built from the configured base path.
 */
export function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const headerConfig = useHeaderConfig();
  const { config } = useDashboardConfig();
  const { basePath, to } = useDashboardPath();
  const profileMenu = useDashboardMenu(config.profileLocation, basePath);

  if (!user) return null;

  // Get initials for avatar fallback
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || user.primaryEmailAddress?.emailAddress || "User";
  const loggedInDisplay = headerConfig.userMenu.loggedInDisplay;
  const showAvatar = loggedInDisplay !== "name-dropdown";
  const showName = loggedInDisplay !== "avatar-only";

  const items: NavItem[] = profileMenu.nav ?? presetItems(headerConfig.userMenu.dropdownPreset, to);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="user-menu-trigger"
        data-customize="header.userMenu.loggedInDisplay"
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-2 rounded-none px-1.5 py-1 text-xs outline-hidden",
          "hover:bg-muted transition-colors",
          "focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        {showAvatar &&
          (user.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={displayName}
              className="size-8 rounded-none object-cover"
            />
          ) : (
            <div className="flex size-8 items-center justify-center bg-muted text-xs font-medium text-muted-foreground">
              {initials}
            </div>
          ))}
        {showName && (
          <span className={cn("text-xs text-foreground", showAvatar && "hidden md:inline")}>
            {displayName}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <AccountMenuItems items={items} />
        {items.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut className="size-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function link(id: string, label: string, href: string, icon: string): NavItem {
  return { id, kind: "link", label, href, icon, exact: false, external: false, children: [] };
}

function presetItems(
  preset: "dashboard-profile-logout" | "profile-settings-logout" | "custom",
  to: (path?: string) => string,
): NavItem[] {
  if (preset === "profile-settings-logout") {
    return [link("profile", "Your Profile", to("/profile"), "user"), link("settings", "Settings", to("/settings"), "settings")];
  }
  // "dashboard-profile-logout" and "custom" (with no menu assigned) share the classic trio.
  return [
    link("dashboard", "Dashboard", to(""), "layout-dashboard"),
    link("profile", "Your Profile", to("/profile"), "user"),
    link("settings", "Settings", to("/settings"), "settings"),
  ];
}

