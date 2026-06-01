import { Link, useLocation } from "@tanstack/react-router";
import { AlertCircle, Clock, LockKeyhole } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PublicFormAvailability {
  open: boolean;
  code?: string;
  message?: string;
  loginRequired?: boolean;
  entryLimitReached?: boolean;
}

export interface PublicFormSettings {
  disabled?: boolean | null;
  scheduleStart?: number | null;
  scheduleEnd?: number | null;
  schedule?: { startsAt?: number | null; endsAt?: number | null } | null;
  entryLimit?: number | null;
  requireLogin?: boolean | null;
  loginRequired?: boolean | null;
  [key: string]: unknown;
}

export type FormClosedState =
  | { open: true }
  | {
      open: false;
      code: "FORM_DISABLED" | "FORM_NOT_OPEN" | "FORM_CLOSED" | "ENTRY_LIMIT_REACHED";
      message: string;
    };

type FormClosedCode = Exclude<FormClosedState, { open: true }>["code"];

export function parsePublicFormSettings(settings: string | undefined): PublicFormSettings {
  if (!settings) return {};
  try {
    const parsed = JSON.parse(settings);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as PublicFormSettings;
  } catch {
    return {};
  }
}

export function publicFormRequiresLogin(
  settings: PublicFormSettings,
  availability?: PublicFormAvailability,
): boolean {
  return (
    availability?.loginRequired === true ||
    settings.requireLogin === true ||
    settings.loginRequired === true
  );
}

export function getFormClosedState(
  settings: PublicFormSettings,
  availability?: PublicFormAvailability,
  now: number = Date.now(),
): FormClosedState {
  if (availability && !availability.open) {
    return {
      open: false,
      code: normalizeClosedCode(availability.code),
      message: availability.message || messageForCode(availability.code),
    };
  }
  if (settings.disabled === true) {
    return {
      open: false,
      code: "FORM_DISABLED",
      message: "This form is not currently accepting responses.",
    };
  }

  const start = finiteNumberOrNull(settings.scheduleStart) ??
    finiteNumberOrNull(settings.schedule?.startsAt);
  if (start !== null && now < start) {
    return {
      open: false,
      code: "FORM_NOT_OPEN",
      message: "This form is not open yet.",
    };
  }

  const end = finiteNumberOrNull(settings.scheduleEnd) ??
    finiteNumberOrNull(settings.schedule?.endsAt);
  if (end !== null && now > end) {
    return {
      open: false,
      code: "FORM_CLOSED",
      message: "This form is closed.",
    };
  }

  return { open: true };
}

export function FormStateNotice({ state }: { state: Exclude<FormClosedState, { open: true }> }) {
  const Icon = state.code === "FORM_NOT_OPEN" ? Clock : AlertCircle;
  return (
    <div
      data-slot="form-state-notice"
      role="status"
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-5 text-card-foreground"
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{noticeTitle(state.code)}</h2>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    </div>
  );
}

export function FormLoginRequiredNotice() {
  const location = useLocation();
  const returnTo = location.pathname + (location.hash ? `#${location.hash}` : "");

  return (
    <div
      data-slot="form-login-required"
      role="status"
      className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 text-center text-card-foreground"
    >
      <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <LockKeyhole className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Sign in to continue</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          You need to be signed in before submitting this form.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          to="/login"
          search={{ returnTo }}
          className={cn(buttonVariants({ variant: "default", size: "default" }))}
        >
          Sign in
        </Link>
        <Link
          to="/register"
          search={{ returnTo }}
          className={cn(buttonVariants({ variant: "outline", size: "default" }))}
        >
          Create account
        </Link>
      </div>
    </div>
  );
}

function normalizeClosedCode(code: string | undefined): FormClosedCode {
  if (
    code === "FORM_DISABLED" ||
    code === "FORM_NOT_OPEN" ||
    code === "FORM_CLOSED" ||
    code === "ENTRY_LIMIT_REACHED"
  ) {
    return code;
  }
  return "FORM_CLOSED";
}

function messageForCode(code: string | undefined): string {
  switch (code) {
    case "FORM_DISABLED":
      return "This form is not currently accepting responses.";
    case "FORM_NOT_OPEN":
      return "This form is not open yet.";
    case "ENTRY_LIMIT_REACHED":
      return "This form has reached its entry limit.";
    default:
      return "This form is closed.";
  }
}

function noticeTitle(code: string): string {
  switch (code) {
    case "FORM_NOT_OPEN":
      return "Form not open yet";
    case "ENTRY_LIMIT_REACHED":
      return "Entry limit reached";
    case "FORM_DISABLED":
      return "Form unavailable";
    default:
      return "Form closed";
  }
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
