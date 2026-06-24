import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { useState } from "react";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ForgotPasswordSuccess } from "@/components/auth/ForgotPasswordSuccess";
import { AuthLink } from "@/components/auth/AuthLink";
import { buildRestrictedPageHead } from "@/lib/seo/head";

export const Route = createFileRoute("/forgot-password")({
  head: () => buildRestrictedPageHead({
    title: "Forgot Password - ConvexPress",
    path: "/forgot-password",
  }),
  component: ForgotPasswordComponent,
});

function ForgotPasswordComponent() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Authenticated users should manage passwords in dashboard settings
	  useEffect(() => {
	    if (isLoaded && isSignedIn) {
	      navigate({ to: "/dashboard/settings" } as any);
	    }
	  }, [isLoaded, isSignedIn, navigate]);

  const handleSuccess = (email: string) => {
    setSubmittedEmail(email);
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
        <ForgotPasswordSuccess email={submittedEmail} />
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
