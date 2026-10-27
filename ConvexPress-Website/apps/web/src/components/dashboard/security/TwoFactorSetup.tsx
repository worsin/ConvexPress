/**
 * Setting up two-step verification, built as part of the site rather than
 * Clerk's own screens: an authenticator app (scan a QR code, confirm a code)
 * or text messages, then backup codes to keep.
 */
import { CheckCircle2, Copy, Download, KeyRound, MessageSquareText, ShieldCheck, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  backupCodesFile,
  backupCodesFileName,
  groupSetupKey,
  maskPhoneNumber,
  normalizePhoneNumber,
  normalizeTotpCode,
  twoFactorErrorMessage,
} from "@/lib/auth/two-factor";

import type { TwoFactorEnrollment } from "./useAccountSecurity";

type Method = "authenticator" | "text";

type Step =
  | { kind: "intro" }
  | { kind: "scan"; uri: string; secret: string }
  | { kind: "phone" }
  | { kind: "phone-code"; phoneId: string; phoneNumber: string }
  | { kind: "backup"; codes: string[]; method: Method }
  | { kind: "done"; method: Method };

const MISMATCH = "That code didn't match. Codes change every 30 seconds, so enter the newest one.";

/** Copy text, or say how to copy it by hand. */
export async function copyText(text: string, what: string): Promise<string> {
  try {
    await navigator.clipboard.writeText(text);
    return `${what} copied.`;
  } catch {
    return `Copying isn't available here. Select the ${what.toLowerCase()} and copy it yourself.`;
  }
}

/** Save the backup codes as a text file. */
export function downloadBackupCodes(siteName: string, codes: readonly string[]): void {
  const url = URL.createObjectURL(new Blob([backupCodesFile(siteName, codes, new Date())], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = backupCodesFileName(siteName);
  link.click();
  URL.revokeObjectURL(url);
}

export function BackupCodesList({ codes, siteName, onNotice }: { codes: readonly string[]; siteName: string; onNotice: (notice: string) => void }) {
  return (
    <div className="space-y-3">
      <ul aria-label="Backup codes" className="grid max-w-md grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((backupCode) => (
          <li key={backupCode} className="rounded border border-border bg-muted/40 px-2 py-1.5 text-center">
            {backupCode}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copyText(codes.join("\n"), "Backup codes").then(onNotice)}>
          <Copy className="size-3.5" aria-hidden="true" />
          Copy codes
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            downloadBackupCodes(siteName, codes);
            onNotice("Backup codes downloaded.");
          }}
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download
        </Button>
      </div>
    </div>
  );
}

export function TwoFactorSetup({
  enrollment,
  siteName,
  onDone,
  onCancel,
}: {
  enrollment: TwoFactorEnrollment;
  siteName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { options } = enrollment;
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [code, setCode] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step.kind]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(twoFactorErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  /** Backup codes when the site offers them (issued now if Clerk returned none), then done. */
  const afterEnrollment = async (method: Method, returned: string[] = []) => {
    let codes = returned;
    if (codes.length === 0 && options.backupCodes) codes = await enrollment.createBackupCodes().catch(() => []);
    setSaved(false);
    setStep(codes.length > 0 ? { kind: "backup", codes, method } : { kind: "done", method });
  };

  const startAuthenticator = () =>
    run(async () => {
      const totp = await enrollment.createTotp();
      if (!totp.uri || !totp.secret) throw new Error("Clerk returned no authenticator key");
      setCode("");
      setStep({ kind: "scan", uri: totp.uri, secret: totp.secret });
    });

  const verifyAuthenticator = (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    void run(async () => {
      const result = await enrollment.verifyTotp(code);
      if (!result.verified) {
        setError(MISMATCH);
        return;
      }
      await afterEnrollment("authenticator", result.backupCodes);
    });
  };

  const sendPhoneCode = (event: FormEvent) => {
    event.preventDefault();
    const phoneNumber = normalizePhoneNumber(phoneInput);
    if (!phoneNumber) {
      setError("Enter a mobile number, such as (702) 555-0100, or with its country code.");
      return;
    }
    void run(async () => {
      const added = await enrollment.sendPhoneCode(phoneNumber);
      setCode("");
      setStep({ kind: "phone-code", phoneId: added.id, phoneNumber: added.phoneNumber });
    });
  };

  const verifyPhone = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== "phone-code") return;
    if (code.length !== 6) {
      setError("Enter the 6-digit code we texted you.");
      return;
    }
    const { phoneId } = step;
    void run(async () => {
      await enrollment.verifyPhoneCode(phoneId, code);
      await afterEnrollment("text");
    });
  };

  const heading = (text: string) => (
    <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
      {text}
    </h3>
  );

  const codeField = (id: string, help: string) => (
    <div className="max-w-xs space-y-1.5">
      <Label htmlFor={id}>6-digit code</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(normalizeTotpCode(event.target.value))}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );

  const cancel =
    step.kind === "done" || step.kind === "backup" ? null : (
      <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    );

  let body: ReactNode = null;
  if (step.kind === "intro") {
    body = (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-2">
            {heading("Add a second step to sign-in")}
            <p className="text-sm text-muted-foreground">
              Each time you sign in on a new device, you'll also enter a 6-digit code from{" "}
              {options.authenticatorApp && options.textMessage
                ? "an authenticator app, or a text message"
                : options.authenticatorApp
                  ? "an authenticator app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy"
                  : "a text message to your phone"}
              . Someone who learns your password still can't get in.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.authenticatorApp ? (
            <Button onClick={() => void startAuthenticator()} disabled={busy}>
              <Smartphone className="size-4" aria-hidden="true" />
              {busy ? "Starting…" : options.textMessage ? "Use an authenticator app (recommended)" : "Use an authenticator app"}
            </Button>
          ) : null}
          {options.textMessage ? (
            <Button
              variant={options.authenticatorApp ? "outline" : "default"}
              onClick={() => {
                setError(null);
                setPhoneInput("");
                setStep({ kind: "phone" });
              }}
              disabled={busy}
            >
              <MessageSquareText className="size-4" aria-hidden="true" />
              Use text messages
            </Button>
          ) : null}
          {cancel}
        </div>
      </div>
    );
  } else if (step.kind === "scan") {
    body = (
      <form onSubmit={verifyAuthenticator} className="space-y-5">
        <div className="space-y-1">
          {heading("Scan this code with your authenticator app")}
          <p className="text-sm text-muted-foreground">In the app, add an account and scan the code. It will start showing 6-digit codes.</p>
        </div>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={step.uri} size={176} level="M" marginSize={1} title={`Authenticator setup code for ${siteName}`} />
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Can't scan it? Enter this key instead:</p>
            <code className="block break-all rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-sm font-semibold tracking-wider" data-slot="setup-key">
              {groupSetupKey(step.secret)}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyText(step.secret, "Setup key").then(setNotice)}>
              <Copy className="size-3.5" aria-hidden="true" />
              Copy key
            </Button>
          </div>
        </div>
        {codeField("two-step-code", `The code your app shows for ${siteName} right now.`)}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Turn on two-step verification"}
          </Button>
          {cancel}
        </div>
      </form>
    );
  } else if (step.kind === "phone") {
    const { verifiedPhone } = enrollment;
    body = (
      <div className="space-y-5">
        <div className="space-y-1">
          {heading("Get sign-in codes by text")}
          <p className="text-sm text-muted-foreground">We'll text a 6-digit code to this phone when you sign in on a new device.</p>
        </div>
        {verifiedPhone ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">Use the number already on your account, {maskPhoneNumber(verifiedPhone.phoneNumber)}?</p>
            <Button
              onClick={() =>
                void run(async () => {
                  await enrollment.usePhone(verifiedPhone.id);
                  await afterEnrollment("text");
                })
              }
              disabled={busy}
            >
              {busy ? "Saving…" : `Use ${maskPhoneNumber(verifiedPhone.phoneNumber)}`}
            </Button>
          </div>
        ) : null}
        <form onSubmit={sendPhoneCode} className="space-y-3">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="two-step-phone">{verifiedPhone ? "Or another mobile number" : "Mobile number"}</Label>
            <Input
              id="two-step-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              placeholder="(702) 555-0100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={verifiedPhone ? "outline" : "default"} disabled={busy || phoneInput.trim() === ""}>
              {busy ? "Sending…" : "Text me a code"}
            </Button>
            {cancel}
          </div>
        </form>
      </div>
    );
  } else if (step.kind === "phone-code") {
    const { phoneId } = step;
    body = (
      <form onSubmit={verifyPhone} className="space-y-5">
        <div className="space-y-1">
          {heading("Enter the code we texted you")}
          <p className="text-sm text-muted-foreground">We sent a 6-digit code to {maskPhoneNumber(step.phoneNumber)}. It can take a minute to arrive.</p>
        </div>
        {codeField("two-step-phone-code", "The code from the text message.")}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Turn on two-step verification"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void run(async () => {
                await enrollment.resendPhoneCode(phoneId);
                setNotice("A new code is on its way.");
              })
            }
            disabled={busy}
          >
            Send a new code
          </Button>
          {cancel}
        </div>
      </form>
    );
  } else if (step.kind === "backup") {
    const { codes, method } = step;
    body = (
      <div className="space-y-5">
        <div className="space-y-1">
          {heading("Save your backup codes")}
          <p className="text-sm text-muted-foreground">If you lose your phone, each code signs you in once. They won't be shown again.</p>
        </div>
        <BackupCodesList codes={codes} siteName={siteName} onNotice={setNotice} />
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
          I've saved my backup codes somewhere safe
        </label>
        <Button onClick={() => setStep({ kind: "done", method })} disabled={!saved}>
          <KeyRound className="size-4" aria-hidden="true" />
          Continue
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            {heading("Two-step verification is on")}
            <p className="text-sm text-muted-foreground">
              {step.method === "authenticator"
                ? "When you sign in on a new device, you'll be asked for a code from your authenticator app."
                : "When you sign in on a new device, we'll text a code to your phone."}
            </p>
          </div>
        </div>
        <Button
          onClick={() =>
            void run(async () => {
              await enrollment.finish();
              onDone();
            })
          }
          disabled={busy}
        >
          {busy ? "Finishing…" : "Done"}
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Two-step verification setup" className="space-y-5" data-step={step.kind}>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {notice}
      </p>
      {body}
    </section>
  );
}
