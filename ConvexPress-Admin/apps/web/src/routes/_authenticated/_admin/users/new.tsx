import { createFileRoute } from "@tanstack/react-router";

import { InviteUserForm } from "@/components/registration/InviteUserForm";
import { InvitationsList } from "@/components/registration/InvitationsList";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/users/new")({
  component: AddNewUserPage,
});

/**
 * Add New User page.
 *
 * WordPress equivalent: `user-new.php` (Users > Add New).
 *
 * Displays the invitation form for administrators to invite new users,
 * followed by a table of all existing invitations with resend/revoke actions.
 *
 * Auth: Authenticated + Administrator role (enforced by mutations/queries).
 */
function AddNewUserPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/users/new">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Add New User</h1>
        </div>

        {/* Invite User Form */}
        <InviteUserForm />

        {/* Invitations List */}
        <InvitationsList />
      </div>
    </RoutePermissionGuard>
  );
}
