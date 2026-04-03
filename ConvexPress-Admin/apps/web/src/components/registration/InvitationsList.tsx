/**
 * Registration System - Invitations List
 *
 * WordPress equivalent: Table of invitations on the "Users > Add New" page.
 * (WordPress doesn't have this -- ConvexPress enhancement.)
 *
 * Displays all invitations in a table with columns:
 *   Email, Role, Status, Invited By, Sent Date, Expires Date, Actions
 *
 * Status badges: pending (yellow), accepted (green), expired (muted), revoked (red)
 * Actions: Resend (pending only), Revoke (pending only)
 *
 * Real-time: Updates live via Convex reactive subscription.
 *
 * Uses: api.registration.queries.listInvitations
 *       api.registration.mutations.resendInvitation
 *       api.registration.mutations.revokeInvitation
 */

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  LoaderIcon,
  RefreshCwIcon,
  XCircleIcon,
  MailCheckIcon,
  ClockIcon,
  CheckCircle2Icon,
  XIcon,
  AlertCircleIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  isEffectivelyExpired,
}: {
  status: string;
  isEffectivelyExpired?: boolean;
}) {
  // If pending but effectively expired (cron lag), show as expired
  const effectiveStatus = isEffectivelyExpired ? "expired" : status;

  const styles: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    accepted: "bg-success/10 text-success",
    expired: "bg-muted text-muted-foreground",
    revoked: "bg-destructive/10 text-destructive",
  };

  const icons: Record<string, React.ReactNode> = {
    pending: <ClockIcon className="size-3" />,
    accepted: <CheckCircle2Icon className="size-3" />,
    expired: <AlertCircleIcon className="size-3" />,
    revoked: <XIcon className="size-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[10px] font-medium ${styles[effectiveStatus] ?? styles.expired}`}
    >
      {icons[effectiveStatus]}
      {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
    </span>
  );
}

// ─── Date Formatter ────────────────────────────────────────────────────────────

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function InvitationsList() {
  const invitations = useQuery(api.registration.queries.listInvitations, {});
  const resendInvitation = useMutation(
    api.registration.mutations.resendInvitation,
  );
  const revokeInvitation = useMutation(
    api.registration.mutations.revokeInvitation,
  );

  // Revoke confirmation dialog state
  const [revokeTarget, setRevokeTarget] = useState<{
    id: Id<"invitations">;
    email: string;
  } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [resendingId, setResendingId] = useState<Id<"invitations"> | null>(null);

  // ─── Resend Handler ──────────────────────────────────────────────────────

  const handleResend = useCallback(
    async (invitationId: Id<"invitations">, email: string) => {
      setResendingId(invitationId);
      try {
        await resendInvitation({
          invitationId,
        });
        toast.success(`Invitation resent to ${email}`);
      } catch (err: unknown) {
        const errorMessage =
          (err as { data?: { message?: string }; message?: string })?.data?.message ?? err?.message ?? "Failed to resend invitation.";
        toast.error(errorMessage);
      } finally {
        setResendingId(null);
      }
    },
    [resendInvitation],
  );

  // ─── Revoke Handler ─────────────────────────────────────────────────────

  const handleRevokeConfirm = useCallback(async () => {
    if (!revokeTarget) return;

    setIsRevoking(true);
    try {
      await revokeInvitation({
        invitationId: revokeTarget.id,
      });
      toast.success(`Invitation to ${revokeTarget.email} revoked.`);
      setRevokeTarget(null);
    } catch (err: unknown) {
      const errorMessage =
        (err as { data?: { message?: string }; message?: string })?.data?.message ?? err?.message ?? "Failed to revoke invitation.";
      toast.error(errorMessage);
    } finally {
      setIsRevoking(false);
    }
  }, [revokeTarget, revokeInvitation]);

  // ─── Loading State ──────────────────────────────────────────────────────

  if (invitations === undefined) {
    return (
      <div className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Invitations
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  // ─── Empty State ────────────────────────────────────────────────────────

  if (invitations.length === 0) {
    return (
      <div className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Invitations
          </h2>
        </div>
        <div className="p-6 text-center">
          <MailCheckIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            No invitations have been sent yet. Use the form above to invite your
            first user.
          </p>
        </div>
      </div>
    );
  }

  // ─── Table ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Invitations
            <span className="ml-2 text-muted-foreground font-normal">
              ({invitations.length})
            </span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Role
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Invited By
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sent
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Expires
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => {
                const isPending =
                  invitation.status === "pending" &&
                  !invitation.isEffectivelyExpired;
                const isResending = resendingId === invitation._id;

                return (
                  <tr
                    key={invitation._id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    {/* Email */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-foreground">
                        {invitation.email}
                      </span>
                      {invitation.resentCount > 0 && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          (resent {invitation.resentCount}x)
                        </span>
                      )}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs capitalize text-muted-foreground">
                        {invitation.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <StatusBadge
                        status={invitation.status}
                        isEffectivelyExpired={invitation.isEffectivelyExpired}
                      />
                    </td>

                    {/* Invited By */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {invitation.inviterName}
                      </span>
                    </td>

                    {/* Sent Date */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(invitation.createdAt)}
                      </span>
                    </td>

                    {/* Expires Date */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(invitation.expiresAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2.5 text-right">
                      {isPending && (
                        <div className="flex items-center justify-end gap-1">
                          {/* Resend Button */}
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              handleResend(invitation._id, invitation.email)
                            }
                            disabled={isResending}
                            title="Resend invitation"
                          >
                            {isResending ? (
                              <LoaderIcon className="size-3 animate-spin" />
                            ) : (
                              <RefreshCwIcon className="size-3" />
                            )}
                            <span className="sr-only">Resend</span>
                          </Button>

                          {/* Revoke Button */}
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              setRevokeTarget({
                                id: invitation._id,
                                email: invitation.email,
                              })
                            }
                            title="Revoke invitation"
                          >
                            <XCircleIcon className="size-3 text-destructive" />
                            <span className="sr-only">Revoke</span>
                          </Button>
                        </div>
                      )}

                      {invitation.status === "accepted" &&
                        invitation.acceptedUserName && (
                          <span className="text-[10px] text-muted-foreground">
                            Accepted by {invitation.acceptedUserName}
                          </span>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevokeConfirm}
        title="Revoke Invitation?"
        message={`This will cancel the invitation to ${revokeTarget?.email ?? "this user"}. The invitation link will no longer work. You can create a new invitation later.`}
        confirmLabel="Revoke"
        destructive
        isExecuting={isRevoking}
      />
    </>
  );
}
