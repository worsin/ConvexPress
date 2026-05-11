import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useClerk } from "@clerk/clerk-react";
import { useEffect } from "react";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";

export const Route = createFileRoute("/logout")({
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex",
      },
      {
        title: "Signing Out - ConvexPress",
      },
    ],
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

  return (
    <AuthPageLayout title="Signing Out" showLogo={false}>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="size-5 animate-spin rounded-none border-2 border-muted border-t-primary" />
        <p className="text-xs text-muted-foreground">
          Signing you out...
        </p>
      </div>
    </AuthPageLayout>
  );
}
