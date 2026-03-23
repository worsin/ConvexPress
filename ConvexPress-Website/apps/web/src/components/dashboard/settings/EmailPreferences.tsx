/**
 * EmailPreferences - Email notification category toggles.
 *
 * Lets users control which email categories they receive.
 * Reads preferences from emails.queries.getUserPreferences and
 * toggles via emails.mutations.updateUnsubscribe.
 *
 * Security emails are always ON and cannot be disabled.
 */

import { useCallback, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Mail, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { DashboardCard } from "../DashboardCard";

interface CategoryPreference {
  category: string;
  label: string;
  description: string;
  isSubscribed: boolean;
  canUnsubscribe: boolean;
}

/**
 * Auth context is resolved internally by the query -- no props needed.
 */
export function EmailPreferences() {
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  const prefsData = useQuery(api.emails.queries.getUserPreferences, {});
  const updateUnsubscribe = useMutation(
    api.emails.mutations.updateUnsubscribe,
  );

  const isLoading = prefsData === undefined;

  const handleToggle = useCallback(
    async (category: string, currentlySubscribed: boolean) => {
      setPendingCategory(category);
      try {
        await updateUnsubscribe({
          category,
          subscribed: !currentlySubscribed,
        });
        toast.success(
          currentlySubscribed
            ? `Unsubscribed from ${category} emails`
            : `Subscribed to ${category} emails`,
        );
      } catch {
        toast.error("Failed to update email preference");
      } finally {
        setPendingCategory(null);
      }
    },
    [updateUnsubscribe],
  );

  return (
    <DashboardCard
      title="Email Preferences"
      description="Choose which email notifications you receive."
      action={<Mail className="size-4 text-muted-foreground" />}
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {(prefsData?.categories ?? []).map((pref: CategoryPreference) => (
            <div
              key={pref.category}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-foreground">
                    {pref.label}
                  </p>
                  {!pref.canUnsubscribe && (
                    <Lock className="size-3 text-muted-foreground" />
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {pref.description}
                </p>
              </div>

              <div className="shrink-0">
                {pendingCategory === pref.category ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pref.isSubscribed}
                    aria-label={`${pref.label} emails`}
                    disabled={!pref.canUnsubscribe}
                    onClick={() =>
                      handleToggle(pref.category, pref.isSubscribed)
                    }
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors",
                      pref.isSubscribed ? "bg-primary" : "bg-muted",
                      !pref.canUnsubscribe &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform",
                        pref.isSubscribed
                          ? "translate-x-[18px]"
                          : "translate-x-[2px]",
                      )}
                    />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Explanatory note */}
          <div className="flex items-start gap-1.5 border-t border-border pt-3">
            <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">
              Security notifications (password changes, login alerts) cannot be
              disabled. These are essential for your account safety.
            </p>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
