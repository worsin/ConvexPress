import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSignIn } from "@clerk/clerk-react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthError } from "./AuthError";
import { AuthLink } from "./AuthLink";
import { cn } from "@/lib/utils";

interface LoginFormProps {
  returnTo?: string;
  className?: string;
}

/**
 * Login form component using Clerk's useSignIn hook.
 *
 * Handles email/password login via signIn.create(). On success,
 * sets the active session and navigates to the return URL.
 */
export function LoginForm({ returnTo = "/dashboard", className }: LoginFormProps) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isLoaded || !signIn) return;

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

	      if (result.status === "complete") {
	        await setActive({ session: result.createdSessionId });
	        navigate({ to: returnTo } as any);
	      } else {
        // Handle other statuses (MFA, etc.)
        setError("Additional verification is required. Please try again.");
      }
    } catch (err: unknown) {
      // Extract Clerk error message
      const clerkError = err as { errors?: Array<{ message?: string; longMessage?: string }> };
      const message =
        clerkError?.errors?.[0]?.longMessage ??
        clerkError?.errors?.[0]?.message ??
        "Sign in failed. Please check your credentials.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      data-slot="login-form"
      className={cn("flex flex-col gap-4", className)}
      onSubmit={handleSubmit}
      noValidate
    >
      {error && <AuthError id="login-error" message={error} />}

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Password</Label>
          <AuthLink to="/forgot-password">Forgot password?</AuthLink>
        </div>
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
      </div>

      {/* Remember Me */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="login-remember"
          checked={rememberMe}
          onCheckedChange={(checked) => setRememberMe(checked === true)}
        />
        <Label htmlFor="login-remember" className="cursor-pointer">
          Remember me
        </Label>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting || !isLoaded}
      >
        {isSubmitting ? "Signing in..." : "Sign In"}
      </Button>

      {/* Register link */}
      <div className="text-center">
        <span className="text-xs text-muted-foreground">
          Don't have an account?{" "}
        </span>
        <AuthLink to="/register">Create one</AuthLink>
      </div>
    </form>
  );
}
