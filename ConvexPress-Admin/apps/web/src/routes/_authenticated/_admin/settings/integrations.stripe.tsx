import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";

import {
  IntegrationHeader,
  type IntegrationStatus,
} from "@/components/settings/integrations/IntegrationHeader";
import { SettingsSection } from "@/components/settings/integrations/SettingsSection";
import {
  CredentialField,
  SECRET_SENTINEL,
} from "@/components/settings/integrations/CredentialField";
import { TestConnectionButton } from "@/components/settings/integrations/TestConnectionButton";
import { ModeToggle } from "@/components/settings/integrations/ModeToggle";
import { WebhookEndpointField } from "@/components/settings/integrations/WebhookEndpointField";
import { SaveBar } from "@/components/settings/integrations/SaveBar";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/stripe",
)({ component: StripeIntegrationPage });

type StripeDraft = {
  stripePublishableKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  stripeMode: "sandbox" | "production";
};

function StripeIntegrationPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "commerce.payments" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const testStripe = useAction(
    (api as any).settings.integrations.testActions.testStripe,
  );

  const [draft, setDraft] = useState<StripeDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      stripePublishableKey: settings.stripePublishableKey ?? "",
      stripeSecretKey: settings.stripeSecretKey ?? "",
      stripeWebhookSecret: settings.stripeWebhookSecret ?? "",
      stripeMode: settings.stripeMode ?? "sandbox",
    });
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return (
      draft.stripePublishableKey !== (settings.stripePublishableKey ?? "") ||
      draft.stripeSecretKey !== (settings.stripeSecretKey ?? "") ||
      draft.stripeWebhookSecret !== (settings.stripeWebhookSecret ?? "") ||
      draft.stripeMode !== (settings.stripeMode ?? "sandbox")
    );
  }, [draft, settings]);

  const status: IntegrationStatus = useMemo(() => {
    if (!settings?.stripeSecretKey) return "not_configured";
    return "connected";
  }, [settings]);

  if (!draft) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await updateSection({
        section: "commerce.payments" as any,
        values: {
          ...(settings ?? {}),
          stripePublishableKey: draft.stripePublishableKey ?? "",
          stripeSecretKey:
            draft.stripeSecretKey === null ? "" : draft.stripeSecretKey,
          stripeWebhookSecret:
            draft.stripeWebhookSecret === null ? "" : draft.stripeWebhookSecret,
          stripeMode: draft.stripeMode,
        },
      });
      toast.success("Stripe settings saved.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!settings) return;
    setDraft({
      stripePublishableKey: settings.stripePublishableKey ?? "",
      stripeSecretKey: settings.stripeSecretKey ?? "",
      stripeWebhookSecret: settings.stripeWebhookSecret ?? "",
      stripeMode: settings.stripeMode ?? "sandbox",
    });
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/+$/, "")}/webhooks/stripe`
      : "/webhooks/stripe";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <IntegrationHeader
        name="Stripe"
        description="Credit card payments. Enter your Stripe keys below; they're stored encrypted and never shown in plaintext after save."
        status={status}
        icon={<CreditCard className="h-6 w-6 text-primary" />}
        actions={
          <TestConnectionButton
            onTest={async () => {
              const r = await testStripe();
              return r as any;
            }}
            disabled={!settings?.stripeSecretKey && draft.stripeSecretKey === SECRET_SENTINEL}
          />
        }
      />

      <SettingsSection
        title="Mode"
        description="Switch between Stripe's test and live environments."
      >
        <ModeToggle
          value={draft.stripeMode}
          onChange={(v) => setDraft({ ...draft, stripeMode: v })}
        />
      </SettingsSection>

      <SettingsSection
        title="Credentials"
        description="Find your API keys in the Stripe Dashboard → Developers → API keys."
      >
        <CredentialField
          id="stripe-publishable"
          label="Publishable key"
          value={draft.stripePublishableKey}
          onChange={(v) => setDraft({ ...draft, stripePublishableKey: v })}
          placeholder={draft.stripeMode === "production" ? "pk_live_…" : "pk_test_…"}
          inputType="text"
          help="Safe to expose to the browser. Starts with pk_test_ for sandbox or pk_live_ for production."
        />
        <CredentialField
          id="stripe-secret"
          label="Secret key"
          value={draft.stripeSecretKey}
          onChange={(v) => setDraft({ ...draft, stripeSecretKey: v })}
          placeholder={draft.stripeMode === "production" ? "sk_live_…" : "sk_test_…"}
          help="Server-only. Starts with sk_test_ for sandbox or sk_live_ for production."
        />
      </SettingsSection>

      <SettingsSection
        title="Webhook endpoint"
        description="Add this URL as a webhook endpoint in Stripe Dashboard → Developers → Webhooks, then paste the signing secret below."
      >
        <WebhookEndpointField
          id="stripe-webhook-url"
          label="Endpoint URL"
          url={webhookUrl}
          help="Paste this URL into Stripe's webhook configuration. Events: payment_intent.*, charge.*, invoice.*."
        />
        <CredentialField
          id="stripe-webhook-secret"
          label="Webhook signing secret"
          value={draft.stripeWebhookSecret}
          onChange={(v) => setDraft({ ...draft, stripeWebhookSecret: v })}
          placeholder="whsec_…"
          help="Found under the webhook endpoint's 'Signing secret' section in Stripe."
        />
      </SettingsSection>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
