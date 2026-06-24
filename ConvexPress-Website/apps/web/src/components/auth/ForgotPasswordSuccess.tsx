import { useEffect, useRef } from "react";
import { MailCheck } from "lucide-react";

import { AuthLink } from "./AuthLink";

interface ForgotPasswordSuccessProps {
  email: string;
}

/**
 * Success message shown after forgot-password form submission.
 * Always shown regardless of whether the email exists (prevents enumeration).
 *
 * Focus is automatically moved to the success heading for screen reader
 * announcement when this component mounts.
 */
export function ForgotPasswordSuccess({ email }: ForgotPasswordSuccessProps) {
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
