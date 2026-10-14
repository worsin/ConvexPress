/**
 * External Sign-in Badge
 *
 * Marks an account that signs in through an integrator's trusted identity
 * provider (authSource "external"). ConvexPress holds no password and no
 * Clerk account for it. Uses CSS variables (no hardcoded colors), matching
 * UserStatusBadge.
 */

import { cn } from "@/lib/utils";

export const EXTERNAL_SIGN_IN_EXPLANATION =
  "Signs in through an external identity provider. ConvexPress has no password or Clerk account for this user; sign-in, password and email are managed by that provider.";

interface ExternalSignInBadgeProps {
  className?: string;
}

export function ExternalSignInBadge({ className }: ExternalSignInBadgeProps) {
  return (
    <span
      title={EXTERNAL_SIGN_IN_EXPLANATION}
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border",
        "bg-accent text-accent-foreground border-border",
        className,
      )}
    >
      External sign-in
    </span>
  );
}
