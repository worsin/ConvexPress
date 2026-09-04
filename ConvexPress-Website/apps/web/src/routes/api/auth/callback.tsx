import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { OAUTH_RETURN_TO_KEY } from "@/components/auth/OAuthButtons";
import { AuthenticateWithRedirectCallback, useClerkActive } from "@/lib/auth/clerk";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";

/**
 * OAuth / SSO callback.
 *
 * Clerk redirects here after the provider. `AuthenticateWithRedirectCallback`
 * finishes the exchange: a returning user is signed in; a first-time user is
 * transferred into a sign-up, and if Clerk still needs fields (username,
 * consent, …) it sends them to `/register`, which continues the sign-up.
 */
export const Route = createFileRoute("/api/auth/callback")({
  head: () => buildRestrictedPageHead({ title: siteTitled("Signing In"), path: "/api/auth/callback" }),
  component: AuthCallback,
});

function AuthCallback() {
  const active = useClerkActive();
  const [returnTo, setReturnTo] = useState("/dashboard");

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(OAUTH_RETURN_TO_KEY);
      if (stored) setReturnTo(sanitizeRedirectUrl(stored, { fallbackPath: "/dashboard" }));
    } catch {
      // storage unavailable
    }
  }, []);

  useEffect(() => {
    if (active) return;
    const timer = setTimeout(() => window.location.assign("/login"), 1200);
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <AuthPageLayout title="Signing you in" showLogo={false}>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="size-5 animate-spin rounded-none border-2 border-muted border-t-primary" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">Finishing sign-in with your provider…</p>
      </div>
      {active && (
        <AuthenticateWithRedirectCallback
          signInFallbackRedirectUrl={returnTo}
          signUpFallbackRedirectUrl={returnTo}
          continueSignUpUrl="/register"
          signInUrl="/login"
          signUpUrl="/register"
        />
      )}
    </AuthPageLayout>
  );
}
