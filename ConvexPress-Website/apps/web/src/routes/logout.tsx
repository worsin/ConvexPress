import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useClerk } from "@/lib/auth/clerk";
import { useEffect } from "react";

import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";
import CoreAuthLogout from "@/templates/packs/core/surfaces/auth.logout";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/logout")({
  head: () => buildRestrictedPageHead({
    title: siteTitled("Signing Out"),
    path: "/logout",
  }),
  component: LogoutComponent,
});

/**
 * Logout action route.
 *
 * Calls signOut() from Clerk on mount, then redirects to the homepage.
 * Provides a dedicated URL for logout that can be linked from emails, admin
 * apps, etc.
 */
function LogoutComponent() {
  const { signOut } = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    const performLogout = async () => {
      try {
        await signOut();
      } catch {
        // signOut may redirect or throw -- either way, navigate to home
      }
      navigate({ to: "/" } as any);
    };

    performLogout();
  }, [signOut, navigate]);

  return <Surface name="auth.logout" data={{}} fallback={CoreAuthLogout} />;
}
