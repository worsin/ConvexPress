/**
 * UpgradeCTA
 *
 * Inline call-to-action card shown to logged-in visitors who don't have a
 * matching active grant for membership-restricted content. Links to the
 * public pricing page, deep-linking to a specific plan when a matching
 * plan id is available.
 *
 * NOTE: `/pricing` is the planned public pricing route (Wave 6). It is not
 * yet registered with the router, so we use a plain `<a>` tag for now.
 * Once the typed route exists, this can be swapped to `<Link to="/pricing">`.
 */
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Crown } from "lucide-react";

import { api } from "@convexpress-website/backend/generated/api";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface UpgradeCTAProps {
  /** Matching plan ids returned by checkAccess (if any). */
  matchingPlanIds?: string[] | null;
  /** Optional heading override. */
  title?: string;
  /** Optional description override. */
  description?: string;
  className?: string;
}

export function UpgradeCTA({
  matchingPlanIds,
  title = "Members-only content",
  description = "Upgrade your plan to unlock this content.",
  className,
}: UpgradeCTAProps) {
  // Reactively load public plans so we can resolve the slug for the first
  // matching plan id (enabling deep-links like /pricing?plan=pro).
  const plans = useQuery(api.membership.queries.listPublicPlans, {});

  const matchingSlug = useMemo(() => {
    if (!plans || !matchingPlanIds || matchingPlanIds.length === 0) {
      return undefined;
    }
    const firstMatch = plans.find((p) => typeof p._id === "string" && matchingPlanIds.includes(p._id));
    return typeof firstMatch?.slug === "string" ? firstMatch.slug : undefined;
  }, [plans, matchingPlanIds]);

  const href = matchingSlug
    ? `/pricing?plan=${encodeURIComponent(matchingSlug)}`
    : "/pricing";

  return (
    <div
      data-slot="membership-upgrade-cta"
      className={cn(
        "flex flex-col items-center gap-4 border border-border bg-card p-6 text-center text-card-foreground",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-none bg-muted text-muted-foreground">
        <Crown className="size-5" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>

      <a
        href={href}
        className={cn(buttonVariants({ variant: "default", size: "default" }))}
      >
        View plans
      </a>
    </div>
  );
}
