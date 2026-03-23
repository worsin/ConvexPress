import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Auth callback route.
 *
 * Clerk handles authentication client-side and does not require a
 * server callback handler like WorkOS did. This route exists as a
 * fallback redirect in case any old links point here.
 */
export const Route = createFileRoute("/api/auth/callback")({
  loader: () => {
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
