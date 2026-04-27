import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  Users,
  Crown,
  Clock,
  AlertTriangle,
  Plus,
  ShieldCheck,
  BarChart3,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute("/_authenticated/_admin/membership/")({
  component: MembershipOverviewPage,
});

// ─── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div
          className={`rounded-xl p-2.5 ${accent ?? "bg-muted text-muted-foreground"}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────

function PlanStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    draft: "bg-amber-100 text-amber-800",
    archived: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

// ─── Create Plan Form ──────────────────────────────────────────────────────

function CreatePlanForm({ onClose }: { onClose: () => void }) {
  const createPlan = useMutation(
    (api as any).membership.mutations.createPlan,
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [grantMode, setGrantMode] = useState("manual");
  const [priority, setPriority] = useState("10");
  const [submitting, setSubmitting] = useState(false);

  function generateSlug(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required.");
      return;
    }
    setSubmitting(true);
    try {
      await createPlan({
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        grantMode: grantMode as any,
        priority: Number(priority) || 10,
      });
      toast.success("Membership plan created");
      onClose();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create plan",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold">Create Membership Plan</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Plans start as drafts. Activate them from the plans page.
      </p>

      <div className="mt-5 grid gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Plan Title
          </label>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slug || slug === generateSlug(title)) {
                setSlug(generateSlug(e.target.value));
              }
            }}
            placeholder="Premium Membership"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Slug
          </label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="premium-membership"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="A short description of what this plan includes..."
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Grant Mode
            </label>
            <select
              value={grantMode}
              onChange={(e) => setGrantMode(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            >
              <option value="manual">Manual</option>
              <option value="subscription">Subscription</option>
              <option value="purchase">Purchase</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Priority
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Creating..." : "Create Plan"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function MembershipOverviewPage() {
  const stats = useQuery((api as any).membership.queries.getStats, {}) as
    | {
        totalPlans: number;
        activePlans: number;
        totalGrants: number;
        activeGrants: number;
        graceGrants: number;
        revokedGrants: number;
        expiredGrants: number;
        expiringSoon: number;
        totalRestrictionRules: number;
        planBreakdown: Array<{
          planId: string;
          title: string;
          slug: string;
          activeMembers: number;
        }>;
      }
    | undefined;

  const plans = useQuery((api as any).membership.queries.listPlans, {}) as
    | Array<{
        _id: string;
        title: string;
        slug: string;
        status: string;
        grantMode: string;
        priority: number;
        description?: string;
        benefitCount: number;
        activeGrantCount: number;
        createdAt: number;
      }>
    | undefined;

  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Membership</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage membership plans, grants, content restrictions, and member
            access across the site.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreatePlanForm onClose={() => setShowCreateForm(false)} />
      )}

      {/* Stats grid */}
      {stats === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active Members"
            value={stats.activeGrants}
            icon={Users}
            accent="bg-emerald-100 text-emerald-700"
          />
          <StatCard
            label="Active Plans"
            value={stats.activePlans}
            icon={Crown}
            accent="bg-purple-100 text-purple-700"
          />
          <StatCard
            label="Expiring Soon"
            value={stats.expiringSoon}
            icon={Clock}
            accent="bg-amber-100 text-amber-700"
          />
          <StatCard
            label="Grace Period"
            value={stats.graceGrants}
            icon={AlertTriangle}
            accent="bg-orange-100 text-orange-700"
          />
        </div>
      )}

      {/* Plans breakdown - mini chart */}
      {stats && stats.planBreakdown.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Members by Plan
            </h2>
          </div>
          <div className="space-y-3">
            {stats.planBreakdown.map((plan) => {
              const maxMembers = Math.max(
                ...stats.planBreakdown.map((p) => p.activeMembers),
                1,
              );
              const pct = Math.round((plan.activeMembers / maxMembers) * 100);
              return (
                <div key={plan.planId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {plan.title}
                    </span>
                    <span className="text-muted-foreground">
                      {plan.activeMembers} member
                      {plan.activeMembers === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plans table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Membership Plans</h2>
          <Link
            to="/membership/plans"
            className="text-sm font-medium text-primary hover:underline"
          >
            Manage Plans
          </Link>
        </div>

        <div className="grid grid-cols-[1fr_100px_120px_100px_120px_120px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <div>Plan</div>
          <div>Status</div>
          <div>Grant Mode</div>
          <div>Priority</div>
          <div>Benefits</div>
          <div>Members</div>
        </div>

        {plans === undefined ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No membership plans created yet. Create your first plan to get
              started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {plans.map((plan) => (
              <div
                key={plan._id}
                className="grid grid-cols-[1fr_100px_120px_100px_120px_120px] gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {plan.title}
                  </p>
                  {plan.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </div>
                <div>
                  <PlanStatusBadge status={plan.status} />
                </div>
                <div className="text-sm text-muted-foreground">
                  {plan.grantMode}
                </div>
                <div className="text-sm text-muted-foreground">
                  {plan.priority}
                </div>
                <div className="text-sm text-muted-foreground">
                  {plan.benefitCount}
                </div>
                <div className="text-sm font-medium text-foreground">
                  {plan.activeGrantCount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary stats row */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Total Grants
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {stats.totalGrants}
            </p>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span>{stats.activeGrants} active</span>
              <span>{stats.revokedGrants} revoked</span>
              <span>{stats.expiredGrants} expired</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Total Plans
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {stats.totalPlans}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {stats.activePlans} active, {stats.totalPlans - stats.activePlans}{" "}
              draft/archived
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Restriction Rules
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {stats.totalRestrictionRules}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Content access rules in effect
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
