import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { z } from "zod";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { RegistrationGate } from "@/components/auth/RegistrationGate";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";

const searchSchema = z.object({
  token: z.string().optional(),
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        title: "Create Account - SmithHarper",
      },
    ],
  }),
  validateSearch: searchSchema,
  component: RegisterComponent,
});

function RegisterComponent() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const { token, returnTo } = Route.useSearch();

  const safeReturnTo = sanitizeRedirectUrl(returnTo, {
    fallbackPath: "/dashboard",
  });

  // Redirect authenticated users
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: safeReturnTo });
    }
  }, [isLoaded, isSignedIn, navigate, safeReturnTo]);

  if (isLoaded && isSignedIn) {
    return null;
  }

  return (
    <AuthPageLayout
      title="Create Account"
      description="Join our community."
      maxWidth="md"
    >
      <RegistrationGate token={token}>
        <OAuthButtons mode="signup" />
        <AuthDivider />
        <RegisterForm returnTo={safeReturnTo} />
      </RegistrationGate>
    </AuthPageLayout>
  );
}
