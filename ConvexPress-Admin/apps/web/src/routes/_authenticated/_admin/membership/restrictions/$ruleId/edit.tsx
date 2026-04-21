/**
 * Edit an existing membership restriction rule.
 *
 * Loads the rule via `listRestrictions` and filters client-side (there is no
 * single-rule query). Uses the shared `RestrictionRuleBuilder` and saves via
 * `updateRestrictionRule`. Supports destructive delete with an inline confirm.
 */

import { useEffect, useMemo, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  RestrictionRuleBuilder,
  type RestrictionRuleDraft,
} from "@/components/membership/RestrictionRuleBuilder";
import type { ResourceType } from "@/components/membership/ResourcePicker";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/restrictions/$ruleId/edit",
)({
  component: EditRestrictionPage,
});

type RuleMode = "allow_only" | "deny_if_missing";
type TeaserMode = "hide" | "excerpt" | "custom_message";

type EnrichedRule = {
  _id: Id<"membership_restriction_rules">;
  resourceType: ResourceType;
  resourceIdOrKey: string;
  ruleMode: RuleMode;
  planIds: Id<"membership_plans">[];
  requiredCapabilities?: string[];
  teaserMode: TeaserMode;
  customMessage?: string;
  loginRequired: boolean;
  createdAt: number;
  updatedAt: number;
  plans: Array<{
    _id: Id<"membership_plans">;
    title: string;
    slug: string;
  }>;
};

function EditRestrictionPage() {
  const { ruleId } = useParams({
    from: "/_authenticated/_admin/membership/restrictions/$ruleId/edit",
  });
  const navigate = useNavigate();

  const rules = useQuery(
    (api as any).membership.queries.listRestrictions,
    {},
  ) as EnrichedRule[] | null | undefined;

  const rule = useMemo(() => {
    if (!rules) return null;
    return rules.find((r) => String(r._id) === ruleId) ?? null;
  }, [rules, ruleId]);

  const [draft, setDraft] = useState<RestrictionRuleDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hydrate draft when rule loads
  useEffect(() => {
    if (rule && !draft) {
      setDraft({
        resourceType: rule.resourceType,
        resourceIdOrKey: rule.resourceIdOrKey,
        resourceLabel: "",
        ruleMode: rule.ruleMode,
        planIds: rule.planIds,
        requiredCapabilities: rule.requiredCapabilities ?? [],
        teaserMode: rule.teaserMode,
        customMessage: rule.customMessage ?? "",
        loginRequired: rule.loginRequired,
      });
    }
  }, [rule, draft]);

  const update = useMutation(
    (api as any).membership.mutations.updateRestrictionRule,
  );
  const deleteRule = useMutation(
    (api as any).membership.mutations.deleteRestrictionRule,
  );

  function validate(d: RestrictionRuleDraft): string | null {
    if (!d.resourceIdOrKey.trim()) {
      return "Pick a resource for this rule.";
    }
    if (d.planIds.length === 0 && d.requiredCapabilities.length === 0) {
      return "Select at least one plan, or add a required capability.";
    }
    if (d.teaserMode === "custom_message" && !d.customMessage.trim()) {
      return "Enter a custom message for the blocked-content card.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const error = validate(draft);
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    try {
      await update({
        ruleId: ruleId as Id<"membership_restriction_rules">,
        resourceType: draft.resourceType,
        resourceIdOrKey: draft.resourceIdOrKey.trim(),
        ruleMode: draft.ruleMode,
        planIds: draft.planIds,
        requiredCapabilities:
          draft.requiredCapabilities.length > 0
            ? draft.requiredCapabilities
            : [],
        teaserMode: draft.teaserMode,
        customMessage:
          draft.teaserMode === "custom_message"
            ? draft.customMessage.trim()
            : "",
        loginRequired: draft.loginRequired,
      });
      toast.success("Rule updated");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update rule",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteRule({
        ruleId: ruleId as Id<"membership_restriction_rules">,
      });
      toast.success("Rule deleted");
      navigate({ to: "/membership/restrictions" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete rule",
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // Plugin disabled
  if (rules === null) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Membership plugin is disabled.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Enable the membership plugin in Plugins to manage restrictions.
        </p>
      </div>
    );
  }

  // Loading
  if (rules === undefined || !draft) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  // Not found
  if (!rule) {
    return (
      <div className="space-y-4">
        <Link
          to="/membership/restrictions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to restrictions
        </Link>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Rule not found.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            It may have been deleted. Return to the list to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            to="/membership/restrictions"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to restrictions
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Edit Rule</h1>
          <p className="text-sm text-muted-foreground">
            Adjust which plans satisfy this rule and how blocked visitors are
            treated.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/membership/restrictions" })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <RestrictionRuleBuilder value={draft} onChange={setDraft} />
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">
              Delete rule
            </h2>
            <p className="text-xs text-muted-foreground">
              Removes this restriction. Resources that were gated by this rule
              will become publicly accessible.
            </p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Deleting..." : "Confirm delete"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-background px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete rule
            </button>
          )}
        </div>
      </section>
    </form>
  );
}
