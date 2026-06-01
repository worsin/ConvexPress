export type CaptchaProvider = "turnstile" | "hcaptcha" | "recaptcha" | "none";

export interface PublicFormSecurity {
  honeypotEnabled: boolean;
  honeypotFieldName: string;
  captchaEnabled: boolean;
  captchaProvider: CaptchaProvider;
  captchaSiteKey?: string | null;
  recaptchaMinScore?: number;
}

export interface SubmitSecurityEnvelope {
  honeypot?: string;
  captchaToken?: string;
  startedAt?: number;
}

export function captchaIsRequired(
  security: PublicFormSecurity | undefined,
): boolean {
  return (
    security?.captchaEnabled === true &&
    security.captchaProvider !== "none"
  );
}

export function captchaConfigProblem(
  security: PublicFormSecurity | undefined,
): string | null {
  if (!captchaIsRequired(security)) return null;
  if (!security?.captchaSiteKey?.trim()) {
    return "This form's CAPTCHA is not configured.";
  }
  return null;
}

export function buildSubmitSecurityEnvelope(args: {
  security?: PublicFormSecurity;
  honeypotValue?: string;
  captchaToken?: string;
  startedAt?: number;
  isComplete: boolean;
}): SubmitSecurityEnvelope {
  const envelope: SubmitSecurityEnvelope = {};

  if (typeof args.startedAt === "number" && Number.isFinite(args.startedAt)) {
    envelope.startedAt = args.startedAt;
  }

  if (args.security?.honeypotEnabled !== false) {
    envelope.honeypot = args.honeypotValue ?? "";
  }

  if (args.isComplete && captchaIsRequired(args.security)) {
    envelope.captchaToken = args.captchaToken ?? "";
  }

  return envelope;
}
