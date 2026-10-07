/**
 * Profile dropdown: items come from the `profileLocation` menu when one is
 * assigned; otherwise Profile, Settings, Sign out. Sign out always closes the
 * list so a menu can never strand a member.
 */

import { useClerk } from "@/lib/auth/clerk";
import { ChevronDown, LogOut } from "lucide-react";

import { AvatarDisplay } from "@/components/dashboard/profile/AvatarDisplay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { AccountMenuItems } from "./AccountMenuItems";
import { type NavItem } from "../nav";

interface ProfileMenuProps {
  items: NavItem[];
  badges: Record<string, number> | null;
  className?: string;
}

export function ProfileMenu({ items, badges, className }: ProfileMenuProps) {
  const { user } = useCurrentUser();
  const { signOut } = useClerk();

  if (!user) {
    return <div className={cn("size-8 animate-pulse rounded-full bg-muted", className)} aria-hidden="true" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="dashboard-profile-trigger"
        aria-label="Account menu"
        className={cn(
          "flex h-9 items-center gap-2 px-1.5 text-xs outline-hidden transition-colors hover:bg-muted",
          "focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <AvatarDisplay
          avatarUrl={user.avatarUrl}
          oauthAvatarUrl={user.oauthAvatarUrl}
          displayName={user.displayName}
          size="sm"
        />
        <span className="hidden max-w-32 truncate text-foreground lg:inline">{user.displayName}</span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground lg:inline" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="pb-1">
            <span className="block truncate text-sm font-medium text-foreground">{user.displayName}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <AccountMenuItems items={items} badges={badges} />
        {items.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
