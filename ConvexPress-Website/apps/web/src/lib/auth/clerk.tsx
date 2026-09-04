/**
 * Clerk, switched at runtime.
 *
 * Every component imports Clerk hooks from here instead of `@clerk/clerk-react`.
 * When the site has a publishable key (from the site database, the process
 * environment, or VITE_ env) the real Clerk provider and hooks are used. When
 * it has none, the shim in `./clerk-shim` answers "signed out" everywhere and
 * turns sign-in attempts into a clear "not configured yet" error, so one build
 * serves sites before and after Clerk is connected.
 *
 * The switch is fixed for the lifetime of the provider (the subtree remounts
 * when the key changes), which keeps the conditional hook calls below stable.
 */

/* eslint-disable react-hooks/rules-of-hooks */

import * as Clerk from "@clerk/clerk-react";
import { createContext, useContext, type ReactNode } from "react";

import * as Shim from "./clerk-shim";

const ActiveContext = createContext(false);

export function isUsablePublishableKey(value: string | null | undefined): value is string {
  return Boolean(value && /^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(value) && !value.includes("PLACEHOLDER"));
}

export interface ClerkProviderProps {
  children: ReactNode;
  publishableKey?: string | null;
  /** Absolute or relative URLs Clerk may redirect to after auth flows. */
  signInUrl?: string;
  signUpUrl?: string;
  signInFallbackRedirectUrl?: string;
  signUpFallbackRedirectUrl?: string;
  afterSignOutUrl?: string;
}

export function ClerkProvider({ children, publishableKey, ...urls }: ClerkProviderProps) {
  if (isUsablePublishableKey(publishableKey)) {
    return (
      <ActiveContext.Provider value={true}>
        <Clerk.ClerkProvider key={publishableKey} publishableKey={publishableKey} {...urls}>
          {children}
        </Clerk.ClerkProvider>
      </ActiveContext.Provider>
    );
  }
  return (
    <ActiveContext.Provider value={false}>
      <Shim.ClerkProvider>{children}</Shim.ClerkProvider>
    </ActiveContext.Provider>
  );
}

/** True when the real Clerk provider is mounted for this site. */
export function useClerkActive(): boolean {
  return useContext(ActiveContext);
}

// The shim is a structural stand-in that throws on use, so each hook returns
// Clerk's own type: components are written once against the real API.

export function useAuth(): ReturnType<typeof Clerk.useAuth> {
  return (useContext(ActiveContext) ? Clerk.useAuth() : Shim.useAuth()) as unknown as ReturnType<typeof Clerk.useAuth>;
}

export function useUser(): ReturnType<typeof Clerk.useUser> {
  return (useContext(ActiveContext) ? Clerk.useUser() : Shim.useUser()) as unknown as ReturnType<typeof Clerk.useUser>;
}

export function useClerk(): ReturnType<typeof Clerk.useClerk> {
  return (useContext(ActiveContext) ? Clerk.useClerk() : Shim.useClerk()) as unknown as ReturnType<typeof Clerk.useClerk>;
}

export function useSignIn(): ReturnType<typeof Clerk.useSignIn> {
  return (useContext(ActiveContext) ? Clerk.useSignIn() : Shim.useSignIn()) as unknown as ReturnType<typeof Clerk.useSignIn>;
}

export function useSignUp(): ReturnType<typeof Clerk.useSignUp> {
  return (useContext(ActiveContext) ? Clerk.useSignUp() : Shim.useSignUp()) as unknown as ReturnType<typeof Clerk.useSignUp>;
}

/** Completes OAuth / SSO redirects. Renders nothing when Clerk is not active. */
export function AuthenticateWithRedirectCallback(
  props: React.ComponentProps<typeof Clerk.AuthenticateWithRedirectCallback>,
) {
  const active = useContext(ActiveContext);
  if (!active) return null;
  return <Clerk.AuthenticateWithRedirectCallback {...props} />;
}

/** Clerk's error shape, narrowed for message extraction. */
export interface ClerkApiErrorLike {
  errors?: Array<{ code?: string; message?: string; longMessage?: string; meta?: { paramName?: string } }>;
  message?: string;
}

export function clerkErrorMessage(error: unknown, fallback: string): string {
  const clerkError = error as ClerkApiErrorLike | null;
  return clerkError?.errors?.[0]?.longMessage ?? clerkError?.errors?.[0]?.message ?? clerkError?.message ?? fallback;
}

export function clerkErrorCode(error: unknown): string | null {
  const clerkError = error as ClerkApiErrorLike | null;
  return clerkError?.errors?.[0]?.code ?? null;
}

/** Resource types without a direct dependency on @clerk/types. */
export type SignInResource = NonNullable<ReturnType<typeof Clerk.useSignIn>["signIn"]>;
export type SignUpResource = NonNullable<ReturnType<typeof Clerk.useSignUp>["signUp"]>;
