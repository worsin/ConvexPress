/**
 * Depot · system.passwordGate — the password prompt for protected posts and
 * pages as a card on a muted band. Same submit rules as Core: posts submit
 * the trimmed password and ignore submits while verifying; pages submit the
 * raw value. Both disable the field and button while the route verifies.
 */
import { Lock } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { PasswordGateSurfaceData } from "@/templates/packs/core/surfaces/system.passwordGate";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Label } from "../parts";
import { SystemFrame, inputClasses } from "../parts/extra-commerce";

export default function DepotPasswordGate({ data }: SurfaceProps<PasswordGateSurfaceData>) {
  const { kind, title, onSubmit, isVerifying, error } = data;
  const [password, setPassword] = useState("");
  const id = kind === "post" ? "post-password" : "page-password";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim()) return;
    if (kind === "post") {
      if (isVerifying) return;
      onSubmit(password.trim());
    } else {
      onSubmit(password);
    }
  };

  return (
    <SystemFrame slot={kind === "post" ? "password-gate" : "page-password-form"}>
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Lock className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Protected {kind}</Label>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-[13px] leading-5 text-muted-foreground">This content is password protected. Enter the password to view it.</p>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-2 text-left">
        <label htmlFor={id} className="sr-only">
          Password
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            disabled={isVerifying}
            autoFocus
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className={`${inputClasses} min-w-0 flex-1 ${error ? "border-destructive" : ""}`}
          />
          <Button type="submit" disabled={isVerifying || !password.trim()}>
            {isVerifying ? (kind === "post" ? "Verifying..." : "Checking...") : "Submit"}
          </Button>
        </div>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </SystemFrame>
  );
}
