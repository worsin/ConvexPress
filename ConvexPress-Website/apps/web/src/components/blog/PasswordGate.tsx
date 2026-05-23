/**
 * Password Gate
 *
 * Renders a password form that gates access to password-protected posts/pages.
 * When a password is submitted, the parent route verifies it with the public
 * post password query and renders the verified backend payload on success.
 */

import { useState } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

interface PasswordGateProps {
  /** Title of the protected content (shown above the form) */
  title: string;
  /** Callback when password is submitted */
  onSubmit: (password: string) => void;
  /** Error message to display (e.g., "Incorrect password") */
  error?: string;
  /** Whether the form is in a loading/verifying state */
  isVerifying?: boolean;
  className?: string;
}

export function PasswordGate({
  title,
  onSubmit,
  error,
  isVerifying = false,
  className,
}: PasswordGateProps) {
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isVerifying) return;
    onSubmit(password.trim());
  };

  return (
    <div
      data-slot="password-gate"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-6 py-12",
        className,
      )}
    >
      {/* Lock Icon */}
      <div className="flex size-12 items-center justify-center rounded-none bg-muted text-muted-foreground">
        <Lock className="size-5" aria-hidden="true" />
      </div>

      {/* Title */}
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-xs text-muted-foreground">
          This content is password protected. Enter the password to view it.
        </p>
      </div>

      {/* Password Form */}
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="post-password"
            className="text-xs font-medium text-foreground"
          >
            Password
          </label>
          <input
            id="post-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            disabled={isVerifying}
            autoFocus
            className={cn(
              "w-full border bg-background px-3 py-2 text-sm outline-hidden transition-colors",
              "border-border placeholder:text-muted-foreground",
              "focus:border-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive",
            )}
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={!password.trim() || isVerifying}
          className={cn(
            "inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors",
            "bg-foreground text-background",
            "hover:bg-foreground/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isVerifying ? "Verifying..." : "Submit"}
        </button>
      </form>
    </div>
  );
}
