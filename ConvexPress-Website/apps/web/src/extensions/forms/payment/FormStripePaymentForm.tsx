/**
 * Form Commerce — in-form Stripe Elements surface (Website).
 *
 * The site's Stripe Elements card form. Mounted by the
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
 *
 * The card form takes the site's look (theme colours, radius and body font;
 * `stripeAppearance`), and payment errors are explained in plain words.
 * Wallets (Apple Pay, Google Pay) show where the buyer's device offers them
 * (`wallets`, on by default).
 */

import { useEffect, useId, useState } from "react";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";
import { paymentErrorMessage, readStripeTheme, stripeAppearance, stripeFonts, type StripeTheme } from "./stripeAppearance";

/**
 * Automatic-renewal consent for a subscription checkout: the terms are shown
 * right above a checkbox and the pay button; the button stays disabled until
 * the box is ticked, and `record` stores the consent before the card is
 * charged (a failure stops the payment).
 */
export interface RenewalConsent {
  terms: string;
  label: string;
  record: () => Promise<void>;
}

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
  /** Required for a subscription that renews: see `RenewalConsent`. */
  consent?: RenewalConsent;
  /** Offer Apple Pay and Google Pay where available ("auto", the default) or never. */
  wallets?: "auto" | "never";
}

export function FormStripePaymentForm(props: Props) {
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null);
  const [theme, setTheme] = useState<StripeTheme | null>(null);

  useEffect(() => {
    setStripePromise(loadStripe(props.publishableKey));
  }, [props.publishableKey]);
  // Stripe needs concrete values, read from the rendered page once mounted.
  useEffect(() => {
    setTheme(readStripeTheme(document.documentElement));
  }, []);

  if (!stripePromise || !theme) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: props.clientSecret, appearance: stripeAppearance(theme), fonts: stripeFonts(theme.fontFamily) }}
    >
      <PaymentFormInner
        mode={props.mode}
        returnUrl={props.returnUrl}
        onError={props.onError}
        onConfirmed={props.onConfirmed}
        submitLabel={props.submitLabel}
        consent={props.consent}
        wallets={props.wallets ?? "auto"}
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
  consent?: RenewalConsent;
  wallets: "auto" | "never";
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const termsId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (props.consent && !agreed) {
      props.onError("Please agree to the renewal terms to continue.");
      return;
    }
    setSubmitting(true);
    if (props.consent) {
      try {
        await props.consent.record();
      } catch {
        props.onError("We couldn't record your agreement to the renewal terms. Please try again.");
        setSubmitting(false);
        return;
      }
    }
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
          props.onError(paymentErrorMessage(result.error, "Your card could not be saved. Please try again."));
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
        props.onError(paymentErrorMessage(result.error, "Your payment didn't go through. Please try again."));
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
      props.onError(paymentErrorMessage(result.error, "Your payment didn't go through. Please try again."));
      setSubmitting(false);
    }
    // On success Stripe redirects to returnUrl. The server activates the order
    // after verifying the payment. No client activation.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ wallets: { applePay: props.wallets, googlePay: props.wallets } }} />
      {props.consent ? (
        <div data-slot="renewal-consent" className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4">
          <p id={termsId} data-slot="renewal-terms" className="text-sm text-foreground">
            {props.consent.terms}
          </p>
          <label className="flex items-start gap-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              aria-describedby={termsId}
              required
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>{props.consent.label}</span>
          </label>
        </div>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || submitting || (props.consent !== undefined && !agreed)}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Processing…" : (props.submitLabel ?? "Complete payment")}
      </button>
    </form>
  );
}
