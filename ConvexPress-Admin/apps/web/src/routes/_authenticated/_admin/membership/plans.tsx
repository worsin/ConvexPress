import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Plus,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/plans",
)({
  component: MembershipPlansPage,
});

type Plan = {
  _id: Id<"membership_plans">;
  title: string;
  slug: string;
  status: string;
  grantMode: string;
  priority: number;
  description?: string;
  benefitCount: number;
  activeGrantCount: number;
  createdAt: number;
};

// ─── Status Badge ──────────────────────────────────────────────────────────

function PlanStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-primary/15 text-primary",
    draft: "bg-muted text-muted-foreground",
    archived: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

// ─── Create Plan Inline ────────────────────────────────────────────────────

function CreatePlanForm({ onCreated }: { onCreated: () => void }) {
  const createPlan = useMutation(
    (api as any).membership.mutations.createPlan,
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [grantMode, setGrantMode] = useState("manual");
  const [priority, setPriority] = useState("10");
  const [submitting, setSubmitting] = useState(false);

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
        grantMode: grantMode as
          | "manual"
          | "subscription"
          | "purchase"
          | "hybrid",
        priority: Number(priority) || 10,
      });
      toast.success("Plan created (draft)");
      setTitle("");
      setSlug("");
      setDescription("");
      setGrantMode("manual");
      setPriority("10");
      onCreated();
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
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold">Create a plan</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        New plans are created as drafts. Publish from the plan editor when
        ready.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Premium Members"
          />
        </Field>
        <Field label="Slug" required>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={inputClass}
            placeholder="premium"
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={cn(inputClass, "h-auto py-2.5")}
            placeholder="Short description shown on pricing cards."
          />
        </Field>
        <Field label="Grant mode">
          <select
            value={grantMode}
            onChange={(e) => setGrantMode(e.target.value)}
            className={inputClass}
          >
            <option value="manual">Manual</option>
            <option value="subscription">Subscription</option>
            <option value="purchase">Purchase</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Priority">
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-4">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {submitting ? "Creating..." : "Create draft plan"}
        </button>
      </div>
    </form>
  );
}

// ─── Delete Confirmation ───────────────────────────────────────────────────

function DeleteConfirm({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: Plan;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-destructive/30 bg-destructive/5 px-5 py-4">
      <p className="text-sm text-destructive">
        Delete plan <strong>{plan.title}</strong>? This cannot be undone.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function MembershipPlansPage() {
  const navigate = useNavigate();
  const plans = useQuery((api as any).membership.queries.listPlans, {}) as
    | Plan[]
    | null
    | undefined;

  const deletePlan = useMutation(
    (api as any).membership.mutations.deletePlan,
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleDelete(planId: Id<"membership_plans">) {
    try {
      await deletePlan({ planId });
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

  const pluginDisabled = plans === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Membership Plans
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Create and manage membership plans. Plans define access tiers with
            benefits and content restrictions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          disabled={pluginDisabled}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {showCreate ? "Close" : "New plan"}
        </button>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The membership plugin is disabled. Enable it under{" "}
            <Link
              to="/membership/settings"
              className="font-medium text-foreground hover:underline"
            >
              Membership → Settings
            </Link>{" "}
            to manage plans.
          </p>
        </div>
      )}

      {!pluginDisabled && showCreate && (
        <CreatePlanForm onCreated={() => setShowCreate(false)} />
      )}

      {!pluginDisabled && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1fr_100px_120px_80px_100px_100px_120px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Plan</div>
            <div>Status</div>
            <div>Grant Mode</div>
            <div>Priority</div>
            <div>Benefits</div>
            <div>Members</div>
            <div className="text-right">Actions</div>
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
                No plans yet. Click “New plan” to create one.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {plans.map((plan) => (
                <div key={plan._id}>
                  <div className="grid grid-cols-[1fr_100px_120px_80px_100px_100px_120px] items-center gap-4 px-5 py-4">
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
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({
                            to: "/membership/plans/$planId/edit",
                            params: { planId: plan._id },
                          })
                        }
                        title="Edit plan"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {plan.activeGrantCount === 0 && (
                        <button
                          type="button"
                          onClick={() => setDeletingId(plan._id)}
                          title="Delete plan"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

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
                            Active members
                          </p>
                          <p className="mt-1 text-foreground">
                            {plan.activeGrantCount} active ·{" "}
                            {plan.benefitCount} benefits configured
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {deletingId === plan._id && (
                    <DeleteConfirm
                      plan={plan}
                      onConfirm={() => void handleDelete(plan._id)}
                      onCancel={() => setDeletingId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
