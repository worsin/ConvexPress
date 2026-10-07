import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, useRouter } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useAuth } from "@/lib/auth/clerk";
import { NotFoundPage } from "@/components/blog/NotFoundPage";

// An anonymous SSR denial is not a decision about the hydrated customer.
// Keep the retry bound to this router, session and URL, including across the
// not-found boundary's remount during invalidation. Nothing is stored outside
// the current router's memory.
const attempted = new WeakMap<object, { key: string; completion: Promise<void> }>();

function useFormRouteRecovery() {
  const auth = useAuth(), convexAuth = useConvexAuth();
  const router = useRouter(), queryClient = useQueryClient();
  const { pathname } = useLocation();
  const params = useParams({ strict: false }) as { slug?: string; token?: string };
  // The marketing layout may own the denial before its form child mounts.
  // Its route context has no slug/token params, so use the matched form path.
  const match = /^\/forms\/([^/]+)(?:\/resume\/([^/]+))?\/?$/.exec(pathname);
  let slug = params.slug, token = params.token;
  try { slug ??= match?.[1] && decodeURIComponent(match[1]); token ??= match?.[2] && decodeURIComponent(match[2]); } catch { slug = undefined; }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const ready = auth.isLoaded && !convexAuth.isLoading && Boolean(auth.isSignedIn) === convexAuth.isAuthenticated;
  const key = JSON.stringify([auth.userId, auth.sessionId, pathname]);
  const needsRetry = ready && auth.isSignedIn && !!slug && attempted.get(router)?.key !== key;

  useEffect(() => {
    if (!ready || !auth.isSignedIn || !slug) return;
    let active = true;
    setPending(true); setError(false);
    // ensureQueryData otherwise reuses the anonymous null hydrated from SSR.
    // Evict only this form's reads and the enclosing route access decision.
    let attempt = attempted.get(router);
    if (attempt?.key !== key) {
      const reads = [
        convexQuery((api as any).extensions.forms.queries.getBySlug, { slug }),
        convexQuery(api.membership.queries.checkAccess, { resourceType: "route", resourceIdOrKey: pathname }),
        ...(token ? [convexQuery((api as any).extensions.forms.queries.resume, { token })] : []),
      ];
      for (const read of reads) queryClient.removeQueries({ queryKey: read.queryKey, exact: true });
      attempt = { key, completion: Promise.resolve().then(() => router.invalidate()).then(() => undefined) };
      attempted.set(router, attempt);
    }
    void attempt.completion.catch(() => { if (active) setError(true); }).finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [ready, auth.isSignedIn, slug, token, key, pathname, router, queryClient]);

  return { loading: !ready || needsRetry || pending, error };
}

/** Recheck a Forms denial owned by the parent marketing layout, keeping its
 * ordinary membership notice visible until current authority permits entry. */
export function FormRouteAuthRecovery() {
  useFormRouteRecovery();
  return null;
}

export function FormRouteNotFound() {
  const { loading, error } = useFormRouteRecovery();
  if (loading) return <p role="status">Loading form…</p>;
  if (error) return <p role="status">The form could not be loaded. Please reload to try again.</p>;
  return <NotFoundPage />;
}
