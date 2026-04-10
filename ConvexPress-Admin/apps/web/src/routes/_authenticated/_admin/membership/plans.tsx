import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/plans",
)({
  component: MembershipPlansPage,
});

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

// ─── Edit Plan Form ────────────────────────────────────────────────────────

function EditPlanForm({
  plan,
  onClose,
}: {
  plan: {
    _id: string;
    title: string;
    slug: string;
    status: string;
    grantMode: string;
    priority: number;
    description?: string;
  };
  onClose: () => void;
}) {
  const updatePlan = useMutation(
    (api as any).membership.mutations.updatePlan,
  );
  const [title, setTitle] = useState(plan.title);
  const [slug, setSlug] = useState(plan.slug);
  const [description, setDescription] = useState(plan.description ?? "");
  const [status, setStatus] = useState(plan.status);
  const [grantMode, setGrantMode] = useState(plan.grantMode);
  const [priority, setPriority] = useState(String(plan.priority));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required.");
      return;
    }
    setSubmitting(true);
    try {
      await updatePlan({
        planId: plan._id as any,
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        status: status as any,
        grantMode: grantMode as any,
        priority: Number(priority) || 10,
      });
      toast.success("Plan updated");
      onClose();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update plan",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-primary/20 bg-primary/5 p-5"
    >
      <h3 className="text-sm font-semibold">Edit Plan</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Slug
          </label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Grant Mode
          </label>
          <select
            value={grantMode}
            onChange={(e) => setGrantMode(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
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
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function MembershipPlansPage() {
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

  const deletePlan = useMutation(
    (api as any).membership.mutations.deletePlan,
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(planId: string) {
    try {
      await deletePlan({ planId: planId as any });
      toast.success("Plan deleted");
      setDeletingId(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete plan",
      );
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Membership Plans</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Create and manage membership plans. Plans define access tiers with
          benefits and content restrictions.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[1fr_100px_120px_80px_100px_100px_80px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <div>Plan</div>
          <div>Status</div>
          <div>Grant Mode</div>
          <div>Priority</div>
          <div>Benefits</div>
          <div>Members</div>
          <div>Actions</div>
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
              No plans yet. Use the Create Plan button on the membership
              dashboard to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {plans.map((plan) => (
              <div key={plan._id}>
                <div className="grid grid-cols-[1fr_100px_120px_80px_100px_100px_80px] gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(
                          expandedId === plan._id ? null : plan._id,
                        )
                      }
                      className="flex items-center gap-2 text-left"
                    >
                      {expandedId === plan._id ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {plan.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          /{plan.slug}
                        </p>
                      </div>
                    </button>
                  </div>
                  <div className="flex items-center">
                    <PlanStatusBadge status={plan.status} />
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    {plan.grantMode}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    {plan.priority}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    {plan.benefitCount}
                  </div>
                  <div className="flex items-center text-sm font-medium text-foreground">
                    {plan.activeGrantCount}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingId(
                          editingId === plan._id ? null : plan._id,
                        )
                      }
                      title="Edit"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {plan.activeGrantCount === 0 && (
                      <button
                        type="button"
                        onClick={() => setDeletingId(plan._id)}
                        title="Delete"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === plan._id && (
                  <div className="border-t border-border/50 bg-muted/20 px-5 py-4">
                    <div className="grid gap-4 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Description
                        </p>
                        <p className="mt-1 text-foreground">
                          {plan.description || "No description"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Created
                        </p>
                        <p className="mt-1 text-foreground">
                          {new Date(plan.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Active Members
                        </p>
                        <p className="mt-1 text-foreground">
                          {plan.activeGrantCount} active, {plan.benefitCount}{" "}
                          benefits configured
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit form */}
                {editingId === plan._id && (
                  <div className="border-t border-border px-5 py-4">
                    <EditPlanForm
                      plan={plan}
                      onClose={() => setEditingId(null)}
                    />
                  </div>
                )}

                {/* Delete confirmation */}
                {deletingId === plan._id && (
                  <div className="border-t border-red-200 bg-red-50 px-5 py-4">
                    <p className="text-sm text-red-800">
                      Are you sure you want to delete{" "}
                      <strong>{plan.title}</strong>? This cannot be undone.
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={() => void handleDelete(plan._id)}
                        className="inline-flex rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
