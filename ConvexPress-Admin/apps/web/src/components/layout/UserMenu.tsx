import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useLocalAuthContext } from "@/lib/local-auth-context";

export function UserMenu() {
  const { user } = useAuth();
  const { logout } = useLocalAuthContext();

  if (!user) return null;

  const displayName = user.displayName || user.email || "User";

  const initials = user.firstName
    ? user.firstName.charAt(0).toUpperCase()
    : (user.email?.charAt(0).toUpperCase() ?? "U");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors hover:bg-muted outline-hidden"
      >
        {/* Avatar */}
        {user.profilePictureUrl ? (
          <img
            src={user.profilePictureUrl}
            alt=""
            className="size-6 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {initials}
          </div>
        )}
        <span className="hidden text-sm text-foreground sm:inline">
          {displayName}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8}>
        {/* User info header */}
        <div className="px-2 py-2">
          <p className="text-xs font-medium text-foreground">{displayName}</p>
          {user.email && (
            <p className="text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          render={<Link to="/profile" />}
        >
          <User className="size-4" />
          Your Profile
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => void logout()}>
          <LogOut className="size-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
