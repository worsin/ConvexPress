/**
 * PlanPicker — select one or multiple membership plans.
 *
 * Usage:
 *   <PlanPicker value={planId} onChange={setPlanId} />                         // single
 *   <PlanPicker value={planIds} onChange={setPlanIds} multiple />              // multiple
 *   <PlanPicker value={...} onChange={...} plans={plansOverride} />            // override data
 *
 * Data source (when `plans` omitted): api.membership.queries.listPlans({ status: "active" })
 */

import { useQuery } from "convex/react";
import { Check, ShieldCheck } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type PlanId = Id<"membership_plans">;

interface PlanSummary {
  _id: PlanId;
  title: string;
  slug: string;
  status?: string;
  priority?: number;
}

interface PlanPickerSingleProps {
  value: PlanId | null;
  onChange: (value: PlanId | null) => void;
  multiple?: false;
  plans?: PlanSummary[];
  disabled?: boolean;
  /** When true, only active plans are shown (ignored if `plans` override provided). */
  activeOnly?: boolean;
  emptyLabel?: string;
  className?: string;
}

interface PlanPickerMultipleProps {
  value: PlanId[];
  onChange: (value: PlanId[]) => void;
  multiple: true;
  plans?: PlanSummary[];
  disabled?: boolean;
  activeOnly?: boolean;
  emptyLabel?: string;
  className?: string;
}

export type PlanPickerProps = PlanPickerSingleProps | PlanPickerMultipleProps;

export function PlanPicker(props: PlanPickerProps) {
  const { plans: override, disabled, activeOnly = true, emptyLabel, className } = props;

  // Only fetch when no override provided
  const fetched = useQuery(
    (api as any).membership.queries.listPlans,
    override === undefined
      ? (activeOnly ? { status: "active" } : {})
      : "skip",
  ) as PlanSummary[] | null | undefined;

  const plans = override ?? fetched ?? undefined;

  if (plans === undefined) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-xl bg-muted"
          />
        ))}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center",
          className,
        )}
      >
        <ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-2 text-xs text-muted-foreground">
          {emptyLabel ?? "No active plans available."}
        </p>
      </div>
    );
  }

  if (props.multiple) {
    return (
      <div className={cn("space-y-1.5", className)}>
        {plans.map((plan) => {
          const checked = props.value.includes(plan._id);
          return (
            <button
              key={plan._id}
              type="button"
              disabled={disabled}
              aria-pressed={checked}
              onClick={() => {
                if (disabled) return;
                if (checked) {
                  props.onChange(
                    props.value.filter((id) => id !== plan._id),
                  );
                } else {
                  props.onChange([...props.value, plan._id]);
                }
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                checked
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-border bg-card hover:bg-muted",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                {checked && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{plan.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  /{plan.slug}
                  {plan.status && plan.status !== "active"
                    ? ` · ${plan.status}`
                    : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {plans.map((plan) => {
        const checked = props.value === plan._id;
        return (
          <button
            key={plan._id}
            type="button"
            disabled={disabled}
            aria-pressed={checked}
            onClick={() => {
              if (disabled) return;
              props.onChange(checked ? null : plan._id);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
              checked
                ? "border-primary/40 bg-primary/5 text-foreground"
                : "border-border bg-card hover:bg-muted",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background",
              )}
            >
              {checked && <Check className="h-3 w-3" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{plan.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                /{plan.slug}
                {plan.status && plan.status !== "active"
                  ? ` · ${plan.status}`
                  : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
