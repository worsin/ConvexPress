import { useState } from "react";
import { useAuth, useSignUp } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Loader2, Tag } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthError } from "@/components/auth/AuthError";
import { StripePaymentForm } from "./StripePaymentForm";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import {
  clearPendingSubscriptionIntent,
  clearPendingVerificationContext,
  getPendingVerificationCouponCodeForOffer,
  PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY,
  writePendingVerificationContext,
} from "@/lib/auth/verification";
import { cn } from "@/lib/utils";

/**
 * Direct-signup form for a subscription offer.
 *
 * Checkout always starts with `createCheckoutIntent`. Live charging uses
 * Stripe Elements and lets the webhook activate the intent. Zero-amount
 * initial checkouts activate with the explicit `free` provider. The `stub`
 * provider is kept only for local development when live charging is disabled.
 *
 * Colours: theme tokens only (primary / foreground / muted / destructive).
 */

interface Offer {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  publicSummary?: string;
  recurringAmount: number;
  currencyCode: string;
  setupFeeAmount?: number;
  trialDaysOverride?: number;
  features?: Array<{
    text: string;
    highlighted?: boolean;
    icon?: string;
  }>;
  template?: {
    _id: string;
    billingInterval: "week" | "month" | "year";
    billingIntervalCount: number;
    trialDays?: number;
    gracePeriodDays?: number;
  } | null;
}

interface SignupFormProps {
  offer: Offer;
  className?: string;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function billingSummary(offer: Offer): string {
  const interval = offer.template?.billingInterval ?? "month";
  const count = offer.template?.billingIntervalCount ?? 1;
  const short =
    interval === "year" ? "yr" : interval === "week" ? "wk" : "mo";
  if (count === 1) return `/ ${short}`;
  return `/ ${count} ${short}`;
}

function trialCopy(offer: Offer): string | null {
  const trialDays = offer.trialDaysOverride ?? offer.template?.trialDays ?? 0;
  if (trialDays <= 0) return null;
  return `${trialDays}-day free trial — you won't be charged until the trial ends.`;
}

// ─── Form ───────────────────────────────────────────────────────────────────

export function SignupForm({ offer, className }: SignupFormProps) {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp();

  const createCheckoutIntent = useMutation(
    (api as any).commerceSubscriptions.checkout.createCheckoutIntent,
  );
  const activateFromIntent = useMutation(
    (api as any).commerceSubscriptions.checkout.activateFromIntent,
  );
  const beginFirstCharge = useAction(
    (api as any).commerceSubscriptions.publicCharge.beginFirstCharge,
  );
  const chargingStatus = useQuery(
    (api as any).commerceSubscriptions.queries.getLiveChargingStatus,
  ) as { live: boolean; publishableKey: string | null } | undefined;

  const [stripeContext, setStripeContext] = useState<{
    clientSecret: string;
    publishableKey: string;
    mode: "payment" | "setup";
  } | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [couponCode, setCouponCode] = useState(
    () => getPendingVerificationCouponCodeForOffer(offer._id) ?? "",
  );
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsClerkSignup = authLoaded && !isSignedIn;
  const trialNote = trialCopy(offer);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!authLoaded) return;

    // ── Signed-in path: just checkout + activate ──────────────────────────
    if (isSignedIn) {
      await runCheckout({ forEmail: undefined });
      return;
    }

    // ── Anonymous path: Clerk signup → checkout → activate ────────────────
    if (!signUpLoaded || !signUp) {
      setError("Signup is not ready yet — please try again in a moment.");
      return;
    }

    if (!email || !firstName || !lastName) {
      setError("Please fill in your name and email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!acceptTerms) {
      setError("Please accept the Terms of Service and Privacy Policy.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      if (result.status === "complete") {
        // User is fully signed in — activate the subscription immediately.
        await setActive({ session: result.createdSessionId });
        await runCheckout({ forEmail: email.trim() });
      } else if (result.status === "missing_requirements") {
        // Email verification required. Create the intent so pricing and
        // coupon checks happen now, then redirect into the verification
        // screen. After verification we return the user to this same offer
        // page and let them complete checkout while signed in.
        const intent = await createCheckoutIntent({
          offerId: offer._id as any,
          customerEmail: email.trim(),
          couponCode: couponCode.trim() || undefined,
        });
        writePendingVerificationContext({
          email: email.trim(),
          returnTo: `/signup/${offer._id}`,
          source: "subscription",
          offerId: offer._id,
          couponCode: couponCode.trim() || undefined,
        });
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY,
            String(intent.intentId),
          );
        }
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
        if (typeof window !== "undefined") {
          const url = new URL("/verify-email", window.location.origin);
          url.searchParams.set("returnTo", `/signup/${offer._id}`);
          window.location.assign(url.toString());
        }
      } else {
        setError("Signup requires additional steps. Please try again.");
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runCheckout({
    forEmail,
  }: {
    forEmail: string | undefined;
  }) {
    setIsSubmitting(true);
    try {
      const intent = await createCheckoutIntent({
        offerId: offer._id as any,
        customerEmail: forEmail,
        couponCode: couponCode.trim() || undefined,
      });

      // Live path: call Stripe to get a client_secret and render Stripe
      // Elements inside this form. The webhook activates the intent after the
      // PaymentIntent or SetupIntent succeeds.
      if (chargingStatus?.live && chargingStatus.publishableKey) {
        try {
          const charge = (await beginFirstCharge({
            checkoutIntentId: intent.intentId as any,
          })) as { clientSecret?: string | null; mode?: "payment" | "setup" };
          if (!charge?.clientSecret) {
            setError("Could not start payment. Please try again.");
            return;
          }
          setStripeContext({
            clientSecret: charge.clientSecret,
            publishableKey: chargingStatus.publishableKey,
            mode: charge.mode ?? "payment",
          });
          return;
        } catch (err: unknown) {
          const message = extractErrorMessage(err);
          if (!message.includes("no_charge_needed_free_initial_amount")) {
            throw err;
          }
          if ((intent.recurringAmount ?? offer.recurringAmount ?? 0) > 0) {
            throw err;
          }

          const activation = await activateFromIntent({
            intentId: intent.intentId as any,
            paymentResult: {
              provider: "free",
              providerTransactionId: `free_${Date.now()}`,
              status: "succeeded" as const,
            },
          });

          if (activation?.ok) {
            clearPendingVerificationContext();
            clearPendingSubscriptionIntent();
            toast.success("Subscription activated");
            if (typeof window !== "undefined") {
              window.location.assign("/dashboard/subscriptions");
            }
            return;
          }

          setError(
            "Subscription could not be activated. Please try again or contact support.",
          );
          return;
        }
      }

      // Local development path only. The backend rejects this for paid intents
      // whenever live subscription charging is enabled.
      const paymentResult = {
        provider: "stub",
        providerTransactionId: `stub_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        status: "succeeded" as const,
      };

      const activation = await activateFromIntent({
        intentId: intent.intentId as any,
        paymentResult,
      });

      if (activation?.ok) {
        clearPendingVerificationContext();
        clearPendingSubscriptionIntent();
        toast.success("Subscription activated");
        if (typeof window !== "undefined") {
          window.location.assign("/dashboard/subscriptions");
        }
      } else {
        setError(
          "Subscription could not be activated. Please try again or contact support.",
        );
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!authLoaded) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-5 rounded-2xl border border-border bg-card p-6",
        className,
      )}
      data-slot="subscription-signup-form"
    >
      {/* Price header */}
      <div className="flex items-baseline justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {offer.title}
          </h2>
          {offer.publicSummary && (
            <p className="mt-1 text-xs text-muted-foreground">
              {offer.publicSummary}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-foreground">
            {formatMoney(offer.recurringAmount, offer.currencyCode)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {billingSummary(offer)}
          </div>
        </div>
      </div>

      {/* Features */}
      {offer.features && offer.features.length > 0 && (
        <ul className="space-y-1.5">
          {offer.features.map((feature, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs text-foreground"
            >
              <Check
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  feature.highlighted ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>
      )}

      {trialNote && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-foreground">
          {trialNote}
        </div>
      )}

      {error && <AuthError message={error} />}

      {/* Stripe Elements — live path (Wave 10.1) */}
      {stripeContext && (
        <StripePaymentForm
          publishableKey={stripeContext.publishableKey}
          clientSecret={stripeContext.clientSecret}
          mode={stripeContext.mode}
          returnUrl={
            typeof window !== "undefined"
              ? `${window.location.origin}/dashboard/subscriptions?welcome=1`
              : "/dashboard/subscriptions?welcome=1"
          }
          onError={(m) => {
            setError(m);
            setStripeContext(null);
          }}
        />
      )}

      {!stripeContext && <>
      {/* Signed-in vs anonymous split */}
      {needsClerkSignup ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-first-name">First name</Label>
              <Input
                id="signup-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-last-name">Last name</Label>
              <Input
                id="signup-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signup-password">Password</Label>
            <div className="relative">
              <Input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
            <PasswordStrengthIndicator password={password} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
          You're signed in. This subscription will be added to your account.
        </div>
      )}

      {/* Coupon */}
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="signup-coupon"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Tag className="size-3" />
          Coupon code (optional)
        </Label>
        <Input
          id="signup-coupon"
          type="text"
          placeholder="e.g. LAUNCH20"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          autoComplete="off"
        />
      </div>

      {/* Terms (anonymous only) */}
      {needsClerkSignup && (
        <div className="flex items-start gap-2">
          <Checkbox
            id="signup-terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(checked === true)}
            className="mt-0.5"
          />
          <Label
            htmlFor="signup-terms"
            className="cursor-pointer text-xs leading-normal"
          >
            I agree to the{" "}
            <a
              href="#"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="#"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
          </Label>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting || !authLoaded}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Processing…
          </>
        ) : trialNote ? (
          "Start Free Trial"
        ) : (
          `Subscribe — ${formatMoney(offer.recurringAmount, offer.currencyCode)}`
        )}
      </Button>

      {!chargingStatus?.live && (
        <p className="text-center text-[10px] text-muted-foreground">
          Development checkout is active. Live payments are not enabled.
        </p>
      )}
      </>}
    </form>
  );
}

// ─── Error helpers ──────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  // Clerk errors
  const clerkError = err as {
    errors?: Array<{ message?: string; longMessage?: string }>;
  };
  const clerkMsg =
    clerkError?.errors?.[0]?.longMessage ?? clerkError?.errors?.[0]?.message;
  if (clerkMsg) return clerkMsg;

  // Convex ConvexError with structured data
  const convexError = err as { data?: { message?: string } };
  if (convexError?.data?.message) return convexError.data.message;

  // Plain Error
  if (err instanceof Error) return err.message;

  return "Something went wrong. Please try again.";
}
