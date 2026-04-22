/**
 * Stripe Elements wrapper for the subscription signup flow (Wave 10.1).
 *
 * Contract:
 *   - Parent calls `publicCharge.beginFirstCharge` to create a PaymentIntent.
 *   - Parent passes the returned `clientSecret` + `publishableKey` here.
 *   - On submit, we call `stripe.confirmPayment` with the PaymentElement.
 *   - On success, Stripe fires `payment_intent.succeeded` to our webhook,
 *     which activates the checkout intent into a subscription. The
 *     customer is then redirected to `returnUrl` by Stripe.
 *
 * We do NOT activate client-side — the webhook is the source of truth.
 */

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

interface Props {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  onError: (message: string) => void;
}

export function StripePaymentForm(props: Props) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    setStripePromise(loadStripe(props.publishableKey));
  }, [props.publishableKey]);

  if (!stripePromise) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: props.clientSecret }}
    >
      <PaymentFormInner returnUrl={props.returnUrl} onError={props.onError} />
    </Elements>
  );
}

function PaymentFormInner(props: {
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
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: props.returnUrl },
    });
    if (result.error) {
      props.onError(result.error.message ?? "Payment failed");
      setSubmitting(false);
    }
    // On success, Stripe redirects to returnUrl. No further action here.
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
