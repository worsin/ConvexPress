/**
 * RestrictionMetabox — right-rail metabox for post/page edit screens.
 *
 * Shows the current restriction rule (if any) for this resource and lets the
 * admin edit it inline. Saves via
 * api.membership.mutations.upsertRestrictionRuleForResource.
 *
 * Renders a thin placeholder when the membership plugin is disabled, so the
 * metabox does not disappear on navigation but also never fails if the
 * backend is off.
 */

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { Save, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  RestrictionRuleBuilder,
  makeDefaultRuleDraft,
  type RestrictionRuleDraft,
} from "./RestrictionRuleBuilder";
import type { ResourceType } from "./ResourcePicker";

interface RestrictionMetaboxProps {
  resourceType: ResourceType;
  resourceIdOrKey: string;
  /** Display label for this resource (e.g., post title). */
  resourceLabel?: string;
}

interface ExistingRule {
  _id: Id<"membership_restriction_rules">;
  resourceType: ResourceType;
  resourceIdOrKey: string;
  ruleMode: "allow_only" | "deny_if_missing";
  planIds: Id<"membership_plans">[];
  requiredCapabilities?: string[];
  teaserMode: "hide" | "excerpt" | "custom_message";
  customMessage?: string;
  loginRequired: boolean;
  plans?: Array<{ _id: Id<"membership_plans">; title: string; slug: string }>;
}

export function RestrictionMetabox({
  resourceType,
  resourceIdOrKey,
  resourceLabel,
}: RestrictionMetaboxProps) {
  const existingRules = useQuery(
    (api as any).membership.queries.listRestrictionsByResource,
    resourceIdOrKey
      ? { resourceType, resourceIdOrKey }
      : "skip",
  ) as ExistingRule[] | null | undefined;

  const upsertRule = useMutation(
    (api as any).membership.mutations.upsertRestrictionRuleForResource,
  );
  const deleteRule = useMutation(
    (api as any).membership.mutations.deleteRestrictionRule,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<RestrictionRuleDraft>(
    makeDefaultRuleDraft(resourceType),
  );
  const [submitting, setSubmitting] = useState(false);

  // Sync draft when existing rule changes.
  const existing = existingRules && existingRules.length > 0 ? existingRules[0] : null;
  useEffect(() => {
    if (existing) {
      setDraft({
        resourceType: existing.resourceType,
        resourceIdOrKey: existing.resourceIdOrKey,
        resourceLabel,
        ruleMode: existing.ruleMode,
        planIds: existing.planIds ?? [],
        requiredCapabilities: existing.requiredCapabilities ?? [],
        teaserMode: existing.teaserMode,
        customMessage: existing.customMessage ?? "",
        loginRequired: existing.loginRequired,
      });
    } else {
      setDraft({
        ...makeDefaultRuleDraft(resourceType),
        resourceIdOrKey,
        resourceLabel,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?._id, resourceIdOrKey, resourceType]);

  // Query returns null when the membership plugin is disabled.
  const pluginDisabled = existingRules === null;

  if (pluginDisabled) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Membership plugin disabled. Enable it in{" "}
          <span className="font-medium">Settings → Plugins</span> to gate this
          resource.
        </span>
      </div>
    );
  }

  if (!resourceIdOrKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Save this {resourceType} first to set membership restrictions.
      </p>
    );
  }

  if (existingRules === undefined) {
    return <div className="h-20 animate-pulse rounded-xl bg-muted" />;
  }

  async function handleSave() {
    if (draft.planIds.length === 0) {
      toast.error("Select at least one plan to require.");
      return;
    }
    setSubmitting(true);
    try {
      await upsertRule({
        resourceType: draft.resourceType,
        resourceIdOrKey,
        ruleMode: draft.ruleMode,
        planIds: draft.planIds,
        requiredCapabilities:
          draft.requiredCapabilities.length > 0
            ? draft.requiredCapabilities
            : undefined,
        teaserMode: draft.teaserMode,
        customMessage:
          draft.teaserMode === "custom_message" && draft.customMessage
            ? draft.customMessage
            : undefined,
        loginRequired: draft.loginRequired,
      });
      toast.success(existing ? "Restriction updated" : "Restriction saved");
      setIsEditing(false);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save restriction",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!existing) return;
    try {
      await deleteRule({ ruleId: existing._id });
      toast.success("Restriction removed");
      setIsEditing(false);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to remove restriction",
      );
    }
  }

  if (!isEditing) {
    return (
      <div className="space-y-3">
        {existing ? (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Members-only
              </p>
            </div>
            <dl className="space-y-1 text-xs">
              <Row label="Mode">
                {existing.ruleMode === "allow_only"
                  ? "Allow only"
                  : "Deny if missing"}
              </Row>
              <Row label="Plans">
                {existing.plans && existing.plans.length > 0
                  ? existing.plans.map((p) => p.title).join(", ")
                  : "—"}
              </Row>
              <Row label="When blocked">
                {existing.teaserMode === "hide"
                  ? "Hide content"
                  : existing.teaserMode === "excerpt"
                    ? "Show excerpt"
                    : "Custom message"}
              </Row>
              {existing.loginRequired && (
                <Row label="Login">Required</Row>
              )}
            </dl>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No membership restrictions applied. This {resourceType} is public.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {existing ? "Edit restriction" : "Add restriction"}
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RestrictionRuleBuilder
        value={draft}
        onChange={setDraft}
        lockResource
        disabled={submitting}
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={submitting || draft.planIds.length === 0}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            (submitting || draft.planIds.length === 0) && "opacity-60",
          )}
        >
          <Save className="h-3 w-3" />
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          disabled={submitting}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-right text-foreground">
        {children}
      </dd>
    </div>
  );
}
