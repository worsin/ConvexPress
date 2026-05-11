/**
 * Navigation Guard Component
 *
 * Conditionally renders navigation items based on the current user's
 * route access permissions (pageAccess array on their role).
 *
 * Usage:
 *   <NavGuard path="/admin/roles">
 *     <NavItem to="/admin/roles" label="Roles" />
 *   </NavGuard>
 *
 * If the user's role doesn't include the path in its pageAccess array,
 * the children are not rendered.
 */

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

interface NavGuardProps {
  /** The admin route path to check access for */
  path: string;
  /** Children to render if access is granted */
  children: ReactNode;
  /** Optionally check a capability instead of (or in addition to) route access */
  capability?: string;
}

/**
 * Wraps navigation items and conditionally renders them based on
 * the current user's role permissions.
 */
export function NavGuard({ path, children, capability }: NavGuardProps) {
  const { canAccessRoute, can, isLoading } = useAuth();

  // While loading, don't render guarded items
  if (isLoading) return null;

  // Check route access
  if (path && !canAccessRoute(path)) return null;

  // Check capability if specified
  if (capability && !can(capability)) return null;

  return <>{children}</>;
}
