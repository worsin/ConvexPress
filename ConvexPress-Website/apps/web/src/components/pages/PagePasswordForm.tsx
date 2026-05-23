/**
 * PagePasswordForm - Password gate for password-protected pages
 *
 * Displayed instead of page content when a page has `visibility: "password"`.
 * The user enters the password and the parent route verifies it with the
 * public page password query. On success, the route renders the verified page
 * payload returned by the backend.
 */

import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";

interface PagePasswordFormProps {
  pageTitle: string;
  onSubmit: (password: string) => void;
  isLoading?: boolean;
  error?: string;
  className?: string;
}

export function PagePasswordForm({
  pageTitle,
  onSubmit,
  isLoading = false,
  error,
  className,
}: PagePasswordFormProps) {
  const [password, setPassword] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.trim()) {
      onSubmit(password);
    }
  }

  return (
    <div
      data-slot="page-password-form"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center",
        className,
      )}
    >
      {/* Lock icon */}
      <div className="flex size-12 items-center justify-center rounded-full border border-border bg-muted">
        <LockKeyhole className="size-5 text-muted-foreground" />
      </div>

      {/* Message */}
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold">{pageTitle}</h1>
        <p className="text-xs text-muted-foreground">
          This content is password protected. To view it, please enter the
          password below.
        </p>
      </div>

      {/* Password form */}
      <form
        onSubmit={handleSubmit}
        className="flex w-full flex-col gap-3"
      >
        <div className="flex gap-2">
          <label htmlFor="page-password" className="sr-only">
            Password
          </label>
          <input
            id="page-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="flex-1 border border-border bg-transparent px-3 py-2 text-xs outline-hidden transition-colors placeholder:text-muted-foreground focus:border-primary"
            disabled={isLoading}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="border border-primary bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? "Checking..." : "Submit"}
          </button>
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </form>
    </div>
  );
}
