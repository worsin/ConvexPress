import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useAuth } from "@clerk/clerk-react";

import { useCan } from "@/hooks/useCan";

/**
 * Determine whether the admin bar should be shown and provide the "Edit This Page" URL.
 *
 * Admin detection strategy:
 * Uses the `useCan` hook to check for the `manage_options` capability,
 * which is the proper capability-based check via the Role & Capability System.
 *
 * The admin bar shows an "Edit This Page" link when the current route matches
 * a content pattern (blog post or page).
 */
export function useAdminBarVisibility(): {
  showAdminBar: boolean;
  isAdmin: boolean;
  dashboardUrl: string;
  editUrl: string | null;
} {
  const { isSignedIn, isLoaded } = useAuth();
  // Use the proper capability check from the Role & Capability System
  const isAdmin = useCan("manage_options");
  const routerState = useRouterState();
  const adminBaseUrl =
    (import.meta.env.VITE_ADMIN_APP_URL as string | undefined) ??
    "http://localhost:4105";
  const dashboardUrl = `${adminBaseUrl}/dashboard`;
  const pathname = routerState.location.pathname;

  // Match post routes: /blog/:slug
  const postMatch = pathname.match(/^\/blog\/([^/]+)$/);
  const postSlug = postMatch?.[1];
  const post = useQuery(
    api.posts.queries.getPublished,
    postSlug ? { slug: postSlug } : "skip",
  );

  // Match page routes: /page/:slug (single segment) or /page/a/b (nested)
  const pageMatch = pathname.match(/^\/page\/(.+)$/);
  const pagePath = pageMatch ? `/${pageMatch[1]}` : undefined;
  const page = useQuery(
    api.pages.queries.getByPath,
    pagePath ? { path: pagePath } : "skip",
  );

  // Don't show admin bar while loading or if not authenticated
  if (!isLoaded || !isSignedIn) {
    return {
      showAdminBar: false,
      isAdmin: false,
      dashboardUrl,
      editUrl: null,
    };
  }

  let editUrl: string | null = null;
  if (post?._id) {
    editUrl = `${adminBaseUrl}/posts/${post._id}/edit`;
  } else if (page?._id) {
    editUrl = `${adminBaseUrl}/pages/${page._id}/edit`;
  }

  return {
    showAdminBar: isAdmin,
    isAdmin,
    dashboardUrl,
    editUrl,
  };
}
