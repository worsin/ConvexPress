import { useEffect } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useAuth } from "@/lib/auth/clerk";
import { z } from "zod";

import { REGISTER_PATH, siteSignUpPath } from "@/lib/auth/signUpPath";

import { isAbsoluteDestination, sanitizeRedirectUrl } from "@/lib/security/redirect";
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
  // Someone arriving without an invitation or a flow to return to starts on
  // the site's own sign-up page, when it names one.
  loaderDeps: ({ search }) => ({ invited: Boolean(search.token), returning: Boolean(search.returnTo) }),
  loader: async ({ context: { queryClient }, deps }) => {
    if (deps.invited || deps.returning) return;
    const settings = await queryClient
      .ensureQueryData(convexQuery(api.settings.queries.getPublic, {}))
      .catch(() => null);
    const signUpPath = siteSignUpPath(settings?.signUpPath);
    if (signUpPath !== REGISTER_PATH) throw redirect({ href: signUpPath, replace: true });
  },
  component: RegisterComponent,
});

function RegisterComponent() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const { token, returnTo } = Route.useSearch();

  const safeReturnTo = sanitizeRedirectUrl(returnTo);

  // Redirect authenticated users
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      if (isAbsoluteDestination(safeReturnTo)) window.location.assign(safeReturnTo);
      else navigate({ to: safeReturnTo });
    }
  }, [isLoaded, isSignedIn, navigate, safeReturnTo]);

  if (isLoaded && isSignedIn) {
    return null;
  }

  const data: AuthRegisterSurfaceData = { token, returnTo: safeReturnTo };

  return <Surface name="auth.register" data={data} fallback={CoreAuthRegister} />;
}
