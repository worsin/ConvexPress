/**
 * ProrationPreview — shows the financial impact of changing a contract's
 * offer mid-cycle. Calls `api.commerceSubscriptions.queries.previewProration`.
 *
 * Three display modes:
 *   - Upgrade (netCharge > 0): charge today, effective immediately
 *   - Downgrade (netCharge ≤ 0 and prices differ): no charge today,
 *                                                  starts next renewal
 *   - No change (equal prices): flat info card
 */

import { useQuery } from "convex-helpers/react/cache";
import { ArrowUpRight, Clock, DollarSign } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface ProrationPreviewProps {
  contractId: Id<"commerce_subscriptions">;
  toOfferId: Id<"commerce_subscription_offers">;
  className?: string;
}

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProrationPreview({
  contractId,
  toOfferId,
  className,
}: ProrationPreviewProps) {
  const preview = useQuery(
    (api as any).commerceSubscriptions.queries.previewProration,
    { contractId, toOfferId },
  ) as
    | {
        unusedOldAmount: number;
        proratedNewAmount: number;
        netCharge: number;
        daysRemaining: number;
        daysInCycle: number;
        isUpgrade: boolean;
        effectiveAt: number;
        currencyCode: string;
        fromOfferTitle?: string;
        toOfferTitle?: string;
      }
    | null
    | undefined;

  if (preview === undefined) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-4",
          className,
        )}
      >
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-56 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (preview === null) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          Unable to compute proration preview. Check that both offers are
          valid and the contract has an active item.
        </p>
      </div>
    );
  }

  const { netCharge, unusedOldAmount, proratedNewAmount, effectiveAt, currencyCode, isUpgrade } = preview;

  // Equal prices → netCharge is 0 regardless of direction.
  const noPriceChange = netCharge === 0;

  if (isUpgrade) {
    return (
      <div
        className={cn(
          "rounded-xl border border-primary/40 bg-primary/5 p-4",
          className,
        )}
      >
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
          <ArrowUpRight className="h-3.5 w-3.5" />
          Upgrade
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <span className="text-2xl font-semibold text-primary">
            {formatMoney(netCharge, currencyCode)}
          </span>
          <span className="text-xs text-muted-foreground">charged today</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pro-rated new offer ({formatMoney(proratedNewAmount, currencyCode)})
          minus unused credit on current offer (
          {formatMoney(unusedOldAmount, currencyCode)}).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3" /> Effective immediately.
        </p>
      </div>
    );
  }

  if (noPriceChange) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-muted/30 p-4",
          className,
        )}
      >
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          No price change
        </div>
        <p className="mt-1 text-sm text-foreground">
          This change does not alter billing. Effective next renewal.
        </p>
      </div>
    );
  }

  // Downgrade (netCharge < 0)
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Downgrade
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">
        No charge today.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        New plan starts on{" "}
        <span className="font-medium text-foreground">
          {formatDate(effectiveAt)}
        </span>
        .
      </p>
    </div>
  );
}
