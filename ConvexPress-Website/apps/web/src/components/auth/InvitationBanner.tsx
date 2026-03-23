import { UserPlus } from "lucide-react";
import type { InvitationData } from "@/lib/auth/types";

interface InvitationBannerProps {
  invitation: InvitationData;
}

/**
 * Banner displayed on the registration page when the user arrives via
 * an invitation link (/register?token=...).
 *
 * Shows the invited role and optional personal message from the admin.
 * Per PRD: "You've been invited as {role}" with optional personal message.
 */
export function InvitationBanner({ invitation }: InvitationBannerProps) {
  // Capitalize the role for display
  const displayRole =
    invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1);

  return (
    <div
      data-slot="invitation-banner"
      className="rounded-none border border-primary/20 bg-primary/5 p-4"
    >
      <div className="flex items-start gap-3">
        <UserPlus className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            You&apos;ve been invited as{" "}
            <span className="text-primary">{displayRole}</span>
          </p>
          {invitation.email && (
            <p className="text-xs text-muted-foreground">
              Invitation for {invitation.email}
            </p>
          )}
          {invitation.message && (
            <p className="mt-1 text-xs text-muted-foreground italic">
              &ldquo;{invitation.message}&rdquo;
            </p>
          )}
          {invitation.inviterName && (
            <p className="text-xs text-muted-foreground">
              Invited by {invitation.inviterName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
