/** Core · checkout.payment — step 3: choose a payment method. */
import type { FormEvent } from "react";
import { CreditCard, FileText, Truck } from "lucide-react";

import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface CheckoutPaymentMethodOption {
  code: string;
  label: string;
  enabled: boolean;
  /** Set when the method is configured but cannot be used in checkout right now. */
  unavailableReason?: string;
}

export interface CheckoutPaymentSurfaceData {
  /** False until the commerce session token is available (skeleton state). */
  isReady: boolean;
  /** Checkout session; `undefined` while loading, `null` when checkout was not started. */
  session: any;
  /** Every configured method, including unavailable ones (rendered disabled). */
  paymentMethods: CheckoutPaymentMethodOption[];
  /** `paymentMethods` minus the unavailable ones. */
  availablePaymentMethods: CheckoutPaymentMethodOption[];
  /** Currently selected method code (persisted by the route). */
  paymentMethod: string;
  isSubmitting: boolean;
  onSelectMethod: (code: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  card: CreditCard,
  manual_invoice: FileText,
  cash_on_delivery: Truck,
};

export default function CoreCheckoutPayment({ data }: SurfaceProps<CheckoutPaymentSurfaceData>) {
  const {
    isReady,
    session,
    paymentMethods,
    availablePaymentMethods,
    paymentMethod,
    isSubmitting,
    onSelectMethod,
    onSubmit,
  } = data;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 py-10 lg:py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Payment</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Select how you would like to pay for this order.
        </p>
      </div>
      <CheckoutProgress currentStep="payment" />

      {!isReady || session === undefined ? (
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
      ) : !session ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Start checkout from the cart first.
        </div>
      ) : availablePaymentMethods.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No usable payment methods are available for checkout yet.
        </div>
      ) : (
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-[2rem] border border-border bg-card p-8 shadow-sm lg:p-10"
        >
          <CheckoutStatusNotice
            status={session.status}
            failureReason={session.failureReason}
          />
          <div className="mt-4 space-y-3">
            {paymentMethods.map((method: any) => {
              const Icon = METHOD_ICONS[method.code];
              const isSelected = paymentMethod === method.code;
              const isCard = method.code === "card";
              const disabled = Boolean(method.unavailableReason);

              return (
                <label
                  key={method.code}
                  className={`flex items-start gap-4 rounded-2xl border px-5 py-4 transition-colors ${
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  } ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.code}
                    checked={isSelected}
                    disabled={disabled}
                    onChange={(event) => onSelectMethod(event.target.value)}
                    className="mt-0.5"
                  />
                  <div className="flex flex-1 items-start gap-3">
                    {Icon && (
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {method.label}
                      </span>
                      {isCard && (isSelected || disabled) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {method.unavailableReason ??
                            "You will enter your card details securely on the next step."}
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {session?.selectedPaymentMethodCode &&
          session.selectedPaymentMethodCode !== paymentMethod ? (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              The previously selected payment method is unavailable, so checkout selected the next usable method.
            </div>
          ) : null}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !paymentMethod ||
              Boolean(
                paymentMethods.find((method) => method.code === paymentMethod)
                  ?.unavailableReason,
              )
            }
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Continue to review"}
          </button>
        </form>
      )}
    </div>
  );
}
