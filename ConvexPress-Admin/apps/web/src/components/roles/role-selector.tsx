/**
 * Role Selector Component
 *
 * A dropdown/select component for choosing a role. Used on:
 * - Add New User form (defaults to the default role / Subscriber)
 * - Edit User form (shows current role, allows changing)
 *
 * Fetches roles from Convex and renders them sorted by level descending.
 * WordPress equivalent: wp_dropdown_roles()
 */

import { useId, useMemo } from "react";
import {
  roleCompatibleWithIdentity,
  CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION,
  type RoleAssignmentTarget,
} from "@backend/lib/auth/roleAssignment";
import { useQuery } from "convex-helpers/react/cache";

import { api } from "@backend/convex/_generated/api";

import { cn } from "@/lib/utils";

interface RoleSelectorProps {
  /** Currently selected role ID */
  value: string;
  /** Called when a role is selected */
  onChange: (roleId: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** HTML id for the select element */
  id?: string;
  /** Additional CSS classes */
  className?: string;
  /** Existing account identity. Omit only for a new account whose source is not selected here. */
  assignmentTarget?: RoleAssignmentTarget;
  assignmentTargets?: readonly RoleAssignmentTarget[];
  valueKey?: "_id" | "slug";
  allowedSlugs?: readonly string[];
}

export function RoleSelector({
  value,
  onChange,
  disabled = false,
  id,
  className,
  assignmentTarget,
  assignmentTargets,
  valueKey = "_id",
  allowedSlugs,
}: RoleSelectorProps) {
  const roles = useQuery(api.roles.queries.listRoles);
  const explanationId = useId();
  const targets =
    assignmentTargets ?? (assignmentTarget ? [assignmentTarget] : undefined);
  const customerOnly =
    targets !== undefined &&
    (targets.length === 0 ||
      targets.some(
        (target) => !roleCompatibleWithIdentity(target, { type: "internal" }),
      ));

  const sortedRoles = useMemo(() => {
    if (!roles) return [];
    // Already sorted by level desc from the query
    return roles.filter(
      (role) =>
        role.status === "active" &&
        (!customerOnly || role.type === "customer") &&
        (!allowedSlugs || allowedSlugs.includes(role.slug)),
    );
  }, [roles, customerOnly, allowedSlugs]);

  const isLoading = roles === undefined;

  const unavailableSelection =
    !isLoading &&
    !!value &&
    !sortedRoles.some((role) => role[valueKey] === value);

  return (
    <>
      <select
        id={id}
        value={value}
        aria-describedby={customerOnly ? explanationId : undefined}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
        className={cn(
          "h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground",
          "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {unavailableSelection && (
          <option value={value} disabled>
            Current role is unavailable for this account
          </option>
        )}
        {!isLoading && !value && (
          <option value="" disabled>
            Select a role
          </option>
        )}
        {isLoading ? (
          <option>Loading roles...</option>
        ) : (
          sortedRoles.map(
            (role: {
              _id: string;
              name: string;
              slug: string;
              level: number;
              isDefault: boolean;
            }) => (
              <option key={role._id} value={role[valueKey]}>
                {role.name}
                {role.isDefault ? " (Default)" : ""} &mdash; Level {role.level}
              </option>
            ),
          )
        )}
      </select>
      {customerOnly && (
        <p id={explanationId} className="mt-2 text-xs text-muted-foreground">
          {CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION}
        </p>
      )}
    </>
  );
}

/**
 * Hook to get the default role ID.
 * Useful for pre-selecting the default role on Add New User forms.
 */
export function useDefaultRoleId(): string | undefined {
  const defaultRole = useQuery(api.roles.queries.getDefaultRole);
  return defaultRole?._id;
}
