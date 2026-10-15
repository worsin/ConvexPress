/**
 * Ask the server to verify a confirmed Stripe payment and activate the
 * subscription (`publicCharge.confirmFirstCharge`), whenever the checkout
 * state machine (`subscriptionCheckout.ts`) is `activating`. Results and
 * errors go back to the reducer, which schedules retries while Stripe is
 * still settling. Shared by the form checkout and the direct signup page.
 */
import { useEffect } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convexpress-website/backend/generated/api";

import { isRetryableConfirmError, type CheckoutEvent, type CheckoutState } from "./subscriptionCheckout";

function convexErrorCode(err: unknown): string | undefined {
  if (!(err instanceof ConvexError)) return undefined;
  const data: unknown = err.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return undefined;
  return typeof data.code === "string" ? data.code : undefined;
}

function errorText(err: unknown): string {
  if (err instanceof ConvexError) {
    const data: unknown = err.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  return err instanceof Error ? err.message : "Unknown error";
}

export function useConfirmFirstCharge(
  state: CheckoutState,
  dispatch: (event: CheckoutEvent) => void,
  checkoutIntentId: string | null,
): void {
  const confirmFirstCharge = useAction(api.commerceSubscriptions.publicCharge.confirmFirstCharge);
  useEffect(() => {
    if (state.phase !== "activating" || !checkoutIntentId) return;
    const { confirmation, delayMs } = state;
    let cancelled = false;
    const timer = setTimeout(() => {
      const target =
        confirmation.kind === "payment_intent"
          ? { paymentIntentId: confirmation.objectId }
          : { setupIntentId: confirmation.objectId };
      confirmFirstCharge({ checkoutIntentId, clientSecret: confirmation.clientSecret, ...target }).then(
        (result) => {
          if (!cancelled) dispatch({ type: "confirm_result", result });
        },
        (err: unknown) => {
          if (cancelled) return;
          dispatch({
            type: "confirm_error",
            retryable: isRetryableConfirmError(convexErrorCode(err)),
            message: errorText(err),
          });
        },
      );
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, checkoutIntentId, confirmFirstCharge, dispatch]);
}
