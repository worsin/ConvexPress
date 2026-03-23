import { useEffect, useRef } from "react";
import { MailCheck, Info } from "lucide-react";

import { AuthLink } from "./AuthLink";

interface ForgotPasswordSuccessProps {
  email: string;
  /** If true, the user registered via OAuth and should try their provider instead. */
  oauthHint?: boolean;
}

/**
 * Success message shown after forgot-password form submission.
 * Always shown regardless of whether the email exists (prevents enumeration).
 *
 * If the user registered via OAuth, an advisory hint is shown suggesting
 * they sign in with their OAuth provider (Google, GitHub, etc.) instead.
 *
 * Focus is automatically moved to the success heading for screen reader
 * announcement when this component mounts.
 */
export function ForgotPasswordSuccess({ email, oauthHint }: ForgotPasswordSuccessProps) {
  // Partially mask the email for privacy
  const maskedEmail = maskEmail(email);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the success heading for accessibility
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      data-slot="forgot-password-success"
      className="flex flex-col items-center gap-4 py-4 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-none bg-primary/10">
        <MailCheck className="size-4 text-primary" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-medium text-foreground outline-hidden"
        >
          Check your email
        </h3>
        <p className="text-xs text-muted-foreground">
          If an account exists for{" "}
          <span className="font-medium text-foreground">{maskedEmail}</span>,
          we've sent a password reset link.
        </p>
        <p className="text-xs text-muted-foreground">
          Check your inbox and spam folder.
        </p>
      </div>

      {oauthHint && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5 text-left"
        >
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            It looks like this account was created using a social login provider
            (Google, GitHub, etc.). You may want to{" "}
            <AuthLink to="/login" className="inline text-xs font-medium text-foreground">
              sign in with your provider
            </AuthLink>{" "}
            instead.
          </p>
        </div>
      )}

      <AuthLink to="/login">Back to Sign In</AuthLink>
    </div>
  );
}

/**
 * Masks an email address for display, e.g. "jane@example.com" -> "j***@example.com"
 */
function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return email;

  const [local, domain] = parts;
  if (!local || !domain) return email;

  if (local.length <= 1) {
    return `${local}***@${domain}`;
  }

  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}@${domain}`;
}
