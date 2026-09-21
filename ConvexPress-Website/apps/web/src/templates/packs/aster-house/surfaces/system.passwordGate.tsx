/**
 * Aster · system.passwordGate — a centred column: eyebrow, the protected
 * title in display type, one sentence, one underline field and a pill.
 * Same rules as Core: posts submit the trimmed password and autofocus; pages
 * submit it as typed; the button waits while verifying and shows the error
 * the route returns.
 */
import { useState, type FormEvent } from "react";

import type { PasswordGateSurfaceData } from "@/templates/packs/core/surfaces/system.passwordGate";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container, Eyebrow, UnderlineInput } from "../parts";

export default function AsterSystemPasswordGate({ data }: SurfaceProps<PasswordGateSurfaceData>) {
  const { kind, title, onSubmit, isVerifying, error } = data;
  const [password, setPassword] = useState("");
  const inputId = kind === "post" ? "post-password" : "page-password";
  const canSubmit = password.trim().length > 0 && !isVerifying;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(kind === "post" ? password.trim() : password);
  }

  return (
    <Container data-slot={kind === "post" ? "password-gate" : "page-password-form"} className="flex flex-col items-center py-14 text-center md:py-20">
      <Eyebrow>Protected</Eyebrow>
      <h1 className="mt-4 max-w-[24ch] font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{title}</h1>
      <p className="mt-5 max-w-[44ch] text-base leading-8 text-muted-foreground md:text-[17px]">This content is password protected. Enter the password to view it.</p>
      <form onSubmit={submit} className="mt-10 flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex w-full flex-col gap-1.5 text-left">
          <label htmlFor={inputId} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Password
          </label>
          <UnderlineInput
            id={inputId}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            disabled={isVerifying}
            autoFocus={kind === "post"}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={error ? "border-destructive" : undefined}
          />
          {error ? (
            <p id={`${inputId}-error`} className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="primary" disabled={!canSubmit} className="w-full sm:w-auto">
          {isVerifying ? (kind === "post" ? "Verifying…" : "Checking…") : "Submit"}
        </Button>
      </form>
    </Container>
  );
}
