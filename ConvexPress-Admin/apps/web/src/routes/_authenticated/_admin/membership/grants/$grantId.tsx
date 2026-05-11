/**
 * Grant detail — shows full grant metadata plus revoke / extend actions.
 *
 * Extend requires a non-empty reason (enforced server-side).
 * Revoke moves the grant to a terminal state.
 */

import { useMemo, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  Clock,
  History,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  UserRound,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/grants/$grantId",
)({
  component: GrantDetailPage,
});

type GrantStatus = "active" | "grace" | "revoked" | "expired";

interface EnrichedGrant {
  _id: Id<"membership_grants">;
  userId: Id<"users">;
  planId: Id<"membership_plans">;
  status: GrantStatus;
  sourceType: "manual" | "subscription" | "purchase" | "import";
  sourceRef?: string;
  startsAt: number;
  endsAt?: number;
  graceEndsAt?: number;
  revokedAt?: number;
  createdAt: number;
  updatedAt?: number;
  metadata?: Record<string, unknown> & {
    adminNotes?: string;
    revokeReason?: string;
    lastExtendReason?: string;
    lastExtendedAt?: number;
    history?: Array<{
      action?: string;
      at?: number;
      priorEndsAt?: number | null;
      newEndsAt?: number;
      reason?: string;
    }>;
  };
  user?: {
    _id: Id<"users">;
    email?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  } | null;
  plan?: {
    _id: Id<"membership_plans">;
    title: string;
    slug: string;
  } | null;
}

function GrantDetailPage() {
  const { grantId } = Route.useParams();
  const navigate = useNavigate();

  // We reuse listGrants + filter client-side so we get user/plan enrichment
  // in a single query without adding a new backend endpoint.
  const allGrants = useQuery((api as any).membership.queries.listGrants, {
    limit: 500,
  }) as EnrichedGrant[] | null | undefined;

  const grant = useMemo(() => {
    if (!allGrants) return allGrants;
    return allGrants.find((g) => g._id === grantId) ?? null;
  }, [allGrants, grantId]);

  const revokeMutation = useMutation(
    (api as any).membership.mutations.revokeMembership,
  );
  const extendMutation = useMutation(
    (api as any).membership.mutations.extendGrant,
  );

  const [showRevoke, setShowRevoke] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  const [extendDate, setExtendDate] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [extending, setExtending] = useState(false);

  if (allGrants === null) {
    return (
      <div className="space-y-4">
        <Link
          to="/membership/grants"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to grants
        </Link>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <ShieldOff className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The membership plugin is disabled.
          </p>
        </div>
      </div>
    );
  }

  if (allGrants === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="space-y-4">
        <Link
          to="/membership/grants"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to grants
        </Link>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Grant not found.</p>
        </div>
      </div>
    );
  }

  const grantRecord = grant;
  const isTerminal =
    grantRecord.status === "revoked" || grantRecord.status === "expired";

  async function handleRevoke() {
    setRevoking(true);
    try {
      await revokeMutation({
        grantId: grantRecord._id,
        reason: revokeReason.trim() || undefined,
      });
      toast.success("Grant revoked");
      setShowRevoke(false);
      setRevokeReason("");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to revoke",
      );
    } finally {
      setRevoking(false);
    }
  }

  async function handleExtend(e: React.FormEvent) {
    e.preventDefault();
    if (!extendDate) {
      toast.error("Pick a new expiry date.");
      return;
    }
    if (!extendReason.trim()) {
      toast.error("A non-empty reason is required.");
      return;
    }
    setExtending(true);
    try {
      await extendMutation({
        grantId: grantRecord._id,
        newExpiresAt: new Date(extendDate).getTime(),
        reason: extendReason.trim(),
      });
      toast.success("Grant extended");
      setExtendDate("");
      setExtendReason("");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to extend",
      );
    } finally {
      setExtending(false);
    }
  }

  const history = grant.metadata?.history ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            to="/membership/grants"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to grants
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Grant detail</h1>
          <p className="text-sm text-muted-foreground">
            Issued on {new Date(grant.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GrantStatusBadge status={grant.status} />
          {!isTerminal && (
            <button
              type="button"
              onClick={() => setShowRevoke(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <ShieldAlert className="h-4 w-4" />
              Revoke
            </button>
          )}
        </div>
      </div>

      {/* Revoke confirmation */}
      {showRevoke && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
          <h2 className="text-sm font-semibold text-destructive">
            Revoke this grant?
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This sets the grant to{" "}
            <span className="font-medium text-foreground">revoked</span> and is
            irreversible. The user will lose access immediately.
          </p>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Reason (optional, stored in metadata)
            </label>
            <input
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Refund issued on ticket #1234"
              className={inputClass}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={revoking}
              className="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
            >
              {revoking ? "Revoking..." : "Confirm revoke"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRevoke(false);
                setRevokeReason("");
              }}
              disabled={revoking}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Summary */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <SummaryRow
              icon={<UserRound className="h-4 w-4 text-muted-foreground" />}
              label="Member"
            >
              {grant.user ? (
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {grant.user.displayName ||
                      grant.user.email ||
                      "Unknown"}
                  </span>
                  {grant.user.email && (
                    <span className="text-xs text-muted-foreground">
                      {grant.user.email}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Unknown user</span>
              )}
            </SummaryRow>
            <SummaryRow
              icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
              label="Plan"
            >
              {grant.plan ? (
                <Link
                  to="/membership/plans/$planId/edit"
                  params={{ planId: grant.plan._id }}
                  className="font-medium text-foreground hover:underline"
                >
                  {grant.plan.title}
                </Link>
              ) : (
                <span className="text-muted-foreground">Unknown plan</span>
              )}
            </SummaryRow>
            <SummaryRow
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
              label="Starts"
            >
              <span className="text-foreground">
                {new Date(grant.startsAt).toLocaleString()}
              </span>
            </SummaryRow>
            <SummaryRow
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              label="Expires"
            >
              <span className="text-foreground">
                {grant.endsAt
                  ? new Date(grant.endsAt).toLocaleString()
                  : "Never"}
              </span>
            </SummaryRow>
            {grant.graceEndsAt && (
              <SummaryRow
                icon={
                  <Clock className="h-4 w-4 text-muted-foreground" />
                }
                label="Grace ends"
              >
                <span className="text-foreground">
                  {new Date(grant.graceEndsAt).toLocaleString()}
                </span>
              </SummaryRow>
            )}
            {grant.revokedAt && (
              <SummaryRow
                icon={
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                }
                label="Revoked"
              >
                <span className="text-foreground">
                  {new Date(grant.revokedAt).toLocaleString()}
                </span>
              </SummaryRow>
            )}
            <SummaryRow
              icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
              label="Source"
            >
              <span className="capitalize text-foreground">
                {grant.sourceType}
                {grant.sourceRef ? ` · ${grant.sourceRef}` : ""}
              </span>
            </SummaryRow>
          </dl>

          {(grant.metadata?.adminNotes ||
            grant.metadata?.revokeReason ||
            grant.metadata?.lastExtendReason) && (
            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              {grant.metadata?.adminNotes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Admin notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-foreground">
                    {grant.metadata.adminNotes}
                  </p>
                </div>
              )}
              {grant.metadata?.revokeReason && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Revoke reason
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-foreground">
                    {grant.metadata.revokeReason}
                  </p>
                </div>
              )}
              {grant.metadata?.lastExtendReason && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Last extend reason
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-foreground">
                    {grant.metadata.lastExtendReason}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Extend */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Extend grant</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Push the expiry forward. A reason is required for the audit trail.
            Revoked and expired grants cannot be extended.
          </p>
          {isTerminal ? (
            <p className="mt-4 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              This grant is in a terminal state. Create a new grant instead.
            </p>
          ) : (
            <form
              onSubmit={(e) => void handleExtend(e)}
              className="mt-4 space-y-3"
            >
              <Field label="New expiry date" required>
                <input
                  type="datetime-local"
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Reason" required>
                <input
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  className={inputClass}
                  placeholder="Extended one month for churn save"
                />
              </Field>
              <button
                type="submit"
                disabled={extending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                <CalendarPlus className="h-4 w-4" />
                {extending ? "Extending..." : "Extend grant"}
              </button>
            </form>
          )}
        </section>

        {/* History */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            History
          </h2>
          {history.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No extend history yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {history
                .slice()
                .reverse()
                .map((entry, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-border bg-background p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {entry.action ?? "change"}
                      </span>
                      {entry.at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {entry.newEndsAt && (
                      <p className="mt-1 text-xs text-foreground">
                        Ends at: {new Date(entry.newEndsAt).toLocaleString()}
                        {entry.priorEndsAt &&
                          ` (was ${new Date(entry.priorEndsAt).toLocaleString()})`}
                      </p>
                    )}
                    {entry.reason && (
                      <p className="mt-1 text-xs text-foreground">
                        Reason: {entry.reason}
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="min-w-0 flex-1 text-right text-sm text-foreground">
          {children}
        </dd>
      </div>
    </div>
  );
}

function GrantStatusBadge({ status }: { status: GrantStatus }) {
  const styles: Record<GrantStatus, string> = {
    active: "bg-primary/15 text-primary",
    grace: "bg-warning/15 text-warning",
    revoked: "bg-destructive/10 text-destructive",
    expired: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  label,
  required,
  helper,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {helper && (
        <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}
