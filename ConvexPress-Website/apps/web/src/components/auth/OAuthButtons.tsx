/**
 * OAuthButtons — one button per social provider enabled in Clerk.
 *
 * The list comes from capabilities, so enabling Apple or Microsoft in Clerk
 * shows up here without a code change. Redirects use absolute URLs and land
 * on `/api/auth/callback`, which completes the flow (including first-time
 * sign-in → sign-up transfers).
 */

import { Button } from "@/components/ui/button";
import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { clerkErrorMessage, useSignIn, useSignUp } from "@/lib/auth/clerk";
import { socialProviders } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";
import { useState } from "react";

import { AuthError } from "./AuthError";

interface OAuthButtonsProps {
  mode: "signin" | "signup";
  returnTo?: string;
  disabled?: boolean;
  className?: string;
}

export const OAUTH_RETURN_TO_KEY = "convexpress:oauth-return-to";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.417 2.19-1.25 3.07-.96 1.03-2.14 1.62-3.36 1.52-.03-1.1.44-2.22 1.27-3.1.93-.99 2.21-1.6 3.34-1.49zM20.46 17.16c-.53 1.2-.78 1.74-1.46 2.8-.95 1.48-2.29 3.33-3.95 3.35-1.48.01-1.86-.97-3.87-.96-2.01.01-2.43.98-3.91.96-1.66-.02-2.93-1.68-3.88-3.16-2.66-4.14-2.94-9-1.3-11.58 1.17-1.84 3.01-2.92 4.74-2.92 1.76 0 2.87 .98 4.33 .98 1.42 0 2.28-.98 4.32-.98 1.54 0 3.17 .85 4.33 2.31-3.8 2.1-3.18 7.57 .65 9.2z" />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}

function GenericIcon({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-foreground", className)}
      aria-hidden="true"
    >
      {label.slice(0, 1)}
    </span>
  );
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  google: GoogleIcon,
  github: GitHubIcon,
  apple: AppleIcon,
  microsoft: MicrosoftIcon,
};

export function OAuthButtons({ mode, returnTo = "/dashboard", disabled = false, className }: OAuthButtonsProps) {
  const capabilities = useAuthCapabilities();
  const providers = socialProviders(capabilities);
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  if (providers.length === 0) return null;

  const actionText = mode === "signin" ? "Continue with" : "Sign up with";

  const handleOAuth = async (strategy: string) => {
    setError("");
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    try {
      window.sessionStorage.setItem(OAUTH_RETURN_TO_KEY, returnTo);
    } catch {
      // storage unavailable
    }
    const options = {
      strategy: strategy as never,
      redirectUrl: `${origin}/api/auth/callback`,
      redirectUrlComplete: `${origin}${returnTo.startsWith("/") ? returnTo : `/${returnTo}`}`,
    };
    setPending(strategy);
    try {
      if (mode === "signin" && signIn && signInLoaded) {
        await signIn.authenticateWithRedirect(options);
      } else if (mode === "signup" && signUp && signUpLoaded) {
        await signUp.authenticateWithRedirect(options);
      } else {
        setError("Sign-in is still loading. Please try again in a moment.");
      }
    } catch (cause) {
      setError(clerkErrorMessage(cause, "We could not start that sign-in. Please try again."));
    } finally {
      setPending(null);
    }
  };

  return (
    <div data-slot="oauth-buttons" className={cn("flex flex-col gap-2", className)}>
      {error && <AuthError message={error} />}
      {providers.map((provider) => {
        const Icon = ICONS[provider.key];
        return (
          <Button
            key={provider.strategy}
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled || pending !== null}
            className="w-full gap-2"
            onClick={() => handleOAuth(provider.strategy)}
          >
            {Icon ? <Icon className="size-4" /> : <GenericIcon label={provider.label} className="size-4" />}
            <span>
              {actionText} {provider.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
