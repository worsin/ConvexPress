/**
 * Auth Context Provider
 *
 * Provides the current user, their role, and permission check functions
 * to all admin components. This is the client-side equivalent of WordPress's
 * `current_user_can()` function.
 *
 * The provider fetches the current user via `api.users.getCurrentUser` and
 * reads their effective role via `api.users.getCurrentRoleAccess`. Management
 * session ceilings apply before capabilities reach the UI.
 *
 * IMPORTANT: Client-side checks are for UI convenience only.
 * The backend `requireCan()` is the actual security boundary.
 */

import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { hasCapability } from "./admin-shell/capabilities";
import { matchesPageAccess, pageAccessCandidates } from "./page-access";

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

  const [refresh, setRefresh] = useState(0);
  const access = useQuery(api.users.getCurrentRoleAccess, { refresh });
  const validUntil = access?.validUntil;
  useEffect(() => {
    if (validUntil == null) return;
    // Convex subscriptions react to writes, not the passage of time. Renew at
    // the earliest session/authority/membership boundary, also after sleep.
    let timer: ReturnType<typeof setTimeout>;
    let renewed = false;
    const check = () => {
      if (renewed) return;
      if (Date.now() >= validUntil) {
        renewed = true;
        setRefresh(value => value + 1);
      } else {
        clearTimeout(timer);
        timer = setTimeout(check, Math.min(validUntil - Date.now(), 2_147_483_647));
      }
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [validUntil, access]);
  const isLoading = currentUser === undefined || access === undefined;

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

  // Fail closed while switching identity, renewing an expired display grant,
  // or reacting to an inactive user. Role metadata never grants permissions.
  const roleData = useMemo<RoleData | null>(() => {
    if (!access || !currentUser || currentUser.status !== "active"
      || access.userId !== currentUser._id
      || (access.validUntil !== null && access.validUntil <= Date.now())) return null;
    return access.role;
  }, [access, currentUser, refresh]);

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
