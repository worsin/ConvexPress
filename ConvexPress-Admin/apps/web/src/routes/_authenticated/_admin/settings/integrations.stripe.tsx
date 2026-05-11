import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
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
import { useSettingsAutosaveDraft } from "@/hooks/useSettingsAutosaveDraft";

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

  const {
    draft,
    setDraft,
    discardChanges,
    isDirty,
    autosaveStatus,
    autosaveError,
  } = useSettingsAutosaveDraft<StripeDraft, Record<string, unknown>>({
    source: settings,
    createDraft: (source) => ({
      stripePublishableKey: (source.stripePublishableKey as string | null) ?? "",
      stripeSecretKey: (source.stripeSecretKey as string | null) ?? "",
      stripeWebhookSecret: (source.stripeWebhookSecret as string | null) ?? "",
      stripeMode:
        (source.stripeMode as "sandbox" | "production" | undefined) ?? "sandbox",
    }),
    onSave: async (nextDraft) => {
      await updateSection({
        section: "commerce.payments" as any,
        values: {
          ...(settings ?? {}),
          stripePublishableKey:
            nextDraft.stripePublishableKey ?? SECRET_SENTINEL,
          stripeSecretKey: nextDraft.stripeSecretKey ?? SECRET_SENTINEL,
          stripeWebhookSecret:
            nextDraft.stripeWebhookSecret ?? SECRET_SENTINEL,
          stripeMode: nextDraft.stripeMode,
        },
      });
    },
  });

  const status: IntegrationStatus = settings?.stripeSecretKey
    ? "connected"
    : "not_configured";

  if (!draft) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

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
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, stripeMode: v } : current,
            )
          }
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
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, stripePublishableKey: v } : current,
            )
          }
          placeholder={draft.stripeMode === "production" ? "pk_live_…" : "pk_test_…"}
          inputType="text"
          help="Safe to expose to the browser. Starts with pk_test_ for sandbox or pk_live_ for production."
        />
        <CredentialField
          id="stripe-secret"
          label="Secret key"
          value={draft.stripeSecretKey}
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, stripeSecretKey: v } : current,
            )
          }
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
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, stripeWebhookSecret: v } : current,
            )
          }
          placeholder="whsec_…"
          help="Found under the webhook endpoint's 'Signing secret' section in Stripe."
        />
      </SettingsSection>

      <SaveBar
        dirty={isDirty}
        mode="autosave"
        autosaveStatus={autosaveStatus}
        autosaveError={autosaveError}
        onDiscard={discardChanges}
      />
    </div>
  );
}
