import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";
import { useState } from "react";

import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";
import CoreAuthForgot, { type AuthForgotSurfaceData } from "@/templates/packs/core/surfaces/auth.forgot";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/forgot-password")({
  head: () => buildRestrictedPageHead({
    title: siteTitled("Forgot Password"),
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

  const data: AuthForgotSurfaceData = { submittedEmail, onSubmitted: handleSuccess };

  return <Surface name="auth.forgot" data={data} fallback={CoreAuthForgot} />;
}
