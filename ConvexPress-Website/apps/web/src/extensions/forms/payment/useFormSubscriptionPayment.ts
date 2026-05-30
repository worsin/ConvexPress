/**
 * Form Commerce — Website client orchestration hook.
 *
 * After a form is submitted, the `subscription`/`payment` action runs ASYNC
 * (the Form Actions runner schedules it off `form.submitted`). When that action
 * takes the PAID path it returns a non-terminal `awaiting_payment` outcome and
 * stores a `needsPayment` descriptor on the action run. This hook subscribes to
 * that run via `extensions.forms.actions.getPendingPayment` and surfaces the
 * descriptor so the renderer can mount `FormStripePaymentForm`.
 *
 * Account branch (PLAN §9/§11):
 *   - `accountPolicy:"create_on_website"` + anonymous: run Clerk
 *     `signUp.create → setActive` (or email-verify redirect persisting the
 *     intentId) BEFORE the card confirms, mirroring `SignupForm.tsx`, so the
 *     webhook's `activateFromIntent` never hits `USER_NOT_FOUND`.
 *   - `require_existing` + anonymous: surface a "must be signed in" message; no
 *     charge can activate.
 *
 * The client NEVER calls `activateFromIntent` for the paid path — the Stripe
 * webhook owns paid activation. On card success Stripe redirects to `returnUrl`.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth, useSignUp } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY,
  writePendingVerificationContext,
} from "@/lib/auth/verification";

export interface PendingPaymentDescriptor {
  runId: string;
  formActionId: string;
  intentId: string | null;
  clientSecret: string | null;
  publishableKey: string | null;
  mode: "payment" | "setup";
  amount: number;
  recurringAmount: number;
  currency: string;
  accountPolicy: "require_existing" | "create_on_website" | string;
  returnUrl?: string;
}

export interface UseFormSubscriptionPaymentResult {
  /** The pending-payment descriptor, or null when none is pending. */
  pending: PendingPaymentDescriptor | null;
  /** True while we are still waiting for the async action to surface a run. */
  isWaiting: boolean;
  /** True when the live publishable key + clientSecret are ready to mount. */
  canPay: boolean;
  /** Set when the flow needs a signed-in user it does not have. */
  blockedReason: string | null;
  /** The return URL to hand Stripe after confirm. */
  returnUrl: string;
  /**
   * For anon + create_on_website: complete Clerk signup before the card step.
   * Resolves true when the session is active (safe to mount Elements), false
   * when an email-verification redirect was triggered (the intentId is
   * persisted so checkout resumes post-verification).
   */
  signUpThenPay: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    returnTo: string;
  }) => Promise<boolean>;
}

/**
 * @param submissionId the form submission whose action runs to watch
 * @param enabled gate the subscription (e.g. only after a successful submit)
 */
export function useFormSubscriptionPayment(
  submissionId: string | null,
  enabled: boolean,
): UseFormSubscriptionPaymentResult {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp();

  const pendingRaw = useQuery(
    (api as any).extensions.forms.actions.getPendingPayment,
    enabled && submissionId ? { submissionId: submissionId as any } : "skip",
  ) as PendingPaymentDescriptor | null | undefined;

  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const pending = pendingRaw ?? null;
  const isWaiting = enabled && !!submissionId && pendingRaw === undefined;

  const returnUrl = useMemo(() => {
    if (pending?.returnUrl) return pending.returnUrl;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/dashboard/subscriptions?welcome=1`;
    }
    return "/dashboard/subscriptions?welcome=1";
  }, [pending?.returnUrl]);

  // Enforce account policy once a descriptor + auth state are known.
  useEffect(() => {
    if (!pending || !authLoaded) {
      setBlockedReason(null);
      return;
    }
    if (
      pending.accountPolicy === "require_existing" &&
      !isSignedIn
    ) {
      setBlockedReason(
        "You must be signed in to complete this subscription. Please sign in and submit again.",
      );
    } else {
      setBlockedReason(null);
    }
  }, [pending, authLoaded, isSignedIn]);

  const canPay =
    !!pending &&
    !!pending.clientSecret &&
    !!pending.publishableKey &&
    !blockedReason;

  async function signUpThenPay(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    returnTo: string;
  }): Promise<boolean> {
    if (!signUpLoaded || !signUp) {
      throw new Error("Signup is not ready yet — please try again in a moment.");
    }
    const result = await signUp.create({
      emailAddress: input.email.trim(),
      password: input.password,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
    });

    if (result.status === "complete") {
      await setActive({ session: result.createdSessionId });
      return true;
    }

    if (result.status === "missing_requirements") {
      // Email verification required. Persist the intentId so checkout resumes
      // after verification, mirroring SignupForm.tsx.
      writePendingVerificationContext({
        email: input.email.trim(),
        returnTo: input.returnTo,
        source: "subscription",
      });
      if (typeof window !== "undefined" && pending?.intentId) {
        window.sessionStorage.setItem(
          PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY,
          String(pending.intentId),
        );
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      if (typeof window !== "undefined") {
        const url = new URL("/verify-email", window.location.origin);
        url.searchParams.set("returnTo", input.returnTo);
        window.location.assign(url.toString());
      }
      return false;
    }

    throw new Error("Signup requires additional steps. Please try again.");
  }

  return {
    pending,
    isWaiting,
    canPay,
    blockedReason,
    returnUrl,
    signUpThenPay,
  };
}
