import { Link } from "@tanstack/react-router";
import { useUser, useClerk } from "@clerk/clerk-react";
import { LayoutDashboard, LogOut, Settings, User } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * User avatar and dropdown menu in the header for authenticated users.
 */
export function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();

  if (!user) return null;

  // Get initials for avatar fallback
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || user.primaryEmailAddress?.emailAddress || "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="user-menu-trigger"
        className={cn(
          "flex items-center gap-2 rounded-none px-1.5 py-1 text-xs outline-hidden",
          "hover:bg-muted transition-colors",
          "focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        {user.imageUrl ? (
          <img
            src={user.imageUrl}
            alt={displayName}
            className="size-8 rounded-none object-cover"
          />
        ) : (
          <div className="flex size-8 items-center justify-center bg-muted text-xs font-medium text-muted-foreground">
            {initials}
          </div>
        )}
        <span className="hidden text-xs text-foreground md:inline">
          {displayName}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuItem render={<Link to="/dashboard" />}>
          <LayoutDashboard className="size-4" />
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/dashboard/profile" />}>
          <User className="size-4" />
          Your Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/dashboard/settings" />}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
        >
          <LogOut className="size-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
