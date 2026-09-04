/**
 * Configure dialog — edits one provider's credentials in place.
 *
 * Settings providers: the dialog loads the full (redacted) section so a save
 * writes every key back, with untouched secrets sent as the sentinel that
 * keeps the stored ciphertext. Shipping providers write through the carrier
 * module's encrypted secret store. Env providers only explain what to set.
 */

import { api } from "@backend/convex/_generated/api";
import type { IntegrationField } from "@backend/convex/integrations/registry";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CredentialField, SECRET_SENTINEL } from "@/components/settings/integrations/CredentialField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckField, Field, Notice, SelectField, TextAreaField, TextField } from "@/control/sites/forms";
import type { ProviderView } from "@/lib/integrations/model";

type Draft = Record<string, string | boolean | null>;

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Uncaught (?:Convex)?Error: ([^\n]+)/u);
  if (match) return match[1];
  const data = (error as { data?: { message?: string; errors?: Array<{ message: string }> } })?.data;
  if (data?.errors?.length) return data.errors.map((entry) => entry.message).join(" ");
  if (data?.message) return data.message;
  return message.split("\n")[0].slice(0, 200);
}

export function ConfigureDialog({
  view,
  onClose,
  onVerify,
}: {
  view: ProviderView;
  onClose: () => void;
  onVerify: (providerId: string) => Promise<void>;
}) {
  const { definition } = view;
  const storage = definition.storage;
  const section = storage.kind === "settings" ? storage.section : null;
  const stored = useQuery(
    api.settings.queries.getBySection,
    section ? { section: section as never } : "skip",
  ) as Record<string, unknown> | null | undefined;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const saveProviderSecret = useMutation((api as never as { shipping: { mutations: { saveProviderSecret: never } } }).shipping.mutations.saveProviderSecret);
  const upsertConnectionMetadata = useMutation(
    (api as never as { shipping: { mutations: { upsertConnectionMetadata: never } } }).shipping.mutations.upsertConnectionMetadata,
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [shippingMode, setShippingMode] = useState<"sandbox" | "production">(
    (view.overview?.shipping?.mode as "sandbox" | "production" | null) ?? "production",
  );
  const [busy, setBusy] = useState<"save" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed the draft once the stored section arrives (settings storage) or
  // immediately (shipping / env storage).
  useEffect(() => {
    if (draft) return;
    if (storage.kind === "settings") {
      if (stored === undefined) return;
      const next: Draft = {};
      for (const field of definition.fields) {
        const value = stored?.[field.key];
        if (field.kind === "secret" || field.kind === "json") {
          next[field.key] = view.fieldState[field.key] === "set" ? SECRET_SENTINEL : "";
        } else if (field.kind === "toggle") {
          next[field.key] = typeof value === "boolean" ? value : false;
        } else {
          next[field.key] =
            typeof value === "string" && value !== SECRET_SENTINEL
              ? value
              : typeof field.defaultValue === "string"
                ? field.defaultValue
                : "";
        }
      }
      setDraft(next);
    } else if (storage.kind === "shipping") {
      const next: Draft = {};
      for (const field of view.overview?.shipping?.credentialFields ?? []) next[field.key] = "";
      setDraft(next);
    } else {
      setDraft({});
    }
  }, [draft, definition.fields, storage.kind, stored, view.fieldState, view.overview]);

  const loading = draft === null;
  const missingRequired = useMemo(() => {
    if (!draft) return [];
    if (storage.kind === "shipping") {
      return (view.overview?.shipping?.credentialFields ?? [])
        .filter((field) => field.required && !String(draft[field.key] ?? "").trim())
        .map((field) => field.label);
    }
    // Only credentials gate "Save and verify"; a missing non-secret value
    // (publishable key, from address) is something verification reports.
    return definition.fields
      .filter((field) => field.required && (field.kind === "secret" || field.kind === "json"))
      .filter((field) => {
        const value = draft[field.key];
        if (value === SECRET_SENTINEL) return false;
        if (typeof value === "string" && value.trim()) return false;
        // Env fallback satisfies a required field.
        return view.fieldState[field.key] !== "env";
      })
      .map((field) => field.label);
  }, [draft, definition.fields, storage.kind, view.fieldState, view.overview]);

  const save = async (thenVerify: boolean) => {
    if (!draft) return;
    setError(null);
    setBusy("save");
    try {
      if (storage.kind === "settings" && section) {
        const values: Record<string, unknown> = { ...(stored ?? {}) };
        delete values._id;
        delete values.updatedAt;
        delete values.updatedBy;
        for (const field of definition.fields) {
          const value = draft[field.key];
          if (field.kind === "secret" || field.kind === "json") {
            values[field.key] = value === null ? SECRET_SENTINEL : value;
          } else {
            values[field.key] = value ?? "";
          }
        }
        await updateSection({ section: section as never, values });
      } else if (storage.kind === "shipping") {
        const credentials: Record<string, string> = {};
        for (const field of view.overview?.shipping?.credentialFields ?? []) {
          credentials[field.key] = String(draft[field.key] ?? "");
        }
        await (saveProviderSecret as unknown as (args: unknown) => Promise<unknown>)({
          provider: storage.provider,
          credentials,
        });
        await (upsertConnectionMetadata as unknown as (args: unknown) => Promise<unknown>)({
          provider: storage.provider,
          displayName: definition.title,
          enabled: true,
          mode: shippingMode,
          isPrimary: storage.provider === "shipstation",
          rateShoppingEnabled: true,
          rateShoppingPriority: 100,
        });
      }
      if (thenVerify) {
        setBusy("verify");
        await onVerify(definition.id);
      }
      onClose();
    } catch (cause) {
      setError(friendly(cause));
    } finally {
      setBusy(null);
    }
  };

  const renderField = (field: IntegrationField) => {
    if (!draft) return null;
    const value = draft[field.key];
    const set = (next: string | boolean | null) => setDraft((current) => ({ ...(current ?? {}), [field.key]: next }));
    const envHint =
      field.env && view.fieldState[field.key] === "env"
        ? `Currently supplied by ${field.env}. Saving a value here overrides it.`
        : field.help;
    switch (field.kind) {
      case "secret":
        return (
          <CredentialField
            key={field.key}
            id={`${definition.id}-${field.key}`}
            label={field.required ? field.label : `${field.label} (optional)`}
            value={value as string | null}
            onChange={set}
            placeholder={field.placeholder}
            help={envHint}
            allowClear
          />
        );
      case "json":
        return (
          <Field key={field.key} label={field.label} hint={envHint} optional={!field.required}>
            {(id, describedBy) =>
              value === SECRET_SENTINEL ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-3 py-1.5 font-mono text-[12px]">•••• saved</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => set(null)}>
                    Replace
                  </Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${field.label}`} onClick={() => set("")}>
                    Remove
                  </Button>
                </div>
              ) : (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => set(event.target.value)}
                  rows={6}
                  spellCheck={false}
                  placeholder='{"type": "service_account", …}'
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-[12px] leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                />
              )
            }
          </Field>
        );
      case "select":
        return (
          <SelectField
            key={field.key}
            label={field.label}
            value={String(value ?? field.options?.[0]?.value ?? "")}
            onChange={(next) => set(next)}
            options={field.options ?? []}
            hint={envHint}
          />
        );
      case "toggle":
        return (
          <CheckField key={field.key} label={field.label} checked={value === true} onChange={(next) => set(next)} hint={field.help} />
        );
      default:
        return (
          <TextField
            key={field.key}
            label={field.label}
            value={typeof value === "string" ? value : ""}
            onChange={(next) => set(next)}
            placeholder={field.placeholder}
            hint={envHint}
            optional={!field.required}
            type={field.kind === "email" ? "email" : field.kind === "url" ? "url" : "text"}
            mono={field.kind === "url"}
          />
        );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[calc(100vh-3rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
            {definition.title}
          </DialogTitle>
          <DialogDescription className="text-[13.5px] leading-6">{definition.description}</DialogDescription>
        </DialogHeader>

        {error && <Notice tone="error">{error}</Notice>}

        {loading ? (
          <Notice tone="pending">Loading current configuration…</Notice>
        ) : storage.kind === "env" ? (
          <div className="space-y-3">
            <Notice tone="info">
              These secrets are read from the Convex deployment environment only. Set them in the Convex
              dashboard under Settings → Environment variables, then verify here.
            </Notice>
            <ul className="space-y-2">
              {definition.fields.map((field) => (
                <li key={field.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">{field.label}</span>
                    <span className="block font-mono text-[11.5px] text-muted-foreground">{field.env}</span>
                  </span>
                  <span
                    className={
                      view.fieldState[field.key] === "env"
                        ? "rounded-full border border-success/40 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success"
                        : "rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                    }
                  >
                    {view.fieldState[field.key] === "env" ? "Set" : "Not set"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : storage.kind === "shipping" ? (
          <form
            aria-label={`Configure ${definition.title}`}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(true);
            }}
          >
            <SelectField
              label="Mode"
              value={shippingMode}
              onChange={setShippingMode}
              options={[
                { value: "sandbox", label: "Sandbox / test" },
                { value: "production", label: "Production / live" },
              ]}
            />
            {(view.overview?.shipping?.credentialFields ?? []).map((field) =>
              field.type === "password" ? (
                <CredentialField
                  key={field.key}
                  id={`${definition.id}-${field.key}`}
                  label={field.label}
                  inputType="password"
                  value={(draft?.[field.key] as string | null) ?? ""}
                  onChange={(next) => setDraft((current) => ({ ...(current ?? {}), [field.key]: next ?? "" }))}
                  placeholder={field.placeholder ?? undefined}
                />
              ) : (
                <TextField
                  key={field.key}
                  label={field.label}
                  value={String(draft?.[field.key] ?? "")}
                  onChange={(next) => setDraft((current) => ({ ...(current ?? {}), [field.key]: next }))}
                  placeholder={field.placeholder ?? undefined}
                  optional={!field.required}
                  mono={field.type === "url"}
                />
              ),
            )}
            {view.overview?.shipping?.secretStored && (
              <p className="text-[12px] text-muted-foreground">
                Credentials are already stored. Saving replaces them; leave the form empty and close to keep them.
              </p>
            )}
          </form>
        ) : (
          <form
            aria-label={`Configure ${definition.title}`}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(true);
            }}
          >
            {definition.fields.map(renderField)}
          </form>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
            {definition.consoleUrl && (
              <a href={definition.consoleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Provider console
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            )}
            {definition.docsUrl && (
              <a href={definition.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Docs
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy !== null}>
              {storage.kind === "env" ? "Close" : "Cancel"}
            </Button>
            {storage.kind === "env" ? (
              definition.verifiable && (
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy("verify");
                    try {
                      await onVerify(definition.id);
                      onClose();
                    } catch (cause) {
                      setError(friendly(cause));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === "verify" && <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />}
                  Verify now
                </Button>
              )
            ) : (
              <>
                <Button type="button" variant="outline" disabled={loading || busy !== null} onClick={() => void save(false)}>
                  {busy === "save" && <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />}
                  Save
                </Button>
                {definition.verifiable && (
                  <Button
                    type="button"
                    disabled={loading || busy !== null || missingRequired.length > 0}
                    title={missingRequired.length ? `Missing: ${missingRequired.join(", ")}` : undefined}
                    onClick={() => void save(true)}
                  >
                    {busy === "verify" && <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />}
                    Save and verify
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// TextAreaField is intentionally unused for JSON so the sentinel state can be rendered inline.
void TextAreaField;
