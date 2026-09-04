/** Core · checkout.details — step 1: contact email. */
import type { FormEvent } from "react";

import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface CheckoutDetailsSurfaceData {
  /** Store contact email from commerce settings, shown under the heading when set. */
  storeEmail?: string | null;
  /** False until the commerce session token is available (skeleton state). */
  isReady: boolean;
  /** `undefined` while loading, `null` when there is no cart yet. */
  cart: { itemCount: number } | null | undefined;
  /** Checkout session; `null` when none has been created yet. */
  session: { email?: string; status?: string; failureReason?: string } | null | undefined;
  /** Current email value (persisted by the route). */
  email: string;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export default function CoreCheckoutDetails({ data }: SurfaceProps<CheckoutDetailsSurfaceData>) {
  const { storeEmail, isReady, cart, session, email, isSubmitting, onEmailChange, onSubmit } = data;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 py-10 lg:py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Checkout</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Start checkout by confirming the contact email attached to this order.
        </p>
        {storeEmail ? (
          <p className="text-xs text-muted-foreground">
            Store contact: {storeEmail}
          </p>
        ) : null}
      </div>
      <CheckoutProgress currentStep="contact" />

      {!isReady || cart === undefined ? (
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
      ) : !cart || cart.itemCount <= 0 ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Your cart is empty.
        </div>
      ) : (
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-[2rem] border border-border bg-card p-8 shadow-sm lg:p-10"
        >
          <CheckoutStatusNotice
            status={(session as any)?.status}
            failureReason={(session as any)?.failureReason}
          />
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">
              Email address
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              placeholder="you@example.com"
              required
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Continue to shipping"}
          </button>
        </form>
      )}
    </div>
  );
}
