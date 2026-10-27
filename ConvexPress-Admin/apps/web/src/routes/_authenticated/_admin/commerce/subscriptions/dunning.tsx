/**
 * Failed payments.
 *
 * Every past-due contract: what is owed, why the card failed, when the next
 * automatic retry runs and how long the customer keeps access. "Retry now"
 * charges the card on file immediately (useful once the customer says they
 * fixed it); it is hidden when another system handles subscriber billing.
 * Below, the log of recent payment attempts.
 *
 * Data: `adminContracts.listDunningQueue`, `adminContracts.retryPayment` and
 * `adminContracts.listRecentAttempts`.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";
import { ManagedRecordNotice } from "@/components/shared/ManagedRecord";
import { useSubscriberBillingElsewhere } from "@/components/shared/useManagedRecord";
import {
  describeFailure,
  formatDate,
  formatDateTime,
  formatMoney,
  humanize,
  type ContractRow,
} from "@/components/subscriptions/billingFormat";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/dunning")({
  component: FailedPaymentsPage,
});

const ATTEMPT_TONE: Record<"scheduled" | "processing" | "failed" | "succeeded" | "aborted", string> = {
  scheduled: "bg-muted text-muted-foreground",
  processing: "bg-primary/15 text-primary",
  failed: "bg-destructive/10 text-destructive",
  succeeded: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  aborted: "bg-muted text-muted-foreground",
};

function FailedPaymentsPage() {
  const queue = useQuery(api.commerceSubscriptions.adminContracts.listDunningQueue, {});
  const attempts = useQuery(api.commerceSubscriptions.adminContracts.listRecentAttempts, { limit: 50 });
  const billingElsewhere = useSubscriberBillingElsewhere();
  const owed = (queue ?? []).reduce((sum, row) => sum + (row.billingIssue?.amountDue ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Failed payments</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Subscriptions whose last charge failed. Cards are retried automatically on the plan's schedule and the customer keeps access through the grace period; when every retry fails the subscription is cancelled.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Past due {queue && queue.length > 0 ? <span className="text-muted-foreground">· {queue.length}</span> : null}
          </h2>
          {queue && queue.length > 0 ? <p className="text-sm text-muted-foreground">{formatMoney(owed)} outstanding</p> : null}
        </div>
        {queue === undefined ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        ) : queue.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> No subscription is past due.
          </div>
        ) : (
          <>
            {billingElsewhere ? <ManagedRecordNotice managed={billingElsewhere} what="Subscriber billing" /> : null}
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {queue.map((row) => (
                <PastDueRow key={row._id} row={row} canRetry={!billingElsewhere} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recent payment attempts</h2>
        {attempts === undefined ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        ) : attempts.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">No payment attempts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Attempt</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attempts.map((attempt) => {
                  const name = attempt.customerName ?? attempt.customerEmail;
                  return (
                    <tr key={attempt._id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDateTime(attempt.processedAt ?? attempt.scheduledAt)}</td>
                      <td className="px-5 py-3">
                        <Link
                          to="/commerce/subscriptions/contracts/$contractId"
                          params={{ contractId: attempt.subscriptionId }}
                          className="hover:underline"
                        >
                          {name ?? "Open contract"}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">#{attempt.attemptNumber}</td>
                      <td className="px-5 py-3">{formatMoney(attempt.amount, attempt.currencyCode)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", ATTEMPT_TONE[attempt.status])}>
                          {attempt.status === "scheduled" ? `Scheduled ${formatDate(attempt.scheduledAt)}` : humanize(attempt.status)}
                        </span>
                        {attempt.errorMessage ? <span className="ml-2 text-xs text-muted-foreground">{describeFailure(attempt.errorMessage)}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PastDueRow({ row, canRetry }: { row: ContractRow; canRetry: boolean }) {
  const retry = useMutation(api.commerceSubscriptions.adminContracts.retryPayment);
  const [busy, setBusy] = useState(false);
  const issue = row.billingIssue;

  async function retryNow(subscriptionId: Id<"commerce_subscriptions">) {
    setBusy(true);
    try {
      await retry({ subscriptionId });
      toast.success("Charging the card on file now");
    } catch (error) {
      toast.error(getErrorMessage(error, "The retry could not be started."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto] sm:items-center">
      <div className="min-w-0">
        <Link to="/commerce/subscriptions/contracts/$contractId" params={{ contractId: row._id }} className="inline-flex items-center gap-1 font-medium hover:underline">
          {row.customerName ?? row.customerEmail ?? "Unknown customer"} <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {row.planTitle ?? "Subscription"} · {row.card ? `${humanize(row.card.brand)} •••• ${row.card.last4}` : "no card on file"}
        </p>
      </div>
      <div className="text-xs">
        <p className="font-medium text-destructive">
          {issue ? `${formatMoney(issue.amountDue, row.currencyCode)} due · ${describeFailure(issue.lastFailureReason)}` : "Past due"}
        </p>
        <p className="text-muted-foreground">
          {issue ? `${issue.failedAttempts} failed attempt${issue.failedAttempts === 1 ? "" : "s"} · ` : ""}
          {issue?.nextRetryAt ? `next retry ${formatDateTime(issue.nextRetryAt)}` : "no retries left"}
          {issue?.accessEndsAt ? ` · access until ${formatDate(issue.accessEndsAt)}` : ""}
        </p>
      </div>
      {canRetry ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void retryNow(row._id)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Retry now
        </button>
      ) : null}
    </li>
  );
}
