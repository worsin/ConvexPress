import { Mail } from "lucide-react";

import { AuthLink } from "./AuthLink";

/**
 * Message shown when registration is invitation-only and no token is provided.
 */
export function InvitationRequiredMessage() {
  return (
    <div
      data-slot="invitation-required-message"
      className="flex flex-col items-center gap-4 py-4 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-none bg-muted">
        <Mail className="size-4 text-muted-foreground" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-foreground">
          Invitation Required
        </h3>
        <p className="text-xs text-muted-foreground">
          Registration is by invitation only. If you've received an invitation
          email, click the link in that email to register.
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
