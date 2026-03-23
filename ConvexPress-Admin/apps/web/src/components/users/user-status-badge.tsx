/**
 * User Status Badge
 *
 * Displays the user's account status as a small colored badge.
 * Uses CSS variables (no hardcoded colors).
 *
 * - Active: success-tinted
 * - Inactive: muted/dim
 * - Banned: destructive-tinted
 */

import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/users/constants";
import type { UserStatus } from "@/lib/users/types";

interface UserStatusBadgeProps {
  status: UserStatus;
  className?: string;
}

const statusStyles: Record<UserStatus, string> = {
  active:
    "bg-primary/10 text-primary border-primary/20",
  inactive:
    "bg-muted text-muted-foreground border-border",
  banned:
    "bg-destructive/10 text-destructive border-destructive/20",
};

export function UserStatusBadge({ status, className }: UserStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border",
        statusStyles[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
