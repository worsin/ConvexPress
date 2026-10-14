/**
 * Refund all or part of a paid subscription invoice to the card it was paid
 * with. Asks for an amount (prefilled with what remains) and a reason, which
 * is kept on the invoice and in the contract's history.
 */
import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";

import { formatMoney, parseMoneyInput } from "./billingFormat";

interface RefundFormProps {
  invoiceId: Id<"commerce_subscription_invoices">;
  refundableAmount: number;
  currencyCode: string;
  onClose: () => void;
}

export function RefundForm({ invoiceId, refundableAmount, currencyCode, onClose }: RefundFormProps) {
  const refund = useMutation(api.commerceSubscriptions.adminContracts.refundInvoice);
  const [amount, setAmount] = useState((refundableAmount / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = parseMoneyInput(amount);
  const amountError =
    cents === undefined || cents <= 0
      ? "Enter an amount like 25.00."
      : cents > refundableAmount
        ? `At most ${formatMoney(refundableAmount, currencyCode)} can be refunded.`
        : undefined;
  const valid = amountError === undefined && reason.trim().length > 0;

  async function submit() {
    if (!valid || cents === undefined) return;
    setBusy(true);
    try {
      await refund({ invoiceId, amount: cents, reason: reason.trim() });
      toast.success(`Refunding ${formatMoney(cents, currencyCode)}`);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "The refund could not be started."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-[140px_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        aria-label="Refund amount"
        aria-invalid={amountError !== undefined}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      />
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (kept in the history)"
        aria-label="Refund reason"
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={!valid || busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Refunding…" : "Refund"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs">
          Close
        </button>
      </div>
      <p className={amountError && amount.trim() ? "text-xs text-destructive sm:col-span-3" : "text-xs text-muted-foreground sm:col-span-3"}>
        {amountError && amount.trim() ? amountError : `Up to ${formatMoney(refundableAmount, currencyCode)} can be refunded to the card it was paid with.`}
      </p>
    </form>
  );
}
