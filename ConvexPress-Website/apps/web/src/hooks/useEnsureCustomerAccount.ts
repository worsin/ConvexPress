/**
 * useEnsureCustomerAccount — guarantees a ConvexPress user row for the
 * signed-in Clerk identity.
 *
 * The Clerk webhook normally creates the row, but a site whose webhook is not
 * (yet) configured must still work: on the first authenticated render with no
 * profile, call `provisionClerkUser`, which links to an imported customer by
 * verified email or creates the account (respecting invitations and the
 * registration setting). Reports why an account could not be created so the
 * dashboard can say so instead of spinning forever.
 */

import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

export type CustomerAccountState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready" }
  | { status: "provisioning" }
  | {
      status: "unavailable";
      reason: "registration_closed" | "email_conflict" | "email_unverified" | "local_account" | "error";
      detail?: string;
    };

export function useEnsureCustomerAccount(): CustomerAccountState {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.queries.getProfile, isAuthenticated ? {} : "skip");
  const provision = useMutation((api as any).auth.clerkProvisioning.ensureClerkUser);
  const attempted = useRef(false);
  const [outcome, setOutcome] = useState<CustomerAccountState | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      attempted.current = false;
      setOutcome(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || profile !== null || attempted.current) return;
    attempted.current = true;
    setOutcome({ status: "provisioning" });
    void provision({})
      .then((result: { ok: boolean; reason?: string } | null) => {
        if (result?.ok) {
          setOutcome(null); // profile query will refresh reactively
          return;
        }
        const reason = result?.reason;
        setOutcome({
          status: "unavailable",
          reason:
            reason === "email_conflict"
              ? "email_conflict"
              : reason === "email_unverified"
                ? "email_unverified"
                : reason === "local_account"
                  ? "local_account"
                  : reason === "registration_closed" || reason === "no_email"
                    ? "registration_closed"
                    : "error",
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setOutcome({
          status: "unavailable",
          reason: /already linked|different/i.test(message) ? "email_conflict" : "error",
          detail: message.slice(0, 200),
        });
      });
  }, [isAuthenticated, profile, provision]);

  if (isLoading) return { status: "loading" };
  if (!isAuthenticated) return { status: "anonymous" };
  if (profile === undefined) return { status: "loading" };
  if (profile) return { status: "ready" };
  return outcome ?? { status: "provisioning" };
}
