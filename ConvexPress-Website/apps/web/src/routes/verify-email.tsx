import { createFileRoute } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { AuthLink } from "@/components/auth/AuthLink";

export const Route = createFileRoute("/verify-email")({
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex",
      },
      {
        title: "Verify Email - SmithHarper",
      },
    ],
  }),
  component: VerifyEmailComponent,
});

/**
 * Placeholder route for email verification landing.
 *
 * Clerk handles email verification natively. This page shows a "Please
 * verify your email" message. When custom verification flows are implemented,
 * this page will include a "Resend verification email" button.
 */
function VerifyEmailComponent() {
  return (
    <AuthPageLayout
      title="Verify Your Email"
      description="Check your inbox for a verification link."
    >
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="flex size-10 items-center justify-center rounded-none bg-primary/10">
          <MailCheck className="size-4 text-primary" />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            We sent a verification email to your address. Click the link in the
            email to verify your account.
          </p>
          <p className="text-xs text-muted-foreground">
            If you don't see it, check your spam folder.
          </p>
        </div>

        {/* TODO: Add resend button when custom verification is implemented */}
        {/* <Button variant="outline" size="sm">Resend Verification Email</Button> */}

        <AuthLink to="/">Go to homepage</AuthLink>
      </div>
    </AuthPageLayout>
  );
}
