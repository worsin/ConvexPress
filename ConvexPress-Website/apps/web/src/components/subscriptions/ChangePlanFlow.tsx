import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowRight, RefreshCw } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";

/**
 * Two-step upgrade/downgrade flow for a single contract.
 *
 *   1. User opens the dialog → picks a target offer from `availableOffers`.
 *   2. A proration preview renders inline as soon as a target is chosen.
 *   3. User confirms → `requestPlanChange` fires and the dialog closes.
 *
 * `availableOffers` is provided by the parent (the dashboard page queries
 * `commerceSubscriptions.offers.listOffersForPricing` and filters to the
 * ones compatible with the product). This component does NOT fetch offers
 * itself so the parent can reuse that query across multiple contracts.
 *
 * Dialog uses our Base UI wrapper — never @radix-ui.
 */

type Offer = {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  recurringAmount: number;
  currencyCode: string;
  features?: Array<{ text: string; highlighted?: boolean }>;
};

type PreviewResult = {
  daysRemaining: number;
  daysInCycle: number;
  unusedOldAmount: number;
  proratedNewAmount: number;
  netCharge: number;
  isUpgrade: boolean;
  effectiveAt: number;
  currencyCode: string;
  fromOfferTitle?: string;
  toOfferTitle?: string;
  isNoOp?: boolean;
};

interface ChangePlanFlowProps {
  contractId: string;
  currentOfferId: string | null;
  /**
   * Candidate offers to show in the picker. The parent filters out the
   * current offer and any offers the customer cannot move to (e.g. archived).
   */
  availableOffers: Offer[];
  triggerLabel?: string;
  triggerClassName?: string;
}

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Preview panel ──────────────────────────────────────────────────────────

function PreviewPanel({
  contractId,
  toOfferId,
}: {
  contractId: string;
  toOfferId: string;
}) {
  const preview = useQuery(
    (api as any).commerceSubscriptions.portal.previewPlanChange,
    {
      contractId: contractId as any,
      toOfferId: toOfferId as any,
    },
  ) as PreviewResult | null | undefined;

  if (preview === undefined) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground"
        aria-busy="true"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Calculating proration…
      </div>
    );
  }

  if (preview === null) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-xs text-destructive">
        Could not load proration preview. The offer may be unavailable.
      </div>
    );
  }

  if (preview.isNoOp) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
        This is your current plan — nothing to change.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 px-3 py-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Unused credit on current plan</span>
        <span className="font-medium text-foreground">
          {formatMoney(preview.unusedOldAmount, preview.currencyCode)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Pro-rated new plan cost</span>
        <span className="font-medium text-foreground">
          {formatMoney(preview.proratedNewAmount, preview.currencyCode)}
        </span>
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-center justify-between text-xs">
        <span className="text-foreground">
          {preview.isUpgrade ? "Charge today" : "Takes effect"}
        </span>
        <span
          className={cn(
            "font-semibold",
            preview.isUpgrade ? "text-primary" : "text-foreground",
          )}
        >
          {preview.isUpgrade
            ? formatMoney(preview.netCharge, preview.currencyCode)
            : formatDate(preview.effectiveAt)}
        </span>
      </div>
      {!preview.isUpgrade && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Downgrades apply at the end of your current billing period. No
          credit is owed — your current entitlements keep working until then.
        </p>
      )}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function ChangePlanFlow({
  contractId,
  currentOfferId,
  availableOffers,
  triggerLabel = "Change plan",
  triggerClassName,
}: ChangePlanFlowProps) {
  const [open, setOpen] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const planChangeMutation = useMutation(
    (api as any).commerceSubscriptions.portal.requestPlanChange,
  );

  // Filter out the current offer — moving to the same plan is rejected by
  // the backend anyway, but hide it from the UI too.
  const candidates = useMemo(
    () => availableOffers.filter((offer) => offer._id !== currentOfferId),
    [availableOffers, currentOfferId],
  );

  async function handleConfirm() {
    if (!selectedOfferId) return;
    setBusy(true);
    try {
      const result = await planChangeMutation({
        contractId: contractId as any,
        toOfferId: selectedOfferId as any,
      });
      if (result?.mode === "immediate") {
        toast.success("Plan upgraded — new invoice created");
      } else if (result?.mode === "scheduled") {
        toast.success("Plan change scheduled for end of current period");
      } else {
        toast.success("Plan change requested");
      }
      setOpen(false);
      setSelectedOfferId(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Plan change failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted",
          triggerClassName,
        )}
      >
        <ArrowRight className="h-3.5 w-3.5" />
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change your plan</DialogTitle>
          <DialogDescription>
            Upgrades apply immediately with pro-rated billing. Downgrades
            take effect at the end of your current billing period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {candidates.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              No other plans are available for this subscription right now.
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((offer) => {
                const selected = offer._id === selectedOfferId;
                return (
                  <button
                    key={offer._id}
                    type="button"
                    onClick={() => setSelectedOfferId(offer._id)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                    aria-pressed={selected}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {offer.title}
                      </p>
                      {offer.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {offer.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      {formatMoney(offer.recurringAmount, offer.currencyCode)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedOfferId && (
            <PreviewPanel
              contractId={contractId}
              toOfferId={selectedOfferId}
            />
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setSelectedOfferId(null);
            }}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedOfferId || busy}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Confirming…" : "Confirm change"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
