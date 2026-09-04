import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { siteTitled } from "@/lib/seo/head";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import CoreCheckoutDetails, { type CheckoutDetailsSurfaceData } from "@/templates/packs/core/surfaces/checkout.details";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/checkout/")({
  head: () => ({ meta: [{ title: siteTitled("Checkout") }, { name: "robots", content: "noindex, nofollow" }] }),
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

  const surfaceData: CheckoutDetailsSurfaceData = {
    storeEmail: settings?.commerceConfig?.storeEmail,
    isReady,
    cart,
    session,
    email,
    isSubmitting,
    onEmailChange: setEmail,
    onSubmit: handleContinue,
  };

  return <Surface name="checkout.details" data={surfaceData} fallback={CoreCheckoutDetails} />;
}
