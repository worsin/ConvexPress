import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Wallet } from "lucide-react";

import {
  IntegrationHeader,
  type IntegrationStatus,
} from "@/components/settings/integrations/IntegrationHeader";
import { SettingsSection } from "@/components/settings/integrations/SettingsSection";
import {
  CredentialField,
} from "@/components/settings/integrations/CredentialField";
import { TestConnectionButton } from "@/components/settings/integrations/TestConnectionButton";
import { ModeToggle } from "@/components/settings/integrations/ModeToggle";
import { WebhookEndpointField } from "@/components/settings/integrations/WebhookEndpointField";
import { SaveBar } from "@/components/settings/integrations/SaveBar";
import { SECRET_SENTINEL } from "@/components/settings/integrations/CredentialField";
import { useSettingsAutosaveDraft } from "@/hooks/useSettingsAutosaveDraft";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/paypal",
)({ component: PayPalIntegrationPage });

type PayPalDraft = {
  paypalClientId: string | null;
  paypalClientSecret: string | null;
  paypalWebhookId: string | null;
  paypalMode: "sandbox" | "production";
};

function PayPalIntegrationPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "commerce.payments" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const testPayPal = useAction(
    (api as any).settings.integrations.testActions.testPayPal,
  );

  const {
    draft,
    setDraft,
    discardChanges,
    isDirty,
    autosaveStatus,
    autosaveError,
  } = useSettingsAutosaveDraft<PayPalDraft, Record<string, unknown>>({
    source: settings,
    createDraft: (source) => ({
      paypalClientId: (source.paypalClientId as string | null) ?? "",
      paypalClientSecret: (source.paypalClientSecret as string | null) ?? "",
      paypalWebhookId: (source.paypalWebhookId as string | null) ?? "",
      paypalMode:
        (source.paypalMode as "sandbox" | "production" | undefined) ?? "sandbox",
    }),
    onSave: async (nextDraft) => {
      await updateSection({
        section: "commerce.payments" as any,
        values: {
          ...(settings ?? {}),
          paypalClientId: nextDraft.paypalClientId ?? SECRET_SENTINEL,
          paypalClientSecret: nextDraft.paypalClientSecret ?? SECRET_SENTINEL,
          paypalWebhookId: nextDraft.paypalWebhookId ?? SECRET_SENTINEL,
          paypalMode: nextDraft.paypalMode,
        },
      });
    },
  });

  const status: IntegrationStatus = settings?.paypalClientSecret
    ? "connected"
    : "not_configured";

  if (!draft) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/+$/, "")}/webhooks/paypal`
      : "/webhooks/paypal";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <IntegrationHeader
        name="PayPal"
        description="PayPal Checkout. Client id, secret, webhook id, and mode."
        status={status}
        icon={<Wallet className="h-6 w-6 text-primary" />}
        actions={
          <TestConnectionButton
            onTest={async () => (await testPayPal()) as any}
          />
        }
      />

      <SettingsSection
        title="Mode"
        description="Sandbox uses PayPal's test environment; production uses real PayPal balances."
      >
        <ModeToggle
          value={draft.paypalMode}
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, paypalMode: v } : current,
            )
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Credentials"
        description="Find these in the PayPal Developer Dashboard → My Apps & Credentials."
      >
        <CredentialField
          id="paypal-client-id"
          label="Client ID"
          value={draft.paypalClientId}
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, paypalClientId: v } : current,
            )
          }
          placeholder="A…Ec"
          inputType="text"
          help="Safe to expose to the browser."
        />
        <CredentialField
          id="paypal-secret"
          label="Client Secret"
          value={draft.paypalClientSecret}
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, paypalClientSecret: v } : current,
            )
          }
          placeholder="E…Aw"
          help="Server-only. PayPal shows this once on app creation; rotate if lost."
        />
      </SettingsSection>

      <SettingsSection
        title="Webhook endpoint"
        description="Register this URL under your PayPal app's Webhooks, then paste the Webhook ID below."
      >
        <WebhookEndpointField
          id="paypal-webhook-url"
          label="Endpoint URL"
          url={webhookUrl}
          help="Subscribe to: CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED."
        />
        <CredentialField
          id="paypal-webhook-id"
          label="Webhook ID"
          value={draft.paypalWebhookId}
          onChange={(v) =>
            setDraft((current) =>
              current ? { ...current, paypalWebhookId: v } : current,
            )
          }
          placeholder="8NY…123"
          inputType="text"
          help="The numeric/alphanumeric ID PayPal shows next to your webhook after creation."
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
