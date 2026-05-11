import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { useState } from "react";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ForgotPasswordSuccess } from "@/components/auth/ForgotPasswordSuccess";
import { AuthLink } from "@/components/auth/AuthLink";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        title: "Forgot Password - ConvexPress",
      },
    ],
  }),
  component: ForgotPasswordComponent,
});

function ForgotPasswordComponent() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [oauthHint, setOauthHint] = useState(false);

  // Authenticated users should manage passwords in dashboard settings
	  useEffect(() => {
	    if (isLoaded && isSignedIn) {
	      navigate({ to: "/dashboard/settings" } as any);
	    }
	  }, [isLoaded, isSignedIn, navigate]);

  const handleSuccess = (email: string, isOAuth?: boolean) => {
    setSubmittedEmail(email);
    setOauthHint(isOAuth ?? false);
  };

  if (isLoaded && isSignedIn) {
    return null;
  }

  return (
    <AuthPageLayout
      title="Forgot Password"
      description={
        submittedEmail
          ? undefined
          : "Enter your email to receive a reset link."
      }
    >
      {submittedEmail ? (
        <ForgotPasswordSuccess email={submittedEmail} oauthHint={oauthHint} />
      ) : (
        <>
          <ForgotPasswordForm onSuccess={handleSuccess} />
          <div className="text-center">
            <AuthLink to="/login">Back to Sign In</AuthLink>
          </div>
        </>
      )}
    </AuthPageLayout>
  );
}
