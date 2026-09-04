import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";
import { z } from "zod";

import { sanitizeRedirectUrl } from "@/lib/security/redirect";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";
import CoreAuthRegister, { type AuthRegisterSurfaceData } from "@/templates/packs/core/surfaces/auth.register";
import { Surface } from "@/templates/sdk/Surface";

const searchSchema = z.object({
  token: z.string().optional(),
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/register")({
  head: () => buildRestrictedPageHead({
    title: siteTitled("Create Account"),
    path: "/register",
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
      navigate({ to: safeReturnTo } as any);
    }
  }, [isLoaded, isSignedIn, navigate, safeReturnTo]);

  if (isLoaded && isSignedIn) {
    return null;
  }

  const data: AuthRegisterSurfaceData = { token, returnTo: safeReturnTo };

  return <Surface name="auth.register" data={data} fallback={CoreAuthRegister} />;
}
