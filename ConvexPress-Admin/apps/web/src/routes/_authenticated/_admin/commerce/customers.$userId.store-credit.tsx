import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/customers/$userId/store-credit",
)({
  component: StoreCreditAdmin,
});

type LedgerEntry = {
  _id: string;
  entryType: "issue" | "redeem" | "expire" | "adjust";
  amount: number;
  balanceAfter: number;
  note?: string;
  createdAt: number;
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function StoreCreditAdmin() {
  const { userId } = Route.useParams();
  const balance = useQuery(
    (api as any).commerceReturns.storeCredit.getBalance,
    { userId: userId as any },
  ) as { balance: number } | undefined;
  const ledger = useQuery(
    (api as any).commerceReturns.storeCredit.listLedger,
    { userId: userId as any, limit: 100 },
  ) as LedgerEntry[] | undefined;
  const issue = useMutation(
    (api as any).commerceReturns.storeCredit.issue,
  );
  const adjust = useMutation(
    (api as any).commerceReturns.storeCredit.adjust,
  );

  const [issueAmount, setIssueAmount] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  async function onIssue() {
    const dollars = parseFloat(issueAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    try {
      await issue({
        userId: userId as any,
        amount: Math.round(dollars * 100),
        note: issueNote.trim() || undefined,
      });
      toast.success("Store credit issued");
      setIssueAmount("");
      setIssueNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to issue");
    }
  }

  async function onAdjust() {
    const dollars = parseFloat(adjustAmount);
    if (!Number.isFinite(dollars) || dollars === 0 || !adjustNote.trim()) {
      toast.error("Amount must be non-zero and note is required");
      return;
    }
    try {
      await adjust({
        userId: userId as any,
        amount: Math.round(dollars * 100),
        note: adjustNote.trim(),
      });
      toast.success("Adjustment recorded");
      setAdjustAmount("");
      setAdjustNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to adjust");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/commerce/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Customers
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Store Credit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Customer ID: {userId}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="text-sm text-muted-foreground">Current balance</div>
        <div className="mt-1 text-4xl font-bold">
          {balance === undefined
            ? "—"
            : formatCents(balance.balance)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Issue credit
          </h2>
          <input
            type="number"
            step="0.01"
            placeholder="Amount (e.g. 25.00)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={issueAmount}
            onChange={(e) => setIssueAmount(e.target.value)}
          />
          <input
            placeholder="Note"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={issueNote}
            onChange={(e) => setIssueNote(e.target.value)}
          />
          <button
            type="button"
            onClick={onIssue}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Issue
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Adjust (±)
          </h2>
          <input
            type="number"
            step="0.01"
            placeholder="Amount (use negative to deduct)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
          />
          <input
            placeholder="Note (required)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
          />
          <button
            type="button"
            onClick={onAdjust}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium"
          >
            Record adjustment
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ledger
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[110px_100px_120px_1fr_120px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Type</div>
            <div>Amount</div>
            <div>Balance after</div>
            <div>Note</div>
            <div>When</div>
          </div>
          {ledger === undefined ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : ledger.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No ledger entries yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {ledger.map((entry) => (
                <li
                  key={entry._id}
                  className="grid grid-cols-[110px_100px_120px_1fr_120px] items-center gap-4 px-5 py-3 text-sm"
                >
                  <div className="capitalize">{entry.entryType}</div>
                  <div
                    className={
                      entry.amount >= 0 ? "text-primary" : "text-destructive"
                    }
                  >
                    {entry.amount >= 0 ? "+" : ""}
                    {formatCents(entry.amount)}
                  </div>
                  <div>{formatCents(entry.balanceAfter)}</div>
                  <div className="truncate text-muted-foreground">
                    {entry.note ?? ""}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
