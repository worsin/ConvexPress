/**
 * Edit User - /admin/users/$userId/edit
 *
 * Admin page for viewing and editing a user's profile, role, and settings.
 * Includes the Password Management System's ResetPasswordButton component
 * for admin-initiated password resets.
 *
 * This route is shared across multiple system experts:
 *   - User Profile System (profile fields, avatar, display name)
 *   - Role & Capability System (role assignment)
 *   - Password Management System (password reset button + status)
 */

import { useCallback, useState, useEffect } from "react";
import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  ShieldIcon,
  LoaderIcon,
  BanIcon,
  CheckCircleIcon,
  Trash2Icon,
  UserCheckIcon,
  ExternalLinkIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResetPasswordButton } from "@/components/password/ResetPasswordButton";
import { RoleSelector } from "@/components/roles/role-selector";
import { UserForm } from "@/components/users/user-form";
import { DeactivateUserDialog } from "@/components/users/deactivate-user-dialog";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { useUpdateUser, useReactivateUser } from "@/hooks/users/useUserMutations";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { SocialLinks, UserPreferences, UserStatus } from "@/lib/users/types";

/** Shape returned by getUser query (enriched user profile) */
interface EnrichedUser {
  _id: Id<"users">;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
  avatarUrl?: string;
  avatarStorageId?: string;
  resolvedAvatarUrl?: string;
  displayName?: string;
  nickname?: string;
  bio?: string;
  url?: string;
  socialLinks?: SocialLinks;
  preferences?: UserPreferences;
  status: UserStatus;
  roleId?: Id<"roles">;
  roleName?: string;
  roleLevel?: number;
  createdAt: number;
  lastLoginAt?: number;
}

export const Route = createFileRoute(
  "/_authenticated/_admin/users/$userId/edit",
)({
  component: EditUserPage,
});

function EditUserPage() {
  const { userId } = useParams({
    from: "/_authenticated/_admin/users/$userId/edit",
  });
  const navigate = useNavigate();

  const typedUserId = userId as Id<"users">;

  // --- Fetch user data ---
  const userData = useQuery(api.profiles.queries.getUser, {
    userId: typedUserId,
  });

  const isLoading = userData === undefined;

  // --- Profile mutation ---
  const updateUser = useUpdateUser();
  const reactivateUser = useReactivateUser();
  const [isSaving, setIsSaving] = useState(false);

  // --- Dialog state ---
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // --- Impersonation ---
  const impersonateAction = useAction(api.authTracking.actions.getImpersonationUrl);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const handleImpersonate = useCallback(async () => {
    setIsImpersonating(true);
    try {
      const result = await impersonateAction({ userId: typedUserId });
      if ("error" in result) {
        toast.error(result.error, { duration: 5000 });
      } else if ("url" in result) {
        // Open the impersonation URL in a new tab
        window.open(result.url, "_blank", "noopener,noreferrer");
        toast.success("Impersonation session opened in a new tab.", {
          duration: 3000,
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to start impersonation";
      toast.error(message);
    } finally {
      setIsImpersonating(false);
    }
  }, [impersonateAction, typedUserId]);

  // --- Role Assignment State ---
  const assignRole = useMutation(api.roles.mutations.assign);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [originalRoleId, setOriginalRoleId] = useState("");
  const [roleReason, setRoleReason] = useState("");
  const [isAssigningRole, setIsAssigningRole] = useState(false);

  // Initialize role selector when user data loads
  useEffect(() => {
    if (userData && userData.roleId && !selectedRoleId) {
      setSelectedRoleId(userData.roleId);
      setOriginalRoleId(userData.roleId);
    }
  }, [userData, selectedRoleId]);

  const roleDirty = selectedRoleId !== "" && selectedRoleId !== originalRoleId;

  const handleAssignRole = useCallback(async () => {
    if (!roleDirty || !selectedRoleId) return;
    setIsAssigningRole(true);
    try {
      await assignRole({
        userId: typedUserId,
        roleId: selectedRoleId as Id<"roles">,
        reason: roleReason.trim() || undefined,
      });
      toast.success("User role updated successfully.");
      setOriginalRoleId(selectedRoleId);
      setRoleReason("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update role";
      toast.error(message);
    } finally {
      setIsAssigningRole(false);
    }
  }, [roleDirty, selectedRoleId, typedUserId, roleReason, assignRole]);

  // --- Profile save handler ---
  const handleSaveProfile = useCallback(
    async (data: {
      nickname: string;
      displayName: string;
      bio: string;
      url: string;
      socialLinks: SocialLinks;
      preferences: UserPreferences;
    }) => {
      setIsSaving(true);
      const success = await updateUser({
        userId: typedUserId,
        nickname: data.nickname || undefined,
        displayName: data.displayName || undefined,
        bio: data.bio || undefined,
        url: data.url || undefined,
        socialLinks: data.socialLinks,
        preferences: data.preferences,
      });
      setIsSaving(false);
      return success;
    },
    [typedUserId, updateUser],
  );

  // --- Reactivate handler ---
  const handleReactivate = useCallback(async () => {
    await reactivateUser({ userId: typedUserId });
  }, [typedUserId, reactivateUser]);

  // --- Loading state ---
  if (isLoading) {
    return (
      <RoutePermissionGuard requiredAccess="/admin/users/edit">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </RoutePermissionGuard>
    );
  }

  // --- Not found ---
  if (!userData) {
    return (
      <RoutePermissionGuard requiredAccess="/admin/users/edit">
        <div className="space-y-4">
          <Link to="/users">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-3.5" />
              <span>Back to Users</span>
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">User not found.</p>
        </div>
      </RoutePermissionGuard>
    );
  }

  const user = userData as EnrichedUser;

  return (
    <RoutePermissionGuard requiredAccess="/admin/users/edit">
      <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Link to="/users" className="shrink-0">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" />
            <span>Back</span>
          </Button>
        </Link>
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            Edit User: {user.displayName || user.email}
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage user profile, role, and account settings.
          </p>
        </div>
      </div>

      {/* User Profile Form */}
      <UserForm
        user={{
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePictureUrl: user.profilePictureUrl,
          avatarUrl: user.avatarUrl,
          avatarStorageId: user.avatarStorageId,
          resolvedAvatarUrl: user.resolvedAvatarUrl,
          displayName: user.displayName,
          nickname: user.nickname,
          bio: user.bio,
          url: user.url,
          socialLinks: user.socialLinks,
          preferences: user.preferences,
          status: user.status,
          roleId: user.roleId,
          roleName: user.roleName,
          roleLevel: user.roleLevel,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        }}
        isSelfProfile={false}
        onSave={handleSaveProfile}
        isSaving={isSaving}
      />

      {/* Role Assignment Section */}
      <section className="border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldIcon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">
            Role Assignment
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Change this user's role. The user will be notified of role changes.
          Changes take effect immediately.
        </p>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="user-role-select"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Role
            </label>
            <RoleSelector
              id="user-role-select"
              value={selectedRoleId}
              onChange={setSelectedRoleId}
            />
          </div>

          {roleDirty && (
            <div>
              <label
                htmlFor="role-change-reason"
                className="block text-xs font-medium text-foreground mb-1"
              >
                Reason for Change (optional)
              </label>
              <textarea
                id="role-change-reason"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="e.g., Promoted to editor"
                rows={2}
                className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50 resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Recorded in the role change audit log.
              </p>
            </div>
          )}

          {roleDirty && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAssignRole}
                disabled={isAssigningRole}
              >
                {isAssigningRole && (
                  <LoaderIcon className="size-3 animate-spin mr-1" />
                )}
                Update Role
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedRoleId(originalRoleId);
                  setRoleReason("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Password Management Section */}
      <section className="border border-border bg-card p-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-foreground">
            Password Management
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Send a password reset email to this user. You cannot view or set
            their password directly.
          </p>
        </div>
        <ResetPasswordButton
          targetUserId={typedUserId}
          targetEmail={user.email}
          targetDisplayName={user.displayName || user.email}
        />
      </section>

      {/* User Impersonation Section */}
      <section className="border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserCheckIcon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">
            User Impersonation
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Sign in as this user to see the site from their perspective. The user
          will not be notified. All actions are logged to the audit trail with
          your identity as the impersonator.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleImpersonate}
            disabled={user.status !== "active" || isImpersonating}
          >
            {isImpersonating ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <UserCheckIcon className="size-3.5" />
            )}
            <span>{isImpersonating ? "Starting session..." : "Impersonate User"}</span>
            {!isImpersonating && <ExternalLinkIcon className="size-3" />}
          </Button>
        </div>
        {user.status !== "active" && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Cannot impersonate inactive or banned users.
          </p>
        )}
        <div className="mt-3 border-t border-border/50 pt-3">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <strong>How it works:</strong> The system generates a one-time
            impersonation URL. You will be signed in as{" "}
            <strong>{user.displayName || user.email}</strong> on the website
            with an impersonation banner visible. The session is time-limited
            and all actions are attributed to your admin account in the audit
            log.
          </p>
        </div>
      </section>

      {/* Account Actions (Deactivate / Reactivate / Delete) */}
      <section className="border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Account Actions
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {user.status === "active" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeactivateDialog(true)}
            >
              <BanIcon className="size-3.5" />
              <span>Deactivate User</span>
            </Button>
          )}

          {user.status === "inactive" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReactivate}
            >
              <CheckCircleIcon className="size-3.5" />
              <span>Reactivate User</span>
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2Icon className="size-3.5" />
            <span>Delete User</span>
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {user.status === "inactive"
            ? "This user is currently deactivated and cannot log in."
            : "Deactivating prevents login. Deleting is permanent."}
        </p>
      </section>

      {/* Deactivate Dialog */}
      {showDeactivateDialog && (
        <DeactivateUserDialog
          open={showDeactivateDialog}
          onClose={() => setShowDeactivateDialog(false)}
          user={user}
          onDeactivated={() => setShowDeactivateDialog(false)}
        />
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <DeleteUserDialog
          open={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          user={user}
          onDeleted={() => {
            setShowDeleteDialog(false);
            navigate({ to: "/users" });
          }}
        />
      )}
      </div>
    </RoutePermissionGuard>
  );
}
