import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";

export const Route = createFileRoute("/_marketing/checkout/")({
  component: CheckoutIndexPage,
});

function CheckoutIndexPage() {
  const settings = useSettings();
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    (api as any).commerce.cart.getMine,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as { itemCount: number } | null | undefined;
  const session = useQuery(
    (api as any).commerce.checkout.getSession,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as { email?: string } | null | undefined;
  const createSession = useMutation((api as any).commerce.checkout.createSession);
  const updateSession = useMutation((api as any).commerce.checkout.updateSession);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (session?.email) {
      setEmail(session.email);
    }
  }, [session?.email]);

  useEffect(() => {
    if (!isReady || !sessionToken || !cart || cart.itemCount <= 0 || session !== null) {
      return;
    }
    void createSession({ sessionToken }).catch(() => undefined);
  }, [cart, createSession, isReady, session, sessionToken]);

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken || !email.trim()) {
      toast.error("Email is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (session === null) {
        await createSession({ sessionToken, email: email.trim() });
      } else {
        await updateSession({ sessionToken, email: email.trim() });
      }
      router.navigate({ to: "/checkout/shipping" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to start checkout",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 py-10 lg:py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Checkout</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Start checkout by confirming the contact email attached to this order.
        </p>
        {settings?.commerceConfig?.storeEmail ? (
          <p className="text-xs text-muted-foreground">
            Store contact: {settings.commerceConfig.storeEmail}
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
          onSubmit={(event) => void handleContinue(event)}
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
              onChange={(event) => setEmail(event.target.value)}
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
