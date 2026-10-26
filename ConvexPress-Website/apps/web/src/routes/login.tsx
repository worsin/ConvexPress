import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";
import { z } from "zod";

import { isAbsoluteDestination, sanitizeRedirectUrl } from "@/lib/security/redirect";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";
import CoreAuthLogin, { type AuthLoginSurfaceData } from "@/templates/packs/core/surfaces/auth.login";
import { Surface } from "@/templates/sdk/Surface";

/**
 * Search params schema for the login page.
 */
const loginSearchSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  head: () => buildRestrictedPageHead({
    title: siteTitled("Sign In"),
    path: "/login",
  }),
  validateSearch: loginSearchSchema,
  component: LoginComponent,
});

function LoginComponent() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const { error, error_description, returnTo } = Route.useSearch();

  const safeReturnTo = sanitizeRedirectUrl(returnTo);

  // Redirect authenticated users to their destination (another allowed origin loads as a page).
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      if (isAbsoluteDestination(safeReturnTo)) window.location.assign(safeReturnTo);
      else navigate({ to: safeReturnTo });
    }
  }, [isLoaded, isSignedIn, navigate, safeReturnTo]);

  // Build a user-friendly error message
  const errorMessage = error_description || (error ? `Authentication failed: ${error}` : undefined);

  // Don't render the login form if already signed in (waiting for redirect)
  if (isLoaded && isSignedIn) {
    return null;
  }

  const data: AuthLoginSurfaceData = { errorMessage, returnTo: safeReturnTo };

  return <Surface name="auth.login" data={data} fallback={CoreAuthLogin} />;
}
