/**
 * Newsletter signup, shared by every footer that offers one. Wraps the
 * `emails.mutations.subscribeNewsletter` mutation with the submit state a
 * form needs, so template packs can draw their own input without touching
 * the backend.
 */

import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useCallback, useState } from "react";

export type NewsletterStatus = "idle" | "submitting" | "success" | "error";

export function useNewsletterSubscribe(source = "site_footer") {
  const subscribeNewsletter = useMutation((api as any).emails.mutations.subscribeNewsletter);
  const [status, setStatus] = useState<NewsletterStatus>("idle");
  const [message, setMessage] = useState("");

  const subscribe = useCallback(
    async (email: string): Promise<boolean> => {
      setStatus("submitting");
      setMessage("");
      try {
        await subscribeNewsletter({ email, source });
        setStatus("success");
        setMessage("You're subscribed.");
        return true;
      } catch (error) {
        setStatus("error");
        setMessage((error as { data?: { message?: string } })?.data?.message ?? "Could not subscribe. Please try again.");
        return false;
      }
    },
    [source, subscribeNewsletter],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setMessage("");
  }, []);

  return { subscribe, status, message, reset };
}
