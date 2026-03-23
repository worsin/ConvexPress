import { Lock } from "lucide-react";

import { AuthLink } from "./AuthLink";

/**
 * Friendly message shown when self-registration is disabled.
 */
export function RegistrationClosedMessage() {
  return (
    <div
      data-slot="registration-closed-message"
      className="flex flex-col items-center gap-4 py-4 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-none bg-muted">
        <Lock className="size-4 text-muted-foreground" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-foreground">
          Registration is currently closed
        </h3>
        <p className="text-xs text-muted-foreground">
          If you have an invitation, use the link provided in your invitation
          email to register.
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
