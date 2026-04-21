/**
 * Grants list — admin view.
 *
 * Status tabs (all / active / grace / revoked / expired), plan filter,
 * text search on user email/display name, paginated list with bulk revoke.
 */

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  ShieldCheck,
  ShieldOff,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/grants/",
)({
  component: MembershipGrantsPage,
});

type GrantStatus = "active" | "grace" | "revoked" | "expired";

type EnrichedGrant = {
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
  user?: {
    _id: Id<"users">;
    email?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    avatarUrl?: string;
  } | null;
  plan?: {
    _id: Id<"membership_plans">;
    title: string;
    slug: string;
  } | null;
};

const STATUS_TABS: Array<{ id: "all" | GrantStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "grace", label: "Grace" },
  { id: "revoked", label: "Revoked" },
  { id: "expired", label: "Expired" },
];

function MembershipGrantsPage() {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<"all" | GrantStatus>("all");
  const [planFilter, setPlanFilter] = useState<Id<"membership_plans"> | "all">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkReason, setBulkReason] = useState("");

  const grants = useQuery((api as any).membership.queries.listGrants, {
    status: statusFilter === "all" ? undefined : statusFilter,
    planId: planFilter === "all" ? undefined : planFilter,
    limit: 500,
  }) as EnrichedGrant[] | null | undefined;

  const plans = useQuery((api as any).membership.queries.listPlans, {}) as
    | Array<{ _id: Id<"membership_plans">; title: string; slug: string }>
    | null
    | undefined;

  const revokeMutation = useMutation(
    (api as any).membership.mutations.revokeMembership,
  );

  const pluginDisabled = grants === null;

  const filtered = useMemo(() => {
    if (!grants) return [];
    const q = search.trim().toLowerCase();
    if (!q) return grants;
    return grants.filter((g) => {
      const u = g.user;
      if (!u) return false;
      const haystack = [
        u.email,
        u.displayName,
        u.firstName,
        u.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [grants, search]);

  function toggleOne(grantId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(grantId)) next.delete(grantId);
      else next.add(grantId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((g) => g._id)));
    }
  }

  async function handleBulkRevoke() {
    if (selected.size === 0) return;
    let succeeded = 0;
    let failed = 0;
    for (const id of selected) {
      try {
        await revokeMutation({
          grantId: id as Id<"membership_grants">,
          reason: bulkReason.trim() || undefined,
        });
        succeeded++;
      } catch {
        failed++;
      }
    }
    if (succeeded > 0) {
      toast.success(`Revoked ${succeeded} grant${succeeded === 1 ? "" : "s"}`);
    }
    if (failed > 0) {
      toast.error(
        `${failed} grant${failed === 1 ? "" : "s"} could not be revoked`,
      );
    }
    setSelected(new Set());
    setBulkConfirm(false);
    setBulkReason("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Membership Grants
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manual and subscription-driven membership grants. Bulk revoke
            selected grants or drill into a single grant for extend or
            metadata review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/membership/grants/new" })}
          disabled={pluginDisabled}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          New grant
        </button>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <ShieldOff className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The membership plugin is disabled. Enable it under{" "}
            <Link
              to="/membership/settings"
              className="font-medium text-foreground hover:underline"
            >
              Membership → Settings
            </Link>
            .
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Grant status"
              className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
            >
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <select
              value={planFilter}
              onChange={(e) =>
                setPlanFilter(
                  (e.target.value as Id<"membership_plans">) || "all",
                )
              }
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground"
            >
              <option value="all">All plans</option>
              {plans?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.title}
                </option>
              ))}
            </select>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by user email or name..."
                className="w-full rounded-xl border border-border bg-background py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {selected.size} selected
              </p>
              {bulkConfirm ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void handleBulkRevoke()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                  >
                    <Trash2 className="h-3 w-3" />
                    Confirm revoke
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkConfirm(false);
                      setBulkReason("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkConfirm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                  >
                    <Trash2 className="h-3 w-3" />
                    Revoke selected
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[40px_1.5fr_1fr_80px_100px_120px_80px] items-center gap-3 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={
                    filtered.length > 0 && selected.size === filtered.length
                  }
                  onChange={toggleAll}
                  className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>User</div>
              <div>Plan</div>
              <div>Status</div>
              <div>Source</div>
              <div>Expires</div>
              <div className="text-right">Actions</div>
            </div>

            {grants === undefined ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No grants match the current filters.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((grant) => (
                  <li
                    key={grant._id}
                    className={cn(
                      "grid grid-cols-[40px_1.5fr_1fr_80px_100px_120px_80px] items-center gap-3 px-5 py-3",
                      selected.has(grant._id) && "bg-primary/5",
                    )}
                  >
                    <div>
                      <input
                        type="checkbox"
                        aria-label={`Select grant ${grant._id}`}
                        checked={selected.has(grant._id)}
                        onChange={() => toggleOne(grant._id)}
                        className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {grant.user?.displayName ||
                          grant.user?.email ||
                          "Unknown user"}
                      </p>
                      {grant.user?.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {grant.user.email}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {grant.plan?.title ?? "—"}
                      </p>
                      {grant.plan?.slug && (
                        <p className="truncate text-xs text-muted-foreground">
                          /{grant.plan.slug}
                        </p>
                      )}
                    </div>
                    <div>
                      <GrantStatusBadge status={grant.status} />
                    </div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {grant.sourceType}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {grant.endsAt
                        ? new Date(grant.endsAt).toLocaleDateString()
                        : "Never"}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to="/membership/grants/$grantId"
                        params={{ grantId: grant._id }}
                        title="Open grant"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
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
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}
