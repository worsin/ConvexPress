/**
 * Form Commerce — in-form Stripe Elements surface (Website).
 *
 * Mirror of `components/subscriptions/StripePaymentForm.tsx`. Mounted by the
 * Form payment hook when a form's `subscription`/`payment` action returns a
 * non-terminal `awaiting_payment` outcome (the descriptor is read from the
 * action run via `extensions.forms.actions.getPendingPayment`).
 *
 * PCI boundary: this component receives ONLY the single-use `clientSecret` +
 * the PUBLISHABLE key. It creates NO PaymentIntent, holds NO secret key, and
 * NEVER calls `activateFromIntent` — the Stripe webhook activates the intent
 * server-side after the card confirms, then the customer is redirected to
 * `returnUrl`.
 */

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";

interface Props {
  publishableKey: string;
  clientSecret: string;
  mode: "payment" | "setup";
  returnUrl: string;
  onError: (message: string) => void;
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
      />
    </Elements>
  );
}

function PaymentFormInner(props: {
  mode: "payment" | "setup";
  returnUrl: string;
  onError: (m: string) => void;
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
    // On success Stripe redirects to returnUrl. The webhook activates the
    // checkout intent into a subscription server-side. No client activation.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Processing…" : "Complete payment"}
      </button>
    </form>
  );
}
