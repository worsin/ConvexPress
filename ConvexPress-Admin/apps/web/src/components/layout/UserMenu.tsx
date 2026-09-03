import { Link } from "@tanstack/react-router";
import { LogOut, Moon, Sun, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { initialsFor } from "@/components/shell/environment-presentation";
import { useControlShell } from "@/control/ControlShellContext";
import { useAuth } from "@/lib/auth-context";
import { useLocalAuthContext } from "@/lib/local-auth-context";

export function UserMenu() {
  const { user } = useAuth();
  const { logout } = useLocalAuthContext();
  const shell = useControlShell();
  const { resolvedTheme, setTheme } = useTheme();

  if (!user && !shell) return null;

  // Standalone mode shows the outer operator, never the synthetic site principal.
  const displayName = shell
    ? shell.operator.displayName
    : user?.displayName || user?.email || "User";
  const email = shell ? shell.operator.email : user?.email;
  const profilePictureUrl = shell ? undefined : user?.profilePictureUrl;
  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${displayName}`}
        className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-sm transition-colors outline-hidden hover:bg-muted aria-expanded:bg-muted"
      >
        {profilePictureUrl ? (
          <img
            src={profilePictureUrl}
            alt=""
            className="size-7 rounded-full object-cover"
          />
        ) : (
          <div className="grid size-7 place-items-center rounded-full bg-foreground text-[10.5px] font-semibold text-background">
            {initialsFor(displayName)}
          </div>
        )}
        <span className="hidden max-w-36 truncate text-[13px] font-medium text-foreground lg:inline">
          {displayName}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuGroup>
        <DropdownMenuLabel className="px-3 py-2.5">
          <p className="text-[13px] font-semibold text-foreground">{displayName}</p>
          {email && (
            <p className="truncate text-[12px] text-muted-foreground">{email}</p>
          )}
        </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link to="/profile" />}>
          <User aria-hidden="true" />
          Your profile
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          {isDark ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          aria-label={shell ? "Sign out of ConvexPress control plane" : "Log out"}
          onClick={() => void logout()}
        >
          <LogOut aria-hidden="true" />
          {shell ? "Sign out" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
