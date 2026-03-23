import { AlertCircle } from "lucide-react";

import { AuthLink } from "./AuthLink";

interface InvitationInvalidMessageProps {
  reason: "expired" | "revoked" | "not_found" | "already_used";
}

const reasonMessages: Record<string, string> = {
  expired: "This invitation has expired.",
  revoked: "This invitation has been revoked.",
  not_found: "This invitation is not valid.",
  already_used: "This invitation has already been used.",
};

/**
 * Message shown when an invitation token is invalid, expired, or revoked.
 */
export function InvitationInvalidMessage({
  reason,
}: InvitationInvalidMessageProps) {
  return (
    <div
      data-slot="invitation-invalid-message"
      className="flex flex-col items-center gap-4 py-4 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-none bg-destructive/10">
        <AlertCircle className="size-4 text-destructive" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-foreground">
          Invitation Invalid
        </h3>
        <p className="text-xs text-muted-foreground">
          {reasonMessages[reason] ?? "This invitation is not valid."}
        </p>
        <p className="text-xs text-muted-foreground">
          Contact the site administrator for a new invitation.
        </p>
      </div>

      <div className="text-center">
        <span className="text-xs text-muted-foreground">
          Already have an account?{" "}
        </span>
        <AuthLink to="/login">Sign in</AuthLink>
      </div>
    </div>
  );
}
