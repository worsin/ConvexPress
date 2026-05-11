import { useState } from "react";
import { useSignUp } from "@clerk/clerk-react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthError } from "./AuthError";
import { AuthLink } from "./AuthLink";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import {
  clearPendingVerificationContext,
  writePendingVerificationContext,
} from "@/lib/auth/verification";
import { cn } from "@/lib/utils";
import type { InvitationData } from "@/lib/auth/types";

interface RegisterFormProps {
  invitation?: InvitationData;
  returnTo?: string;
  className?: string;
}

/**
 * Registration form component using Clerk's useSignUp hook.
 *
 * Handles email/password registration via signUp.create(). On success,
 * prepares email verification and navigates to the verify-email page.
 */
export function RegisterForm({
  invitation,
  returnTo = "/dashboard",
  className,
}: RegisterFormProps) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isLoaded || !signUp) return;

    // Basic client-side validation
    if (!email || !firstName || !lastName) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    if (!acceptTerms) {
      setError("You must accept the Terms of Service and Privacy Policy.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      if (result.status === "complete") {
        // Registration complete (no email verification required)
        clearPendingVerificationContext();
        await setActive({ session: result.createdSessionId });
        if (typeof window !== "undefined") {
          window.location.assign(returnTo);
        }
      } else if (result.status === "missing_requirements") {
        // Email verification needed - prepare the verification
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
        writePendingVerificationContext({
          email: email.trim(),
          returnTo,
          source: "register",
        });
        if (typeof window !== "undefined") {
          const url = new URL("/verify-email", window.location.origin);
          url.searchParams.set("returnTo", returnTo);
          window.location.assign(url.toString());
        }
      } else {
        setError("Registration requires additional steps. Please try again.");
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: Array<{ message?: string; longMessage?: string }> };
      const message =
        clerkError?.errors?.[0]?.longMessage ??
        clerkError?.errors?.[0]?.message ??
        "Registration failed. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      data-slot="register-form"
      className={cn("flex flex-col gap-4", className)}
      onSubmit={handleSubmit}
      noValidate
    >
      {/* Invitation banner */}
      {invitation?.message && (
        <div
          data-slot="invitation-banner"
          className="rounded-none border border-primary/20 bg-primary/5 p-3 text-xs text-foreground"
        >
          {invitation.inviterName && (
            <p className="mb-1 font-medium">
              Invited by {invitation.inviterName}
            </p>
          )}
          <p className="text-muted-foreground">{invitation.message}</p>
        </div>
      )}

      {error && <AuthError message={error} />}

      {/* Name fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-first-name">First name</Label>
          <Input
            id="register-first-name"
            type="text"
            placeholder="Jane"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            autoFocus
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-last-name">Last name</Label>
          <Input
            id="register-last-name"
            type="text"
            placeholder="Doe"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            required
          />
        </div>
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={!!invitation?.email}
          aria-describedby={
            invitation?.email ? "register-email-note" : undefined
          }
        />
        {invitation?.email && (
          <p
            id="register-email-note"
            className="text-xs text-muted-foreground"
          >
            Email is pre-filled from your invitation.
          </p>
        )}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-password">Password</Label>
        <div className="relative">
          <Input
            id="register-password"
            type={showPassword ? "text" : "password"}
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            className="pr-8"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Eye className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
        <PasswordStrengthIndicator password={password} />
      </div>

      {/* Confirm Password */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-confirm-password">Confirm password</Label>
        <Input
          id="register-confirm-password"
          type={showPassword ? "text" : "password"}
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          aria-invalid={
            confirmPassword.length > 0 && password !== confirmPassword
              ? true
              : undefined
          }
        />
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-destructive" aria-live="polite">
            Passwords don't match
          </p>
        )}
      </div>

      {/* Terms of Service */}
      <div className="flex items-start gap-2">
        <Checkbox
          id="register-terms"
          checked={acceptTerms}
          onCheckedChange={(checked) => setAcceptTerms(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor="register-terms" className="cursor-pointer leading-normal">
          I agree to the{" "}
          <a
            href="#"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="#"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
        </Label>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting || !isLoaded}
      >
        {isSubmitting ? "Creating account..." : "Create Account"}
      </Button>

      {/* Login link */}
      <div className="text-center">
        <span className="text-xs text-muted-foreground">
          Already have an account?{" "}
        </span>
        <AuthLink to="/login">Sign in</AuthLink>
      </div>
    </form>
  );
}
