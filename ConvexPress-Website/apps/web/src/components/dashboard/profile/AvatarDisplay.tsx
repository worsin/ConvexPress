import { cn } from "@/lib/utils";

interface AvatarDisplayProps {
  avatarUrl: string | null;
  oauthAvatarUrl: string | null;
  displayName: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-24 text-xl",
} as const;

/**
 * Extracts initials from a display name (1-2 characters).
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/**
 * Read-only avatar display component.
 * Resolves: avatarUrl > oauthAvatarUrl (OAuth provider avatar) > initials fallback.
 */
export function AvatarDisplay({
  avatarUrl,
  oauthAvatarUrl,
  displayName,
  size = "md",
  className,
}: AvatarDisplayProps) {
  const resolvedUrl = avatarUrl ?? oauthAvatarUrl ?? null;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      data-slot="avatar-display"
      className={cn(
        "shrink-0 overflow-hidden rounded-full",
        sizeClass,
        className,
      )}
    >
      {resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt={displayName}
          className="size-full object-cover"
        />
      ) : (
        <div
          data-slot="avatar-initials"
          className="flex size-full items-center justify-center bg-muted font-medium text-muted-foreground"
        >
          {getInitials(displayName)}
        </div>
      )}
    </div>
  );
}
