import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import {
  IntegrationHeader,
  type IntegrationStatus,
} from "@/components/settings/integrations/IntegrationHeader";
import { SettingsSection } from "@/components/settings/integrations/SettingsSection";
import { CredentialField } from "@/components/settings/integrations/CredentialField";
import { TestConnectionButton } from "@/components/settings/integrations/TestConnectionButton";
import { WebhookEndpointField } from "@/components/settings/integrations/WebhookEndpointField";
import { SaveBar } from "@/components/settings/integrations/SaveBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/clerk",
)({ component: ClerkIntegrationPage });

type ClerkDraft = {
  clerkSecretKey: string | null;
  clerkWebhookSecret: string | null;
  clerkJwtIssuerDomain: string;
};

function ClerkIntegrationPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "integrations.clerk" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const testClerk = useAction(
    (api as any).settings.integrations.testActions.testClerk,
  );

  const [draft, setDraft] = useState<ClerkDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      clerkSecretKey: settings.clerkSecretKey ?? "",
      clerkWebhookSecret: settings.clerkWebhookSecret ?? "",
      clerkJwtIssuerDomain: settings.clerkJwtIssuerDomain ?? "",
    });
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return (
      draft.clerkSecretKey !== (settings.clerkSecretKey ?? "") ||
      draft.clerkWebhookSecret !== (settings.clerkWebhookSecret ?? "") ||
      draft.clerkJwtIssuerDomain !== (settings.clerkJwtIssuerDomain ?? "")
    );
  }, [draft, settings]);

  const status: IntegrationStatus = settings?.clerkSecretKey
    ? "connected"
    : "not_configured";

  if (!draft) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await updateSection({
        section: "integrations.clerk" as any,
        values: {
          clerkSecretKey:
            draft.clerkSecretKey === null ? "" : draft.clerkSecretKey,
          clerkWebhookSecret:
            draft.clerkWebhookSecret === null ? "" : draft.clerkWebhookSecret,
          clerkJwtIssuerDomain: draft.clerkJwtIssuerDomain,
        },
      });
      toast.success("Clerk settings saved.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!settings) return;
    setDraft({
      clerkSecretKey: settings.clerkSecretKey ?? "",
      clerkWebhookSecret: settings.clerkWebhookSecret ?? "",
      clerkJwtIssuerDomain: settings.clerkJwtIssuerDomain ?? "",
    });
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/+$/, "")}/webhooks/clerk`
      : "/webhooks/clerk";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <IntegrationHeader
        name="Clerk"
        description="Clerk authentication — used by the public-facing website for sign-up, sign-in, and session management."
        status={status}
        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
        actions={
          <TestConnectionButton
            onTest={async () => (await testClerk()) as any}
          />
        }
      />

      <SettingsSection
        title="API keys"
        description="Get these from the Clerk Dashboard → your application → API Keys."
      >
        <CredentialField
          id="clerk-secret"
          label="Secret key"
          value={draft.clerkSecretKey}
          onChange={(v) => setDraft({ ...draft, clerkSecretKey: v })}
          placeholder="sk_test_… or sk_live_…"
          help="Server-only. Starts with sk_test_ for dev, sk_live_ for production."
        />
      </SettingsSection>

      <SettingsSection
        title="JWT issuer"
        description="Clerk's JWT issuer domain. Used to validate session tokens. Find under Clerk Dashboard → JWT Templates."
      >
        <div className="grid gap-2">
          <Label
            htmlFor="clerk-issuer"
            className="text-sm font-medium text-foreground"
          >
            Issuer domain
          </Label>
          <Input
            id="clerk-issuer"
            value={draft.clerkJwtIssuerDomain}
            onChange={(e) =>
              setDraft({ ...draft, clerkJwtIssuerDomain: e.target.value })
            }
            placeholder="https://clerk.yourdomain.com"
          />
          <p className="text-xs text-muted-foreground">
            Example: <code>https://excellent-gull-42.clerk.accounts.dev</code>
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Webhook endpoint"
        description="Add this as an endpoint in Clerk → Webhooks. Subscribe to user.created, user.updated, user.deleted."
      >
        <WebhookEndpointField
          id="clerk-webhook-url"
          label="Endpoint URL"
          url={webhookUrl}
          help="Uses Svix-compatible signature verification."
        />
        <CredentialField
          id="clerk-webhook-secret"
          label="Signing secret"
          value={draft.clerkWebhookSecret}
          onChange={(v) => setDraft({ ...draft, clerkWebhookSecret: v })}
          placeholder="whsec_…"
          help="Clerk → Webhooks → your endpoint → Signing secret."
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
