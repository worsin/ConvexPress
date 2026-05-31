import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ShieldOff, Settings, ShieldCheck, Check, X } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Capability } from "@backend/convex/types/capabilities";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Cast a `form.*` capability string to `Capability`. Mirrors the backend helper
 * in convex/extensions/forms/spam.ts — surfaced here, registered by the
 * Role/Capability expert, so not yet in the closed `Capability` union.
 */
const formCap = (cap: string): Capability => cap as Capability;

export const Route = createFileRoute("/_authenticated/_admin/forms/settings")({
  component: FormsSettingsPage,
});

function FormsSettingsPage() {
  return (
    <PluginGuard pluginId="forms">
      <FormsSettingsContent />
    </PluginGuard>
  );
}

/** The editable security-settings shape (mirrors updateSecuritySettings args). */
interface SecurityForm {
  captchaProvider: "turnstile" | "hcaptcha" | "recaptcha" | "none";
  captchaSiteKey: string;
  captchaEnabled: boolean;
  recaptchaMinScore: number;
  honeypotEnabled: boolean;
  honeypotFieldName: string;
  minFillMs: number;
  maxFormAgeMs: number;
  rateLimitEnabled: boolean;
  windowMs: number;
  perIpPerFormLimit: number;
  perFormLimit: number;
  failClosed: boolean;
  skipForLoggedIn: boolean;
}

function FormsSettingsContent() {
  const canManage = useCan(formCap("form.manage_security"));

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <ShieldOff className="mx-auto mb-3 size-8 text-muted-foreground/40" />
          <h1 className="text-lg font-semibold text-foreground">
            Insufficient permissions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You don&apos;t have permission to manage Forms settings.
          </p>
          <Link to="/forms" className="mt-4 inline-block">
            <Button variant="outline">Back to Forms</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <SecuritySettingsForm />;
}

function SecuritySettingsForm() {
  const settings = useQuery(api.extensions.forms.spam.getSecuritySettings, {});
  const updateSettings = useMutation(
    api.extensions.forms.spam.updateSecuritySettings,
  );
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<SecurityForm | null>(null);

  // Hydrate the draft once the query resolves (and keep it if the user edits).
  const initial: SecurityForm | null = useMemo(() => {
    if (settings === undefined) return null;
    return {
      captchaProvider: settings.captchaProvider,
      captchaSiteKey: settings.captchaSiteKey ?? "",
      captchaEnabled: settings.captchaEnabled,
      recaptchaMinScore: settings.recaptchaMinScore,
      honeypotEnabled: settings.honeypotEnabled,
      honeypotFieldName: settings.honeypotFieldName,
      minFillMs: settings.minFillMs,
      maxFormAgeMs: settings.maxFormAgeMs,
      rateLimitEnabled: settings.rateLimitEnabled,
      windowMs: settings.windowMs,
      perIpPerFormLimit: settings.perIpPerFormLimit,
      perFormLimit: settings.perFormLimit ?? 0,
      failClosed: settings.failClosed,
      skipForLoggedIn: settings.skipForLoggedIn,
    };
  }, [settings]);

  const form = draft ?? initial;

  if (settings === undefined || form === null) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="h-64 animate-pulse rounded-3xl border border-border bg-card" />
      </div>
    );
  }

  const set = <K extends keyof SecurityForm>(key: K, value: SecurityForm[K]) => {
    setDraft({ ...form, [key]: value });
  };

  const handleSave = async () => {
    // Diff against the server-derived initial so we only send changed fields.
    const base = initial as SecurityForm;
    const changed: Partial<SecurityForm> = {};
    (Object.keys(form) as (keyof SecurityForm)[]).forEach((key) => {
      if (form[key] !== base[key]) {
        // @ts-expect-error narrowing across the union key is safe here.
        changed[key] = form[key];
      }
    });
    if (Object.keys(changed).length === 0) {
      toast.info("No changes to save.");
      return;
    }
    // perFormLimit of 0 means "no per-form ceiling" — omit it rather than send 0
    // (the mutation rejects limits <= 0).
    if (changed.perFormLimit === 0) delete changed.perFormLimit;

    setSaving(true);
    try {
      await updateSettings(changed);
      toast.success("Security settings saved.");
      setDraft(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Forms Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Spam protection, CAPTCHA, and submission rate limits.
          </p>
        </div>
      </div>

      {/* ── CAPTCHA ── */}
      <Card>
        <CardHeader>
          <CardTitle>CAPTCHA</CardTitle>
          <CardDescription>
            Require a CAPTCHA challenge on public submissions. Secret keys are set
            via environment variables (<code>npx convex env set</code>), never
            stored here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            id="captchaEnabled"
            label="Enable CAPTCHA verification"
            checked={form.captchaEnabled}
            onChange={(v) => set("captchaEnabled", v)}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="captchaProvider">Provider</Label>
            <Select
              value={form.captchaProvider}
              onValueChange={(val) =>
                set("captchaProvider", val as SecurityForm["captchaProvider"])
              }
            >
              <SelectTrigger id="captchaProvider" className="w-full">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="turnstile">Cloudflare Turnstile</SelectItem>
                <SelectItem value="hcaptcha">hCaptcha</SelectItem>
                <SelectItem value="recaptcha">Google reCAPTCHA v3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="captchaSiteKey">Public site key</Label>
            <Input
              id="captchaSiteKey"
              value={form.captchaSiteKey}
              onChange={(e) => set("captchaSiteKey", e.target.value)}
              placeholder="Public site key (safe to expose)"
            />
          </div>

          {form.captchaProvider === "recaptcha" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recaptchaMinScore">
                reCAPTCHA minimum score (0–1)
              </Label>
              <Input
                id="recaptchaMinScore"
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={form.recaptchaMinScore}
                onChange={(e) =>
                  set("recaptchaMinScore", Number(e.target.value))
                }
              />
            </div>
          ) : null}

          {/* Secret presence (read-only; booleans only — never the secret). */}
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Secret keys (environment)
            </p>
            <div className="flex flex-col gap-1.5">
              <SecretRow
                label="FORMS_TURNSTILE_SECRET_KEY"
                present={settings.secretPresence.turnstile}
              />
              <SecretRow
                label="FORMS_HCAPTCHA_SECRET_KEY"
                present={settings.secretPresence.hcaptcha}
              />
              <SecretRow
                label="FORMS_RECAPTCHA_SECRET_KEY"
                present={settings.secretPresence.recaptcha}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Honeypot & time-trap ── */}
      <Card>
        <CardHeader>
          <CardTitle>Honeypot &amp; time-trap</CardTitle>
          <CardDescription>
            Catch bots with a hidden field and reject suspiciously fast or stale
            submissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            id="honeypotEnabled"
            label="Enable honeypot and time-trap"
            checked={form.honeypotEnabled}
            onChange={(v) => set("honeypotEnabled", v)}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="honeypotFieldName">Honeypot field name</Label>
            <Input
              id="honeypotFieldName"
              value={form.honeypotFieldName}
              onChange={(e) => set("honeypotFieldName", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="minFillMs">Minimum fill time (ms)</Label>
              <Input
                id="minFillMs"
                type="number"
                min="0"
                max="60000"
                value={form.minFillMs}
                onChange={(e) => set("minFillMs", Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxFormAgeMs">Maximum form age (ms)</Label>
              <Input
                id="maxFormAgeMs"
                type="number"
                min="1"
                value={form.maxFormAgeMs}
                onChange={(e) => set("maxFormAgeMs", Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Rate limiting ── */}
      <Card>
        <CardHeader>
          <CardTitle>Rate limiting</CardTitle>
          <CardDescription>
            Throttle repeated submissions per IP (and optionally per form) within
            a rolling window.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            id="rateLimitEnabled"
            label="Enable rate limiting"
            checked={form.rateLimitEnabled}
            onChange={(v) => set("rateLimitEnabled", v)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="windowMs">Window (ms)</Label>
              <Input
                id="windowMs"
                type="number"
                min="1"
                value={form.windowMs}
                onChange={(e) => set("windowMs", Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="perIpPerFormLimit">Per IP / form</Label>
              <Input
                id="perIpPerFormLimit"
                type="number"
                min="1"
                value={form.perIpPerFormLimit}
                onChange={(e) =>
                  set("perIpPerFormLimit", Number(e.target.value))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="perFormLimit">Per form (0 = off)</Label>
              <Input
                id="perFormLimit"
                type="number"
                min="0"
                value={form.perFormLimit}
                onChange={(e) => set("perFormLimit", Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Policy ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            id="failClosed"
            label="Fail closed when CAPTCHA is unavailable"
            checked={form.failClosed}
            onChange={(v) => set("failClosed", v)}
          />
          <ToggleRow
            id="skipForLoggedIn"
            label="Skip CAPTCHA for logged-in users"
            checked={form.skipForLoggedIn}
            onChange={(v) => set("skipForLoggedIn", v)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        {draft !== null ? (
          <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
            Reset
          </Button>
        ) : null}
        <Button onClick={handleSave} disabled={saving || draft === null}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}

function SecretRow({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <code className="text-muted-foreground">{label}</code>
      {present ? (
        <span className="inline-flex items-center gap-1 text-primary">
          <Check className="size-3.5" />
          Set
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <X className="size-3.5" />
          Not set in ENV
        </span>
      )}
    </div>
  );
}
