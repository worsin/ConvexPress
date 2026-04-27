/**
 * Full-page editor for a membership plan.
 *
 * Tabs:
 *   - Basics: title/slug/description/status/grantMode/priority
 *   - Benefits: inline list editor (code/label/description/display-as-feature)
 *   - Capabilities: role linkage and capability array
 *   - Subscription Link: linkedSubscriptionCode
 */

import { useEffect, useMemo, useState } from "react";
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
  Save,
  Trash2,
  Plus,
  GripVertical,
  Check,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/plans/$planId/edit",
)({
  component: EditMembershipPlanPage,
});

type PlanStatus = "draft" | "active" | "archived";
type GrantMode = "manual" | "subscription" | "purchase" | "hybrid";

interface BenefitDraft {
  _id?: Id<"membership_plan_benefits">;
  /** Local-only key for React */
  key: string;
  code: string;
  label: string;
  description?: string;
  displayAsFeature?: boolean;
}

const TABS = [
  { id: "basics", label: "Basics" },
  { id: "benefits", label: "Benefits" },
  { id: "capabilities", label: "Capabilities" },
  { id: "subscription", label: "Subscription Link" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function EditMembershipPlanPage() {
  const { planId } = Route.useParams();
  const navigate = useNavigate();

  const plan = useQuery((api as any).membership.queries.getPlan, {
    planId: planId as Id<"membership_plans">,
  }) as
    | {
        _id: Id<"membership_plans">;
        title: string;
        slug: string;
        description?: string;
        status: PlanStatus;
        grantMode: GrantMode;
        linkedSubscriptionCode?: string;
        linkedRoleId?: Id<"roles">;
        linkedCapabilities?: string[];
        priority: number;
        benefits: Array<{
          _id: Id<"membership_plan_benefits">;
          code: string;
          label: string;
          description?: string;
          displayAsFeature?: boolean;
        }>;
        linkedRole?: { _id: Id<"roles">; name: string; slug: string } | null;
      }
    | null
    | undefined;

  const roles = useQuery((api as any).roles.queries.listRoles, {}) as
    | Array<{
        _id: Id<"roles">;
        name: string;
        slug: string;
        level?: number;
      }>
    | undefined;

  const updatePlan = useMutation(
    (api as any).membership.mutations.updatePlan,
  );

  const [tab, setTab] = useState<TabId>("basics");

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<PlanStatus>("draft");
  const [grantMode, setGrantMode] = useState<GrantMode>("manual");
  const [priority, setPriority] = useState<string>("10");
  const [linkedRoleId, setLinkedRoleId] = useState<Id<"roles"> | "">("");
  const [linkedCapabilitiesText, setLinkedCapabilitiesText] = useState("");
  const [linkedSubscriptionCode, setLinkedSubscriptionCode] =
    useState<string>("");
  const [benefits, setBenefits] = useState<BenefitDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate form when plan loads
  useEffect(() => {
    if (!plan) return;
    setTitle(plan.title ?? "");
    setSlug(plan.slug ?? "");
    setDescription(plan.description ?? "");
    setStatus(plan.status);
    setGrantMode(plan.grantMode);
    setPriority(String(plan.priority ?? 10));
    setLinkedRoleId(plan.linkedRoleId ?? "");
    setLinkedCapabilitiesText(
      (plan.linkedCapabilities ?? []).join("\n"),
    );
    setLinkedSubscriptionCode(plan.linkedSubscriptionCode ?? "");
    setBenefits(
      (plan.benefits ?? []).map((b, i) => ({
        _id: b._id,
        key: b._id ?? `benefit-${i}`,
        code: b.code,
        label: b.label,
        description: b.description,
        displayAsFeature: b.displayAsFeature,
      })),
    );
  }, [plan]);

  const linkedCapabilities = useMemo(
    () =>
      linkedCapabilitiesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [linkedCapabilitiesText],
  );

  if (plan === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (plan === null) {
    return (
      <div className="space-y-4">
        <Link
          to="/membership/plans"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to plans
        </Link>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Plan not found or membership plugin is disabled.
          </p>
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required.");
      return;
    }
    // Validate benefits have non-empty code & label
    for (const b of benefits) {
      if (!b.code.trim() || !b.label.trim()) {
        toast.error("Each benefit needs a code and label.");
        return;
      }
    }
    setSubmitting(true);
    try {
      await updatePlan({
        planId: planId as Id<"membership_plans">,
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        status,
        grantMode,
        priority: Number(priority) || 10,
        linkedRoleId: linkedRoleId ? (linkedRoleId as Id<"roles">) : undefined,
        linkedCapabilities:
          linkedCapabilities.length > 0 ? linkedCapabilities : undefined,
        linkedSubscriptionCode: linkedSubscriptionCode.trim() || undefined,
        benefits: benefits.map((b) => ({
          _id: b._id,
          code: b.code.trim(),
          label: b.label.trim(),
          description: b.description?.trim() || undefined,
          displayAsFeature: b.displayAsFeature,
        })),
      });
      toast.success("Plan saved");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save plan",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function addBenefit() {
    setBenefits((prev) => [
      ...prev,
      {
        key: `new-${prev.length}-${Date.now()}`,
        code: "",
        label: "",
        description: "",
        displayAsFeature: true,
      },
    ]);
  }

  function updateBenefit(key: string, patch: Partial<BenefitDraft>) {
    setBenefits((prev) =>
      prev.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    );
  }

  function removeBenefit(key: string) {
    setBenefits((prev) => prev.filter((b) => b.key !== key));
  }

  function moveBenefit(key: string, direction: -1 | 1) {
    setBenefits((prev) => {
      const idx = prev.findIndex((b) => b.key === key);
      if (idx < 0) return prev;
      const next = idx + direction;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            to="/membership/plans"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to plans
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">
            Edit Plan
          </h1>
          <p className="text-sm text-muted-foreground">
            Update plan metadata, benefits, capability links, and subscription
            bridge.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/membership/plans" })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div
          role="tablist"
          aria-label="Plan sections"
          className="-mb-px flex flex-wrap gap-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {tab === "basics" && (
          <div className="grid gap-5 sm:grid-cols-2">
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
                rows={3}
                className={cn(inputClass, "h-auto py-2.5")}
                placeholder="Short description shown on pricing cards."
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PlanStatus)}
                className={inputClass}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Grant Mode">
              <select
                value={grantMode}
                onChange={(e) => setGrantMode(e.target.value as GrantMode)}
                className={inputClass}
              >
                <option value="manual">Manual</option>
                <option value="subscription">Subscription</option>
                <option value="purchase">Purchase</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </Field>
            <Field
              label="Priority"
              helper="Lower numbers win when a user holds multiple active plans."
            >
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {tab === "benefits" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Benefits</h2>
                <p className="text-xs text-muted-foreground">
                  Marketing lines surfaced on pricing cards and the member
                  dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={addBenefit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                Add benefit
              </button>
            </div>
            {benefits.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No benefits yet.
                </p>
                <button
                  type="button"
                  onClick={addBenefit}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add the first benefit
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {benefits.map((benefit, i) => (
                  <li
                    key={benefit.key}
                    className="relative rounded-xl border border-border bg-background p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-0.5 pt-1">
                        <button
                          type="button"
                          onClick={() => moveBenefit(benefit.key, -1)}
                          disabled={i === 0}
                          aria-label="Move benefit up"
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                          <GripVertical className="h-4 w-4 rotate-90" />
                        </button>
                      </div>
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <Field label="Code" required>
                          <input
                            value={benefit.code}
                            onChange={(e) =>
                              updateBenefit(benefit.key, {
                                code: e.target.value,
                              })
                            }
                            className={inputClass}
                            placeholder="early_access"
                          />
                        </Field>
                        <Field label="Label" required>
                          <input
                            value={benefit.label}
                            onChange={(e) =>
                              updateBenefit(benefit.key, {
                                label: e.target.value,
                              })
                            }
                            className={inputClass}
                            placeholder="Early access"
                          />
                        </Field>
                        <Field
                          label="Description"
                          className="sm:col-span-2"
                        >
                          <textarea
                            value={benefit.description ?? ""}
                            onChange={(e) =>
                              updateBenefit(benefit.key, {
                                description: e.target.value,
                              })
                            }
                            rows={2}
                            className={cn(inputClass, "h-auto py-2")}
                            placeholder="Read new posts 24 hours before the public."
                          />
                        </Field>
                        <label className="inline-flex items-center gap-2 sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={!!benefit.displayAsFeature}
                            onChange={(e) =>
                              updateBenefit(benefit.key, {
                                displayAsFeature: e.target.checked,
                              })
                            }
                            className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <span className="text-xs text-foreground">
                            Show as a feature bullet on pricing cards
                          </span>
                        </label>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove benefit"
                        onClick={() => removeBenefit(benefit.key)}
                        className="shrink-0 rounded-lg border border-border bg-background p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "capabilities" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold">Linked Role</h2>
              <p className="text-xs text-muted-foreground">
                When set, members on this plan are automatically granted this
                role for the lifetime of the grant.
              </p>
            </div>
            <div className="grid gap-2">
              <RoleOption
                active={linkedRoleId === ""}
                title="No role linkage"
                description="Members keep their existing role."
                onClick={() => setLinkedRoleId("")}
              />
              {roles?.map((role) => (
                <RoleOption
                  key={role._id}
                  active={linkedRoleId === role._id}
                  title={role.name}
                  description={`Slug: ${role.slug}${
                    role.level !== undefined ? ` · Level ${role.level}` : ""
                  }`}
                  onClick={() => setLinkedRoleId(role._id)}
                />
              ))}
            </div>

            <div className="border-t border-border pt-5">
              <h2 className="text-sm font-semibold">
                Capability grants
              </h2>
              <p className="text-xs text-muted-foreground">
                Optional. One capability key per line. Members on this plan
                gain these capabilities on top of their role.
              </p>
              <textarea
                value={linkedCapabilitiesText}
                onChange={(e) => setLinkedCapabilitiesText(e.target.value)}
                rows={6}
                className={cn(
                  "mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs text-foreground",
                )}
                placeholder={"post.view_premium\nforum.post"}
              />
              {linkedCapabilities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {linkedCapabilities.map((cap) => (
                    <span
                      key={cap}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "subscription" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Subscription bridge</h2>
              <p className="text-xs text-muted-foreground">
                When a subscription with this product code activates, a
                membership grant for this plan is issued automatically. The
                bridge is one-way — subscriptions drive memberships, never the
                reverse.
              </p>
            </div>
            <Field
              label="Linked subscription product code"
              helper="Matches Commerce Subscriptions product code (free-form string)."
            >
              <input
                value={linkedSubscriptionCode}
                onChange={(e) => setLinkedSubscriptionCode(e.target.value)}
                className={inputClass}
                placeholder="premium-monthly"
              />
            </Field>
            {grantMode !== "subscription" && grantMode !== "hybrid" && (
              <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                Note: this plan's grant mode is{" "}
                <strong className="font-medium text-foreground">
                  {grantMode}
                </strong>
                . To auto-grant from subscriptions, set grant mode to{" "}
                <em>subscription</em> or <em>hybrid</em> in the Basics tab.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Presentational helpers ───────────────────────────────────────────────

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
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
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

function RoleOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {active && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {description}
        </p>
      </span>
    </button>
  );
}
