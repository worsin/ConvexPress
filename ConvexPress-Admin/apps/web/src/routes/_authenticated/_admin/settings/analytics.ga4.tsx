import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { BarChart3, Upload } from "lucide-react";

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
import { SaveBar } from "@/components/settings/integrations/SaveBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/analytics/ga4",
)({ component: Ga4IntegrationPage });

function Ga4IntegrationPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "analytics.ga4" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const testGa4 = useAction(
    (api as any).settings.integrations.testActions.testGa4,
  );

  const [json, setJson] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setJson(settings.ga4ServiceAccountJson ?? "");
    setPropertyId(settings.ga4PropertyId ?? "");
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      json !== (settings.ga4ServiceAccountJson ?? "") ||
      propertyId !== (settings.ga4PropertyId ?? "")
    );
  }, [json, propertyId, settings]);

  const status: IntegrationStatus = settings?.ga4ServiceAccountJson
    ? "connected"
    : "not_configured";

  async function onUpload(file: File) {
    const text = await file.text();
    try {
      JSON.parse(text);
    } catch {
      toast.error("Not a valid JSON file.");
      return;
    }
    setJson(text);
    setUploadedName(file.name);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateSection({
        section: "analytics.ga4" as any,
        values: {
          ga4ServiceAccountJson: json === null ? "" : json,
          ga4PropertyId: propertyId,
        },
      });
      toast.success("GA4 settings saved.");
      setUploadedName(null);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!settings) return;
    setJson(settings.ga4ServiceAccountJson ?? "");
    setPropertyId(settings.ga4PropertyId ?? "");
    setUploadedName(null);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <IntegrationHeader
        name="Google Analytics 4"
        description="Connect a GA4 property to surface traffic + engagement data on the admin dashboard."
        status={status}
        icon={<BarChart3 className="h-6 w-6 text-primary" />}
        actions={<TestConnectionButton onTest={async () => (await testGa4()) as any} />}
      />

      <SettingsSection
        title="Service account"
        description="GA4 uses a Google Cloud service account with Read access to your property. Upload the JSON keyfile here."
      >
        {json === SECRET_SENTINEL && !uploadedName ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-mono">
              •••• service account saved
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setJson("")}
            >
              Replace
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label
              htmlFor="ga4-json-upload"
              className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted"
            >
              <Upload className="h-4 w-4" />
              {uploadedName ?? "Upload service-account.json"}
              <input
                id="ga4-json-upload"
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUpload(file);
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Google Cloud Console → IAM & Admin → Service Accounts → Keys → Add Key → JSON.
              The file is stored encrypted and never displayed after save.
            </p>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Property ID"
        description="The numeric GA4 property identifier (e.g. 987654321). Find it under Admin → Property Settings in GA4."
      >
        <div className="grid gap-2">
          <Label htmlFor="ga4-prop" className="text-sm font-medium">
            GA4 property ID
          </Label>
          <Input
            id="ga4-prop"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="987654321"
          />
        </div>
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

// Also re-export as a bridge for backwards-compatible analytics route.
export default Ga4IntegrationPage;

// `CredentialField` not used but imported via bundle; keep noted:
void CredentialField;
