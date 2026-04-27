import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { MapPin } from "lucide-react";

import {
  IntegrationHeader,
  type IntegrationStatus,
} from "@/components/settings/integrations/IntegrationHeader";
import { SettingsSection } from "@/components/settings/integrations/SettingsSection";
import { CredentialField } from "@/components/settings/integrations/CredentialField";
import { TestConnectionButton } from "@/components/settings/integrations/TestConnectionButton";
import { SaveBar } from "@/components/settings/integrations/SaveBar";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/google",
)({ component: GoogleIntegrationPage });

type GoogleDraft = {
  placesApiKey: string | null;
  geocodeApiKey: string | null;
};

function GoogleIntegrationPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "integrations.google" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const testPlaces = useAction(
    (api as any).settings.integrations.testActions.testGooglePlaces,
  );

  const [draft, setDraft] = useState<GoogleDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      placesApiKey: settings.placesApiKey ?? "",
      geocodeApiKey: settings.geocodeApiKey ?? "",
    });
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return (
      draft.placesApiKey !== (settings.placesApiKey ?? "") ||
      draft.geocodeApiKey !== (settings.geocodeApiKey ?? "")
    );
  }, [draft, settings]);

  const status: IntegrationStatus = settings?.placesApiKey
    ? "connected"
    : "not_configured";

  if (!draft) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await updateSection({
        section: "integrations.google" as any,
        values: {
          placesApiKey: draft.placesApiKey === null ? "" : draft.placesApiKey,
          geocodeApiKey:
            draft.geocodeApiKey === null ? "" : draft.geocodeApiKey,
        },
      });
      toast.success("Google settings saved.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!settings) return;
    setDraft({
      placesApiKey: settings.placesApiKey ?? "",
      geocodeApiKey: settings.geocodeApiKey ?? "",
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <IntegrationHeader
        name="Google Places"
        description="Address autocomplete and geocoding at checkout. Create keys in the Google Cloud Console and restrict them to your domain."
        status={status}
        icon={<MapPin className="h-6 w-6 text-primary" />}
        actions={
          <TestConnectionButton onTest={async () => (await testPlaces()) as any} />
        }
      />

      <SettingsSection
        title="Places API key"
        description="Powers the address autocomplete dropdown at checkout. Google Cloud Console → APIs & Services → Credentials → Create API key. Restrict by HTTP referrer."
      >
        <CredentialField
          id="google-places"
          label="Places API key"
          value={draft.placesApiKey}
          onChange={(v) => setDraft({ ...draft, placesApiKey: v })}
          placeholder="AIza…"
          help="Restrict the key to your admin and website domains in the Google Cloud Console."
        />
      </SettingsSection>

      <SettingsSection
        title="Geocode API key (optional)"
        description="Used for reverse geocoding — converting an address into lat/lng for local delivery radius calculations. You can reuse the same key if it has Geocoding API enabled."
      >
        <CredentialField
          id="google-geocode"
          label="Geocode API key"
          value={draft.geocodeApiKey}
          onChange={(v) => setDraft({ ...draft, geocodeApiKey: v })}
          placeholder="AIza… (leave blank to reuse Places key)"
          help="If left blank, the Places key is used for both."
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
