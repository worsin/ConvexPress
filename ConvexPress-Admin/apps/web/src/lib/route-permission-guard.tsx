/**
 * Route Permission Guard
 *
 * A component-level permission guard that checks if the current user
 * has access to a specific admin route using the AuthContext.
 *
 * This replaces the non-functional beforeLoad permission checks that
 * couldn't work because router context runs before React renders.
 *
 * Usage:
 * ```tsx
 * function PostsPage() {
 *   return (
 *     <RoutePermissionGuard requiredAccess="/admin/posts">
 *       <PostListTable />
 *     </RoutePermissionGuard>
 *   );
 * }
 * ```
 */

import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAuth } from "./auth-context";
import Loader from "@/components/loader";

interface RoutePermissionGuardProps {
  /** The route path to check access for (e.g., "/admin/posts") */
  requiredAccess: string;
  /** Content to render if access is granted */
  children: ReactNode;
  /** Optional: redirect path if access denied (defaults to /dashboard) */
  redirectTo?: string;
}

/**
 * Guards route content based on the user's pageAccess permissions.
 *
 * - Shows loader while auth is loading
 * - Redirects to dashboard if access is denied
 * - Renders children if access is granted
 */
export function RoutePermissionGuard({
  requiredAccess,
  children,
  redirectTo = "/dashboard",
}: RoutePermissionGuardProps) {
  const { canAccessRoute, isLoading } = useAuth();
  const navigate = useNavigate();

  const hasAccess = canAccessRoute(requiredAccess);

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      void navigate({
        to: redirectTo,
        search: { error: "insufficient_permissions" },
      });
    }
  }, [isLoading, hasAccess, navigate, redirectTo]);

  // Still loading auth state
  if (isLoading) {
    return <Loader />;
  }

  // Access denied - will redirect via useEffect
  if (!hasAccess) {
    return null;
  }

  // Access granted
  return <>{children}</>;
}
