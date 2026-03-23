/**
 * Avatar Component
 *
 * Displays a user avatar with the priority chain:
 *   1. Custom upload (avatarUrl)
 *   2. OAuth provider (profilePictureUrl)
 *   3. Initials fallback (generated from displayName)
 *
 * Sizes: "sm" (24px), "md" (32px), "lg" (40px), "xl" (64px), "2xl" (96px)
 */

import { cn } from "@/lib/utils";
import { resolveAvatarUrl, getInitials } from "@/lib/users/constants";

type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-16 text-lg",
  "2xl": "size-24 text-2xl",
};

interface AvatarProps {
  /** User data for avatar resolution. */
  user: {
    avatarUrl?: string;
    profilePictureUrl?: string;
    resolvedAvatarUrl?: string | null;
    displayName?: string;
  };
  /** Avatar size. Default: "lg" (40px). */
  size?: AvatarSize;
  /** Additional CSS classes. */
  className?: string;
}

export function Avatar({ user, size = "lg", className }: AvatarProps) {
  const url = resolveAvatarUrl(user);
  const initials = getInitials(user.displayName);

  if (url) {
    return (
      <img
        src={url}
        alt={user.displayName || "User avatar"}
        className={cn(
          "rounded-full object-cover shrink-0",
          sizeClasses[size],
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full shrink-0 flex items-center justify-center font-medium bg-muted text-muted-foreground select-none",
        sizeClasses[size],
        className,
      )}
      aria-label={user.displayName || "User avatar"}
    >
      {initials}
    </div>
  );
}
