/**
 * LoginForm — sign-in that follows the site's Clerk configuration.
 *
 * Handles every status Clerk can return: password, email code, email link,
 * phone code as first factors; TOTP, SMS and backup codes as second factors;
 * forced password reset. Which identifier is asked for (email, username,
 * phone) and whether a password box appears come from capabilities.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { clerkErrorCode, clerkErrorMessage, useSignIn } from "@/lib/auth/clerk";
import { identifierLabel, signInIdentifierKinds } from "@/lib/auth/capabilities";
import { codePromptCopy, nextSignInStep, normalizeIdentifier, type FactorLike, type SignInNext } from "@/lib/auth/clerk-flow";
import { cn } from "@/lib/utils";

import { AuthError } from "./AuthError";
import { AuthLink } from "./AuthLink";
import { CodeInput } from "./CodeInput";

interface LoginFormProps {
  returnTo?: string;
  className?: string;
}

type Step =
  | { kind: "identifier" }
  | { kind: "password" }
  | { kind: "first_code"; strategy: "email_code" | "phone_code" | "email_link"; factor: FactorLike }
  | { kind: "second_code"; strategy: "totp" | "phone_code" | "email_code" | "backup_code"; factor: FactorLike | null; alternatives: string[] }
  | { kind: "new_password" };

export function LoginForm({ returnTo = "/dashboard", className }: LoginFormProps) {
  const capabilities = useAuthCapabilities();
  const { signIn, setActive, isLoaded } = useSignIn();
  const recordFailedLogin = useMutation(api.authTracking.mutations.recordFailedLogin);

  const identifierKinds = signInIdentifierKinds(capabilities);
  const passwordAvailable =
    capabilities.attributes.password.enabled && capabilities.signIn.firstFactors.includes("password");
  const preferOtp = capabilities.signIn.preferredStrategy === "otp" || !passwordAvailable;

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>({ kind: "identifier" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const go = (url: string) => {
    if (typeof window !== "undefined") window.location.assign(url);
  };

  const reportFailure = (cause: unknown) => {
    const codeName = clerkErrorCode(cause) ?? "";
    const reason =
      /password_incorrect|form_identifier_not_found|invalid/i.test(codeName)
        ? "invalid_credentials"
        : /locked/i.test(codeName)
          ? "account_locked"
          : /too_many|rate/i.test(codeName)
            ? "rate_limited"
            : "unknown";
    void recordFailedLogin({
      email: identifier.trim() || "unknown",
      reason,
      app: "website" as const,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      description: clerkErrorMessage(cause, "Sign in failed"),
    }).catch(() => {});
  };

  const prepareFirstCode = async (factor: FactorLike, strategy: "email_code" | "phone_code" | "email_link") => {
    if (!signIn) return;
    if (strategy === "email_link") {
      const { startEmailLinkFlow } = signIn.createEmailLinkFlow();
      setStep({ kind: "first_code", strategy, factor });
      setNotice("");
      // Resolves once the link in the email is clicked (any device).
      void startEmailLinkFlow({
        emailAddressId: factor.emailAddressId ?? "",
        redirectUrl: `${window.location.origin}/login?returnTo=${encodeURIComponent(returnTo)}`,
      })
        .then(async (result) => {
          await advance(nextSignInStep(result as never, { passwordEntered: false, preferOtp: true }));
        })
        .catch((cause) => setError(clerkErrorMessage(cause, "The sign-in link could not be verified.")));
      return;
    }
    await signIn.prepareFirstFactor(
      strategy === "email_code"
        ? { strategy: "email_code", emailAddressId: factor.emailAddressId ?? "" }
        : { strategy: "phone_code", phoneNumberId: factor.phoneNumberId ?? "" },
    );
    setStep({ kind: "first_code", strategy, factor });
  };

  const prepareSecondCode = async (
    next: Extract<SignInNext, { kind: "second_code" }>,
  ) => {
    if (!signIn) return;
    if (next.strategy === "phone_code" && next.factor?.phoneNumberId) {
      await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: next.factor.phoneNumberId });
    } else if (next.strategy === "email_code") {
      await signIn.prepareSecondFactor({
        strategy: "email_code",
        ...(next.factor?.emailAddressId ? { emailAddressId: next.factor.emailAddressId } : {}),
      } as never);
    }
    setStep({ kind: "second_code", strategy: next.strategy, factor: next.factor, alternatives: next.alternatives });
  };

  const advance = async (next: SignInNext) => {
    switch (next.kind) {
      case "complete":
        if (!setActive) throw new Error("Sign-in is not ready yet.");
        await setActive({ session: next.sessionId });
        go(returnTo);
        return;
      case "password":
        setStep({ kind: "password" });
        return;
      case "first_code":
        await prepareFirstCode(next.factor, next.strategy);
        return;
      case "second_code":
        await prepareSecondCode(next);
        return;
      case "new_password":
        setStep({ kind: "new_password" });
        return;
      case "needs_identifier":
        setStep({ kind: "identifier" });
        setError("Enter your sign-in details.");
        return;
      case "unsupported":
        setError(
          `This account signs in with ${next.strategies.join(", ").replace(/_/g, " ")}, which this site does not support yet. Contact support.`,
        );
        return;
      default:
        setError("Sign in needs an extra step we could not determine. Please try again.");
    }
  };

  const submitIdentifier = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!isLoaded || !signIn) return;
    const id = normalizeIdentifier(identifier);
    if (!id) return setError(`Please enter your ${identifierLabel(identifierKinds).toLowerCase()}.`);
    const sendPassword = passwordAvailable && !preferOtp;
    if (sendPassword && !password) return setError("Please enter your password.");
    setIsSubmitting(true);
    try {
      const result = await signIn.create(sendPassword ? { identifier: id, password } : { identifier: id });
      await advance(nextSignInStep(result as never, { passwordEntered: sendPassword, preferOtp }));
    } catch (cause) {
      reportFailure(cause);
      setError(clerkErrorMessage(cause, "Sign in failed. Please check your details."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!signIn) return;
    if (!password) return setError("Please enter your password.");
    setIsSubmitting(true);
    try {
      const result = await signIn.attemptFirstFactor({ strategy: "password", password });
      await advance(nextSignInStep(result as never, { passwordEntered: true, preferOtp }));
    } catch (cause) {
      reportFailure(cause);
      setError(clerkErrorMessage(cause, "That password did not work."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!signIn || (step.kind !== "first_code" && step.kind !== "second_code")) return;
    if (!code.trim()) return setError("Enter the code you received.");
    setIsSubmitting(true);
    try {
      const result =
        step.kind === "first_code"
          ? await signIn.attemptFirstFactor({ strategy: step.strategy as "email_code" | "phone_code", code: code.trim() })
          : await signIn.attemptSecondFactor({ strategy: step.strategy, code: code.trim() });
      setCode("");
      await advance(nextSignInStep(result as never, { passwordEntered: true, preferOtp }));
    } catch (cause) {
      reportFailure(cause);
      setError(clerkErrorMessage(cause, "That code did not work. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!signIn) return;
    if (newPassword.length < Math.max(capabilities.password.minLength, 8)) {
      return setError(`Use at least ${Math.max(capabilities.password.minLength, 8)} characters.`);
    }
    setIsSubmitting(true);
    try {
      const result = await signIn.resetPassword({ password: newPassword, signOutOfOtherSessions: true });
      await advance(nextSignInStep(result as never, { passwordEntered: true, preferOtp }));
    } catch (cause) {
      setError(clerkErrorMessage(cause, "The new password was not accepted."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const useAnotherSecondFactor = async (strategy: string) => {
    if (!signIn || step.kind !== "second_code") return;
    const factors = (signIn.supportedSecondFactors ?? []) as FactorLike[];
    const factor = factors.find((item) => item.strategy === strategy) ?? null;
    await prepareSecondCode({
      kind: "second_code",
      strategy: strategy as "totp" | "phone_code" | "email_code" | "backup_code",
      factor,
      alternatives: factors.map((item) => item.strategy).filter((item) => item !== strategy),
    });
    setCode("");
  };

  const passwordField = (id: string, value: string, onChange: (v: string) => void, autoComplete: string, placeholder: string) => (
    <div className="relative">
      <Input
        id={id}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
        className="pr-8"
      />
      <button
        type="button"
        onClick={() => setShowPassword((current) => !current)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
      </button>
    </div>
  );

  // ── Steps ────────────────────────────────────────────────────────────────

  if (step.kind === "first_code" || step.kind === "second_code") {
    const copy = codePromptCopy(step.strategy, step.factor?.safeIdentifier);
    const waitingForLink = step.kind === "first_code" && step.strategy === "email_link";
    return (
      <form data-slot="login-code" className={cn("flex flex-col gap-4", className)} onSubmit={submitCode} noValidate>
        {error && <AuthError id="login-error" message={error} />}
        {notice && <p className="text-xs text-primary">{notice}</p>}
        <div>
          <p className="text-sm font-medium">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.body}</p>
        </div>
        {waitingForLink ? (
          <p className="text-xs text-muted-foreground">Waiting for you to open the link… this page will continue automatically.</p>
        ) : (
          <>
            <CodeInput id="login-code-input" value={code} onChange={setCode} label={step.strategy === "backup_code" ? "Backup code" : "Code"} />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Verifying..." : "Continue"}
            </Button>
          </>
        )}
        {step.kind === "first_code" && step.strategy !== "email_link" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isSubmitting}
            onClick={async () => {
              setError("");
              try {
                await prepareFirstCode(step.factor, step.strategy);
                setNotice("A new code is on its way.");
              } catch (cause) {
                setError(clerkErrorMessage(cause, "We could not resend the code."));
              }
            }}
          >
            Send a new code
          </Button>
        )}
        {step.kind === "second_code" && step.alternatives.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 text-xs">
            {step.alternatives.map((strategy) => (
              <button key={strategy} type="button" className="text-primary hover:underline" onClick={() => useAnotherSecondFactor(strategy)}>
                {strategy === "totp"
                  ? "Use authenticator app"
                  : strategy === "phone_code"
                    ? "Text me a code"
                    : strategy === "email_code"
                      ? "Email me a code"
                      : "Use a backup code"}
              </button>
            ))}
          </div>
        )}
        <div className="text-center">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setStep({ kind: "identifier" });
              setCode("");
              setError("");
            }}
          >
            Start over
          </button>
        </div>
      </form>
    );
  }

  if (step.kind === "new_password") {
    return (
      <form data-slot="login-new-password" className={cn("flex flex-col gap-4", className)} onSubmit={submitNewPassword} noValidate>
        {error && <AuthError id="login-error" message={error} />}
        <div>
          <p className="text-sm font-medium">Choose a new password</p>
          <p className="text-xs text-muted-foreground">Your account requires a new password before you can continue.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-new-password">New password</Label>
          {passwordField("login-new-password", newPassword, setNewPassword, "new-password", "New password")}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save and continue"}
        </Button>
      </form>
    );
  }

  if (step.kind === "password") {
    return (
      <form data-slot="login-password" className={cn("flex flex-col gap-4", className)} onSubmit={submitPassword} noValidate>
        {error && <AuthError id="login-error" message={error} />}
        <p className="text-xs text-muted-foreground">Signing in as {identifier.trim()}.</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <AuthLink to="/forgot-password">Forgot password?</AuthLink>
          </div>
          {passwordField("login-password", password, setPassword, "current-password", "Enter your password")}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign In"}
        </Button>
        <div className="text-center">
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setStep({ kind: "identifier" })}>
            Use a different account
          </button>
        </div>
      </form>
    );
  }

  const showPasswordUpFront = passwordAvailable && !preferOtp;
  const label = identifierLabel(identifierKinds);

  return (
    <form data-slot="login-form" className={cn("flex flex-col gap-4", className)} onSubmit={submitIdentifier} noValidate>
      {error && <AuthError id="login-error" message={error} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">{label}</Label>
        <Input
          id="login-email"
          type={identifierKinds.length === 1 && identifierKinds[0] === "email" ? "email" : "text"}
          placeholder={identifierKinds.includes("email") ? "you@example.com" : identifierKinds[0] === "phone" ? "+1 555 123 4567" : "yourname"}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete={identifierKinds.includes("email") ? "email" : identifierKinds[0] === "phone" ? "tel" : "username"}
          autoFocus
          required
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>

      {showPasswordUpFront && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <AuthLink to="/forgot-password">Forgot password?</AuthLink>
          </div>
          {passwordField("login-password", password, setPassword, "current-password", "Enter your password")}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !isLoaded}>
        {isSubmitting ? "Signing in..." : showPasswordUpFront ? "Sign In" : "Continue"}
      </Button>

      <div className="text-center">
        <span className="text-xs text-muted-foreground">Don't have an account? </span>
        <AuthLink to="/register">Create one</AuthLink>
      </div>
    </form>
  );
}
