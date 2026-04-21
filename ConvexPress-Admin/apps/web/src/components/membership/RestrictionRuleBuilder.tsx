/**
 * RestrictionRuleBuilder — editor UI for a single membership restriction rule.
 *
 * Composable: used by restrictions/new, restrictions/:ruleId/edit, and
 * RestrictionMetabox on post/page edit screens.
 *
 * Does NOT perform mutations; just emits the current rule state via onChange.
 * Parents are responsible for calling the appropriate create/update mutation.
 */

import { useEffect } from "react";
import { Check, Lock } from "lucide-react";

import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PlanPicker } from "./PlanPicker";
import {
  ResourcePicker,
  type ResourceType,
} from "./ResourcePicker";

export type RuleMode = "allow_only" | "deny_if_missing";
export type TeaserMode = "hide" | "excerpt" | "custom_message";

export interface RestrictionRuleDraft {
  resourceType: ResourceType;
  resourceIdOrKey: string;
  /** Human label for the resource (optional — metadata only, not persisted). */
  resourceLabel?: string;
  ruleMode: RuleMode;
  planIds: Id<"membership_plans">[];
  requiredCapabilities: string[];
  teaserMode: TeaserMode;
  customMessage: string;
  loginRequired: boolean;
}

interface RestrictionRuleBuilderProps {
  value: RestrictionRuleDraft;
  onChange: (next: RestrictionRuleDraft) => void;
  /** When true, the resource picker is locked (used by the metabox). */
  lockResource?: boolean;
  disabled?: boolean;
  /** Show the login required toggle. Default true. */
  showLoginRequired?: boolean;
}

export function RestrictionRuleBuilder({
  value,
  onChange,
  lockResource,
  disabled,
  showLoginRequired = true,
}: RestrictionRuleBuilderProps) {
  // If teaser mode is not custom_message, clear the message field
  useEffect(() => {
    if (value.teaserMode !== "custom_message" && value.customMessage) {
      onChange({ ...value, customMessage: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.teaserMode]);

  return (
    <div className="space-y-6">
      {/* Resource */}
      {!lockResource && (
        <Section
          title="Resource"
          description="Choose what this rule applies to."
        >
          <ResourcePicker
            resourceType={value.resourceType}
            onResourceTypeChange={(resourceType) =>
              onChange({
                ...value,
                resourceType,
                resourceIdOrKey: "",
                resourceLabel: "",
              })
            }
            value={value.resourceIdOrKey}
            displayLabel={value.resourceLabel}
            onChange={(key, label) =>
              onChange({
                ...value,
                resourceIdOrKey: key,
                resourceLabel: label,
              })
            }
            disabled={disabled}
          />
        </Section>
      )}

      {/* Rule mode */}
      <Section
        title="Rule mode"
        description="Choose how plans determine access."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <ModeCard
            active={value.ruleMode === "allow_only"}
            title="Allow only"
            description="Only members on the selected plans can view."
            onClick={() =>
              !disabled && onChange({ ...value, ruleMode: "allow_only" })
            }
          />
          <ModeCard
            active={value.ruleMode === "deny_if_missing"}
            title="Deny if missing"
            description="Block visitors who lack any selected plan."
            onClick={() =>
              !disabled && onChange({ ...value, ruleMode: "deny_if_missing" })
            }
          />
        </div>
      </Section>

      {/* Plans */}
      <Section
        title="Plans"
        description="Select one or more plans that satisfy this rule."
      >
        <PlanPicker
          multiple
          value={value.planIds}
          onChange={(ids) => onChange({ ...value, planIds: ids })}
          disabled={disabled}
          emptyLabel="No active plans yet. Create one first."
        />
      </Section>

      {/* Required capabilities */}
      <Section
        title="Required capabilities"
        description="Optional. Enter capability keys this rule additionally requires, one per line."
      >
        <textarea
          disabled={disabled}
          rows={3}
          value={value.requiredCapabilities.join("\n")}
          onChange={(e) =>
            onChange({
              ...value,
              requiredCapabilities: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="post.view_premium"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {value.requiredCapabilities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {value.requiredCapabilities.map((cap) => (
              <span
                key={cap}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                <Lock className="h-3 w-3" />
                {cap}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Teaser mode */}
      <Section
        title="Blocked-content behaviour"
        description="What unauthorised visitors see in place of the restricted content."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <TeaserCard
            active={value.teaserMode === "hide"}
            title="Hide"
            description="Content is not rendered at all."
            onClick={() =>
              !disabled && onChange({ ...value, teaserMode: "hide" })
            }
          />
          <TeaserCard
            active={value.teaserMode === "excerpt"}
            title="Excerpt"
            description="Show only the excerpt / preview."
            onClick={() =>
              !disabled && onChange({ ...value, teaserMode: "excerpt" })
            }
          />
          <TeaserCard
            active={value.teaserMode === "custom_message"}
            title="Custom message"
            description="Show a custom call-to-action."
            onClick={() =>
              !disabled &&
              onChange({ ...value, teaserMode: "custom_message" })
            }
          />
        </div>

        {value.teaserMode === "custom_message" && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Custom message
            </label>
            <textarea
              disabled={disabled}
              rows={3}
              value={value.customMessage}
              onChange={(e) =>
                onChange({ ...value, customMessage: e.target.value })
              }
              placeholder="This content is available to premium members. Upgrade to unlock."
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )}
      </Section>

      {/* Login required */}
      {showLoginRequired && (
        <Section
          title="Authentication"
          description="Whether signed-out visitors should be forced to sign in."
        >
          <label
            className={cn(
              "flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-sm transition-colors",
              value.loginRequired && "border-primary/40 bg-primary/5",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.loginRequired}
              onChange={(e) =>
                onChange({ ...value, loginRequired: e.target.checked })
              }
              className="mt-0.5 size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div>
              <p className="font-medium text-foreground">Require sign-in</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Anonymous visitors are redirected to sign in before any plan
                check is performed.
              </p>
            </div>
          </label>
        </Section>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function ModeCard({
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
        "group relative flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <div className="flex w-full items-center justify-between">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {active && <Check className="h-4 w-4 text-primary" />}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function TeaserCard({
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
        "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

/** Build a default draft for a new rule. */
export function makeDefaultRuleDraft(
  resourceType: ResourceType = "post",
): RestrictionRuleDraft {
  return {
    resourceType,
    resourceIdOrKey: "",
    resourceLabel: "",
    ruleMode: "deny_if_missing",
    planIds: [],
    requiredCapabilities: [],
    teaserMode: "hide",
    customMessage: "",
    loginRequired: true,
  };
}
