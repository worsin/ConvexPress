/**
 * Form Commerce — in-form Stripe Elements surface (Website).
 *
 * Mirror of `components/subscriptions/StripePaymentForm.tsx`. Mounted by the
 * form wizard when a form's order payment or `subscription`/`payment` action
 * needs a card (the subscription descriptor is read from the action run via
 * `extensions.forms.actions.getPendingPayment`).
 *
 * PCI boundary: this component receives ONLY the single-use `clientSecret` +
 * the PUBLISHABLE key. It creates NO PaymentIntent, holds NO secret key, and
 * cannot activate anything. Everything stays on this site: the PaymentElement
 * is embedded here, and Stripe only leaves the page for payment methods that
 * themselves require a redirect (it then returns to `returnUrl`, on this site).
 *
 * Two confirmation modes:
 *   - Without `onConfirmed` (order forms): Stripe always returns to
 *     `returnUrl`.
 *   - With `onConfirmed` (subscriptions): `redirect: "if_required"` keeps card
 *     payments in-page and hands the confirmed PaymentIntent/SetupIntent to
 *     the caller, which asks the server to verify it with Stripe and activate
 *     (`publicCharge.confirmFirstCharge`). Redirect-based methods still come
 *     back to `returnUrl`, where the same server verification runs.
 */

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";

/** The Stripe object Elements confirmed without leaving the page. */
export interface ConfirmedStripeObject {
  kind: "payment_intent" | "setup_intent";
  id: string;
  status: string;
}

interface Props {
  publishableKey: string;
  clientSecret: string;
  mode: "payment" | "setup";
  returnUrl: string;
  onError: (message: string) => void;
  /** Opt in to in-page confirmation; see the module comment. */
  onConfirmed?: (confirmed: ConfirmedStripeObject) => void;
  submitLabel?: string;
}

export function FormStripePaymentForm(props: Props) {
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    setStripePromise(loadStripe(props.publishableKey));
  }, [props.publishableKey]);

  if (!stripePromise) return null;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <PaymentFormInner
        mode={props.mode}
        returnUrl={props.returnUrl}
        onError={props.onError}
        onConfirmed={props.onConfirmed}
        submitLabel={props.submitLabel}
      />
    </Elements>
  );
}

function PaymentFormInner(props: {
  mode: "payment" | "setup";
  returnUrl: string;
  onError: (m: string) => void;
  onConfirmed?: (confirmed: ConfirmedStripeObject) => void;
  submitLabel?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const localReturnPath = sanitizeRedirectUrl(props.returnUrl, {
      baseOrigin: window.location.origin,
      fallbackPath: window.location.pathname,
    });
    const returnUrl = localReturnPath.startsWith("/")
      ? `${window.location.origin}${localReturnPath}`
      : `${window.location.origin}${window.location.pathname}`;

    const onConfirmed = props.onConfirmed;
    if (onConfirmed) {
      // In-page confirmation: Stripe redirects only for redirect-based methods.
      if (props.mode === "setup") {
        const result = await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: returnUrl },
          redirect: "if_required",
        });
        if (result.error) {
          props.onError(result.error.message ?? "Your card could not be saved.");
          setSubmitting(false);
          return;
        }
        onConfirmed({ kind: "setup_intent", id: result.setupIntent.id, status: result.setupIntent.status });
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (result.error) {
        props.onError(result.error.message ?? "Payment failed");
        setSubmitting(false);
        return;
      }
      onConfirmed({ kind: "payment_intent", id: result.paymentIntent.id, status: result.paymentIntent.status });
      return;
    }

    const result =
      props.mode === "setup"
        ? await stripe.confirmSetup({
            elements,
            confirmParams: { return_url: returnUrl },
          })
        : await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: returnUrl },
          });
    if (result.error) {
      props.onError(result.error.message ?? "Payment failed");
      setSubmitting(false);
    }
    // On success Stripe redirects to returnUrl. The server activates the order
    // after verifying the payment. No client activation.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Processing…" : (props.submitLabel ?? "Complete payment")}
      </button>
    </form>
  );
}
