import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/clerk";

type Status = "active" | "abandoned" | "pending_payment";
type Props = {
  sessionToken: string;
  canCombine: boolean;
  changeCart: (cartId: Id<"commerce_carts">, combine?: boolean) => Promise<boolean>;
};
const labels: Record<Status, string> = {
  active: "Other saved baskets",
  abandoned: "Earlier baskets",
  pending_payment: "Baskets awaiting payment",
};

function SavedCartGroup({ sessionToken, canCombine, changeCart, cartStatus }: Props & { cartStatus: Status }) {
  const { results, status, loadMore } = usePaginatedQuery(api.commerce.cartRecovery.listSaved,
    { sessionToken, status: cartStatus }, { initialNumItems: 5 });
  const [busy, setBusy] = useState<string | null>(null);
  const choose = async (id: Id<"commerce_carts">, combine: boolean) => {
    if (busy) return;
    setBusy(id);
    try { await changeCart(id, combine); }
    catch (error) {
      toast.error((error as { data?: { message?: string } })?.data?.message ?? "Could not open the saved basket. Please try again.");
    } finally { setBusy(null); }
  };
  if (!results.length && (status === "Exhausted" || status === "LoadingFirstPage")) return null;
  return (
    <section aria-label={labels[cartStatus]} className="my-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-foreground">{labels[cartStatus]}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {cartStatus === "pending_payment"
          ? "These baskets have a payment in progress. Open one to return to checkout; its items stay separate."
          : "These baskets are saved separately. Open one to review it, or combine it with your current basket if stock and store settings allow."}
      </p>
      <ul className="mt-4 space-y-3">
        {results.map(cart => (
          <li key={cart.id} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-foreground">{cart.itemCount} {cart.itemCount === 1 ? "item" : "items"} · {cart.currencyCode}</p>
              <p className="mt-1 text-muted-foreground">Saved {new Date(cart.updatedAt).toLocaleDateString()}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void choose(cart.id, false)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">
                {busy === cart.id ? "Updating…" : "Open basket"}
              </button>
              {canCombine && cartStatus !== "pending_payment" ? <button type="button" disabled={busy !== null} onClick={() => void choose(cart.id, true)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">Combine baskets</button> : null}
            </div>
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" || status === "LoadingMore" ? <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(5)} className="mt-3 min-h-11 text-sm font-medium underline underline-offset-4">{status === "LoadingMore" ? "Loading…" : "Load earlier baskets"}</button> : null}
    </section>
  );
}

export function SavedCarts(props: Props) {
  const auth = useAuth();
  if (!auth.isSignedIn) return null;
  return <>{(["active", "pending_payment", "abandoned"] as const).map(cartStatus => <SavedCartGroup key={`${props.sessionToken}:${cartStatus}`} {...props} cartStatus={cartStatus} />)}</>;
}
