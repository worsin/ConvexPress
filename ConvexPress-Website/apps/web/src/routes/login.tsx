import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { LoginForm } from "@/components/auth/LoginForm";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";

/**
 * Search params schema for the login page.
 */
const loginSearchSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex",
      },
      {
        title: "Sign In - ConvexPress",
      },
    ],
  }),
  validateSearch: loginSearchSchema,
  component: LoginComponent,
});

/**
 * Map error codes to failure reason codes for tracking.
 */
function mapErrorToReason(
  error?: string,
): "invalid_credentials" | "account_locked" | "rate_limited" | "unknown" {
  if (!error) return "unknown";
  const lower = error.toLowerCase();
  if (lower.includes("invalid") || lower.includes("credentials"))
    return "invalid_credentials";
  if (lower.includes("locked") || lower.includes("suspended"))
    return "account_locked";
  if (lower.includes("rate") || lower.includes("limit"))
    return "rate_limited";
  return "unknown";
}

function LoginComponent() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const { error, error_description, returnTo } = Route.useSearch();
  const recordFailedLogin = useMutation(
    api.authTracking.mutations.recordFailedLogin,
  );
  const reportedRef = useRef(false);

  const safeReturnTo = sanitizeRedirectUrl(returnTo, {
    fallbackPath: "/dashboard",
  });

  // Redirect authenticated users to their destination
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: safeReturnTo });
    }
  }, [isLoaded, isSignedIn, navigate, safeReturnTo]);

  // If redirected back with an error, record the failed attempt
  useEffect(() => {
    if (error && !reportedRef.current) {
      reportedRef.current = true;
      recordFailedLogin({
        email: "unknown",
        reason: mapErrorToReason(error),
        app: "website" as const,
        userAgent: navigator.userAgent,
        description: error_description || error,
      }).catch(() => {
        // Silently fail - recording failed logins should never break the login page
      });
    }
  }, [error, error_description, recordFailedLogin]);

  // Build a user-friendly error message
  const errorMessage = error_description || (error ? `Authentication failed: ${error}` : undefined);

  // Don't render the login form if already signed in (waiting for redirect)
  if (isLoaded && isSignedIn) {
    return null;
  }

  return (
    <AuthPageLayout
      title="Sign In"
      description="Sign in to access your account."
    >
      {errorMessage && (
        <div className="mb-4 border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {errorMessage}
        </div>
      )}
      <OAuthButtons mode="signin" />
      <AuthDivider />
      <LoginForm returnTo={safeReturnTo} />
    </AuthPageLayout>
  );
}
