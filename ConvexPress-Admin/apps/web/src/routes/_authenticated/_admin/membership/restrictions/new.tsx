/**
 * Create a new membership restriction rule.
 *
 * Uses the shared `RestrictionRuleBuilder`. On save, calls
 * `api.membership.mutations.createRestrictionRule` and routes to the rule's
 * edit screen for review.
 */

import { useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import {
  RestrictionRuleBuilder,
  makeDefaultRuleDraft,
  type RestrictionRuleDraft,
} from "@/components/membership/RestrictionRuleBuilder";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/restrictions/new",
)({
  component: NewRestrictionPage,
});

function NewRestrictionPage() {
  const navigate = useNavigate();

  const [draft, setDraft] = useState<RestrictionRuleDraft>(() =>
    makeDefaultRuleDraft("post"),
  );
  const [submitting, setSubmitting] = useState(false);

  const create = useMutation(
    (api as any).membership.mutations.createRestrictionRule,
  );

  function validate(): string | null {
    if (!draft.resourceIdOrKey.trim()) {
      return "Pick a resource for this rule.";
    }
    if (draft.planIds.length === 0 && draft.requiredCapabilities.length === 0) {
      return "Select at least one plan, or add a required capability.";
    }
    if (
      draft.teaserMode === "custom_message" &&
      !draft.customMessage.trim()
    ) {
      return "Enter a custom message for the blocked-content card.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    try {
      const ruleId = await create({
        resourceType: draft.resourceType,
        resourceIdOrKey: draft.resourceIdOrKey.trim(),
        ruleMode: draft.ruleMode,
        planIds: draft.planIds,
        requiredCapabilities:
          draft.requiredCapabilities.length > 0
            ? draft.requiredCapabilities
            : undefined,
        teaserMode: draft.teaserMode,
        customMessage:
          draft.teaserMode === "custom_message"
            ? draft.customMessage.trim()
            : undefined,
        loginRequired: draft.loginRequired,
      });

      toast.success("Rule created");
      navigate({
        to: "/membership/restrictions/$ruleId/edit",
        params: { ruleId: String(ruleId) },
      });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create rule",
      );
    } finally {
      setSubmitting(false);
    }
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
          <h1 className="text-3xl font-bold tracking-tight">New Rule</h1>
          <p className="text-sm text-muted-foreground">
            Gate a post, page, product, route, or reusable block behind one or
            more membership plans.
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
            {submitting ? "Creating..." : "Create rule"}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <RestrictionRuleBuilder value={draft} onChange={setDraft} />
      </section>
    </form>
  );
}
