/**
 * useSignUpFlow — one place that drives Clerk's SignUp resource for every
 * registration surface (register page, subscription signup, form payments).
 *
 * Callers pass the fields they collected; the hook creates or updates the
 * sign-up, prepares whichever verification Clerk asks for, and returns the
 * next step from `nextSignUpStep`. Navigation stays with the caller.
 */

import { useCallback, useMemo } from "react";

import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { clerkErrorMessage, useSignUp } from "@/lib/auth/clerk";
import type { SignUpFieldName } from "@/lib/auth/capabilities";
import { nextSignUpStep, type SignUpNext } from "@/lib/auth/clerk-flow";

export type SignUpValues = Partial<Record<SignUpFieldName, string>> & {
  legalAccepted?: boolean;
};

export interface SignUpFlow {
  isLoaded: boolean;
  /** Start a sign-up with the collected values. */
  create: (values: SignUpValues) => Promise<SignUpNext>;
  /** Continue an existing sign-up (missing fields, consent). */
  update: (values: SignUpValues) => Promise<SignUpNext>;
  /** Re-send whichever verification is pending. */
  resend: () => Promise<SignUpNext>;
  attemptEmailCode: (code: string) => Promise<SignUpNext>;
  attemptPhoneCode: (code: string) => Promise<SignUpNext>;
  /** Re-read Clerk's view (used while waiting for an email link). */
  refresh: () => Promise<SignUpNext>;
  /** Activate the created session. */
  complete: (sessionId: string) => Promise<void>;
  /** Where the current sign-up stands without touching the network. */
  current: () => SignUpNext | null;
  errorMessage: (error: unknown, fallback: string) => string;
}

function toClerkParams(values: SignUpValues) {
  const params: Record<string, unknown> = {};
  if (values.emailAddress?.trim()) params.emailAddress = values.emailAddress.trim();
  if (values.phoneNumber?.trim()) params.phoneNumber = values.phoneNumber.trim();
  if (values.username?.trim()) params.username = values.username.trim();
  if (values.firstName?.trim()) params.firstName = values.firstName.trim();
  if (values.lastName?.trim()) params.lastName = values.lastName.trim();
  if (values.password) params.password = values.password;
  if (values.legalAccepted) params.legalAccepted = true;
  return params;
}

export function useSignUpFlow(): SignUpFlow {
  const { signUp, setActive, isLoaded } = useSignUp();
  const capabilities = useAuthCapabilities();

  const linkRedirectUrl = useCallback(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/verify-email`;
  }, []);

  /** Prepare whatever Clerk still needs after a create/update, then classify. */
  const settle = useCallback(async (): Promise<SignUpNext> => {
    if (!signUp) return { kind: "unknown", status: "not_loaded" };
    const next = nextSignUpStep(signUp as never, capabilities);
    if (next.kind === "verify_email") {
      const pending = signUp.verifications?.emailAddress;
      const alreadyPrepared = pending?.status === "unverified" && pending?.strategy === next.strategy;
      if (!alreadyPrepared) {
        await signUp.prepareEmailAddressVerification(
          next.strategy === "email_link"
            ? { strategy: "email_link", redirectUrl: linkRedirectUrl() ?? "" }
            : { strategy: "email_code" },
        );
      }
    } else if (next.kind === "verify_phone") {
      const pending = signUp.verifications?.phoneNumber;
      if (pending?.status !== "unverified") {
        await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
      }
    }
    return next;
  }, [capabilities, linkRedirectUrl, signUp]);

  const create = useCallback(
    async (values: SignUpValues) => {
      if (!signUp) throw new Error("Sign-up is not ready yet.");
      await signUp.create(toClerkParams(values) as never);
      return settle();
    },
    [settle, signUp],
  );

  const update = useCallback(
    async (values: SignUpValues) => {
      if (!signUp) throw new Error("Sign-up is not ready yet.");
      await signUp.update(toClerkParams(values) as never);
      return settle();
    },
    [settle, signUp],
  );

  const resend = useCallback(async () => {
    if (!signUp) throw new Error("Sign-up is not ready yet.");
    const next = nextSignUpStep(signUp as never, capabilities);
    if (next.kind === "verify_email") {
      await signUp.prepareEmailAddressVerification(
        next.strategy === "email_link"
          ? { strategy: "email_link", redirectUrl: linkRedirectUrl() ?? "" }
          : { strategy: "email_code" },
      );
    } else if (next.kind === "verify_phone") {
      await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
    }
    return next;
  }, [capabilities, linkRedirectUrl, signUp]);

  const attemptEmailCode = useCallback(
    async (code: string) => {
      if (!signUp) throw new Error("Sign-up is not ready yet.");
      await signUp.attemptEmailAddressVerification({ code: code.trim() });
      return settle();
    },
    [settle, signUp],
  );

  const attemptPhoneCode = useCallback(
    async (code: string) => {
      if (!signUp) throw new Error("Sign-up is not ready yet.");
      await signUp.attemptPhoneNumberVerification({ code: code.trim() });
      return settle();
    },
    [settle, signUp],
  );

  const refresh = useCallback(async () => {
    if (!signUp) return { kind: "unknown", status: "not_loaded" } as SignUpNext;
    await signUp.reload();
    return nextSignUpStep(signUp as never, capabilities);
  }, [capabilities, signUp]);

  const complete = useCallback(
    async (sessionId: string) => {
      if (!setActive) throw new Error("Sign-up is not ready yet.");
      await setActive({ session: sessionId });
    },
    [setActive],
  );

  const current = useCallback(() => {
    if (!signUp || !signUp.status) return null;
    return nextSignUpStep(signUp as never, capabilities);
  }, [capabilities, signUp]);

  return useMemo(
    () => ({
      isLoaded,
      create,
      update,
      resend,
      attemptEmailCode,
      attemptPhoneCode,
      refresh,
      complete,
      current,
      errorMessage: clerkErrorMessage,
    }),
    [attemptEmailCode, attemptPhoneCode, complete, create, current, isLoaded, refresh, resend, update],
  );
}
