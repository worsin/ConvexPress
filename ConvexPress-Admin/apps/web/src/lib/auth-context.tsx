/**
 * Auth Context Provider
 *
 * Provides the current user, their role, and permission check functions
 * to all admin components. This is the client-side equivalent of WordPress's
 * `current_user_can()` function.
 *
 * The provider fetches the current user via `api.users.getCurrentUser` and
 * resolves their role via `api.roles.queries.getRole`. The role's capabilities
 * and pageAccess arrays drive all client-side permission checks.
 *
 * IMPORTANT: Client-side checks are for UI convenience only.
 * The backend `requireCan()` is the actual security boundary.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { hasCapability } from "./admin-shell/capabilities";

const LEGACY_ROLE_SLUG_MAP: Record<string, string> = {
  admin: "administrator",
  editor: "editor",
  author: "author",
  contributor: "contributor",
  support: "editor",
  customer: "subscriber",
};

function pageAccessCandidates(path: string): string[] {
  const cleanPath = path.split("?")[0]?.split("#")[0] || "/";
  const withLeadingSlash = cleanPath.startsWith("/")
    ? cleanPath
    : `/${cleanPath}`;

  if (withLeadingSlash === "/") return ["/", "/admin"];
  if (withLeadingSlash.startsWith("/admin")) return [withLeadingSlash];

  return [withLeadingSlash, `/admin${withLeadingSlash}`];
}

function matchesPageAccess(path: string, allowed: string): boolean {
  const normalizedAllowed = allowed.endsWith("/")
    ? allowed.slice(0, -1)
    : allowed;

  if (normalizedAllowed.endsWith("/*")) {
    const prefix = normalizedAllowed.slice(0, -2);
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  return path === normalizedAllowed || path.startsWith(`${normalizedAllowed}/`);
}

// --- Types ---

interface AuthContextValue {
  /** Current user document (null if not loaded or not authenticated) */
  user: UserData | null;
  /** Current user's role document (null if not loaded) */
  role: RoleData | null;
  /** Whether auth data is still loading */
  isLoading: boolean;
  /**
   * Check if the current user has a specific capability.
   * Returns false if loading or not authenticated.
   */
  can: (capability: string) => boolean;
  /**
   * Check if the current user can access a specific admin route.
   * Uses prefix matching on the role's pageAccess array.
   */
  canAccessRoute: (path: string) => boolean;
}

interface UserData {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  profilePictureUrl?: string;
  roleId?: string;
  internalRole?: string;
  isInternal?: boolean;
  status: string;
}

interface RoleData {
  _id: string;
  name: string;
  slug: string;
  level: number;
  type: string;
  capabilities: string[];
  pageAccess: string[];
  status: string;
}

// --- Context ---

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  isLoading: true,
  can: () => false,
  canAccessRoute: () => false,
});

// --- Provider ---

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Step 1: Fetch the current authenticated user from Convex
  const currentUser = useQuery(api.users.getCurrentUser);

  // Step 2: Resolve role via roleId first, then legacy internalRole slug fallback.
  const userRoleId = (currentUser as UserData | null | undefined)?.roleId;
  const internalRole = (currentUser as UserData | null | undefined)?.internalRole;
  const legacyRoleSlug =
    internalRole && internalRole.length > 0
      ? (LEGACY_ROLE_SLUG_MAP[internalRole] ?? internalRole)
      : null;

  const roleById = useQuery(
    api.roles.queries.getRole,
    userRoleId
      ? { roleId: userRoleId as Id<"roles"> }
      : "skip",
  );
  const roleBySlug = useQuery(
    api.roles.queries.getRoleBySlug,
    !userRoleId && legacyRoleSlug
      ? { slug: legacyRoleSlug }
      : "skip",
  );

  // Determine loading state:
  // - currentUser === undefined means the user query hasn't resolved yet
  // - roleById/roleBySlug === undefined means the active role query hasn't resolved yet
  const isResolvingRoleById =
    userRoleId !== undefined &&
    userRoleId !== null &&
    roleById === undefined;
  const isResolvingRoleBySlug =
    !userRoleId &&
    !!legacyRoleSlug &&
    roleBySlug === undefined;
  const isLoading =
    currentUser === undefined ||
    isResolvingRoleById ||
    isResolvingRoleBySlug;

  const resolvedRole = roleById ?? roleBySlug;

  // Map the current user to our UserData shape.
  // The Convex query returns the full user document; we extract the fields we need.
  const userData = useMemo<UserData | null>(() => {
    if (!currentUser) return null;
    // Use a typed record to access fields safely
    const u = currentUser as Record<string, unknown>;
    return {
      _id: u._id as string,
      email: u.email as string,
      firstName: u.firstName as string | undefined,
      lastName: u.lastName as string | undefined,
      displayName: u.displayName as string | undefined,
      profilePictureUrl: u.profilePictureUrl as string | undefined,
      roleId: u.roleId as string | undefined,
      internalRole: u.internalRole as string | undefined,
      isInternal: u.isInternal as boolean | undefined,
      status: u.status as string,
    };
  }, [currentUser]);

  // Map the role document to our RoleData shape.
  // The Convex query returns the full role document; we extract the fields we need.
  const roleData = useMemo<RoleData | null>(() => {
    if (!resolvedRole) return null;
    const r = resolvedRole as Record<string, unknown>;
    // Only use active roles -- inactive roles deny all permissions
    if (r.status !== "active") return null;
    return {
      _id: r._id as string,
      name: r.name as string,
      slug: r.slug as string,
      level: r.level as number,
      type: r.type as string,
      capabilities: (r.capabilities as string[]) ?? [],
      pageAccess: (r.pageAccess as string[]) ?? [],
      status: r.status as string,
    };
  }, [resolvedRole]);

  const value = useMemo<AuthContextValue>(() => {
    const can = (capability: string): boolean => {
      if (!roleData) return false;
      return hasCapability(roleData.capabilities, capability);
    };

    const canAccessRoute = (path: string): boolean => {
      if (!roleData) return false;
      const candidates = pageAccessCandidates(path);
      return roleData.pageAccess.some((allowed) =>
        candidates.some((candidate) => matchesPageAccess(candidate, allowed)),
      );
    };

    return {
      user: userData,
      role: roleData,
      isLoading,
      can,
      canAccessRoute,
    };
  }, [userData, roleData, isLoading]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

// --- Hooks ---

/**
 * Access the full auth context.
 */
export function useAuth() {
  return useContext(AuthContext);
}
