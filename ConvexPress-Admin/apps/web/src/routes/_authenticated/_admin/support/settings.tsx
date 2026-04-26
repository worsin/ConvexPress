import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import {
  CredentialField,
  SECRET_SENTINEL,
} from "@/components/settings/integrations/CredentialField";

export const Route = createFileRoute(
  "/_authenticated/_admin/support/settings",
)({
  component: SupportSettingsPage,
});

type WidgetState = {
  enabled: boolean;
  widgetTitle: string;
  widgetSubtitle: string;
  widgetColor: string;
  showKbSearch: boolean;
  showTicketHistory: boolean;
  aiEnabled: boolean;
  escalationButtonLabel: string;
};

type AiState = {
  aiProvider: "openai" | "anthropic" | null;
  aiApiKey: string;
  aiModel: string;
  meilisearchEnabled: boolean;
  meilisearchUrl: string;
  meilisearchApiKey: string;
  ragEnabled: boolean;
};

const DEFAULT_WIDGET: WidgetState = {
  enabled: true,
  widgetTitle: "Support",
  widgetSubtitle: "How can we help you today?",
  widgetColor: "#3b82f6",
  showKbSearch: true,
  showTicketHistory: true,
  aiEnabled: false,
  escalationButtonLabel: "Contact Support",
};

const DEFAULT_AI: AiState = {
  aiProvider: null,
  aiApiKey: "",
  aiModel: "",
  meilisearchEnabled: false,
  meilisearchUrl: "",
  meilisearchApiKey: "",
  ragEnabled: false,
};

function SupportSettingsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/support">
      <SupportSettingsForm />
    </RoutePermissionGuard>
  );
}

function SupportSettingsForm() {
  const settings = useQuery(api.support.settings.getSupportSettings);
  const updateSettings = useMutation(api.support.settings.updateSupportSettings);

  const [widget, setWidget] = useState<WidgetState>(DEFAULT_WIDGET);
  const [ai, setAi] = useState<AiState>(DEFAULT_AI);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setWidget({ ...DEFAULT_WIDGET, ...(settings.widget as Partial<WidgetState>) });
    setAi({ ...DEFAULT_AI, ...(settings.ai as Partial<AiState>) });
  }, [settings]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateSettings({
        widget,
        ai: {
          ...ai,
          aiApiKey:
            ai.aiApiKey === SECRET_SENTINEL ? SECRET_SENTINEL : ai.aiApiKey || undefined,
          meilisearchApiKey:
            ai.meilisearchApiKey === SECRET_SENTINEL
              ? SECRET_SENTINEL
              : ai.meilisearchApiKey || undefined,
        },
      });
      toast.success("Support settings saved");
    } catch (error: unknown) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save support settings",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (settings === undefined) {
    return <div className="h-96 max-w-3xl animate-pulse rounded-lg bg-muted" />;
  }

  if (settings === null) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-bold">Support Settings</h1>
        <p className="text-sm text-muted-foreground">
          Support settings are available when the Support Tickets extension is
          enabled and your account can manage options.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the support widget, knowledge base handoff, and AI-assisted
          answers.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Widget</h2>
        <SettingCheckbox
          label="Enable support widget"
          checked={widget.enabled}
          onChange={(enabled) => setWidget((current) => ({ ...current, enabled }))}
        />
        <TextField
          label="Title"
          value={widget.widgetTitle}
          onChange={(widgetTitle) =>
            setWidget((current) => ({ ...current, widgetTitle }))
          }
        />
        <TextField
          label="Subtitle"
          value={widget.widgetSubtitle}
          onChange={(widgetSubtitle) =>
            setWidget((current) => ({ ...current, widgetSubtitle }))
          }
        />
        <TextField
          label="Escalation button"
          value={widget.escalationButtonLabel}
          onChange={(escalationButtonLabel) =>
            setWidget((current) => ({ ...current, escalationButtonLabel }))
          }
        />
        <TextField
          label="Widget color"
          type="color"
          value={widget.widgetColor}
          onChange={(widgetColor) =>
            setWidget((current) => ({ ...current, widgetColor }))
          }
        />
        <SettingCheckbox
          label="Show KB search"
          checked={widget.showKbSearch}
          onChange={(showKbSearch) =>
            setWidget((current) => ({ ...current, showKbSearch }))
          }
        />
        <SettingCheckbox
          label="Show ticket history"
          checked={widget.showTicketHistory}
          onChange={(showTicketHistory) =>
            setWidget((current) => ({ ...current, showTicketHistory }))
          }
        />
        <SettingCheckbox
          label="Enable AI answers"
          checked={widget.aiEnabled}
          onChange={(aiEnabled) =>
            setWidget((current) => ({ ...current, aiEnabled }))
          }
        />
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">AI And Search</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground/70">
            AI provider
          </label>
          <select
            value={ai.aiProvider ?? ""}
            onChange={(event) =>
              setAi((current) => ({
                ...current,
                aiProvider:
                  event.target.value === ""
                    ? null
                    : (event.target.value as "openai" | "anthropic"),
              }))
            }
            className="w-full max-w-xs rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          >
            <option value="">Not configured</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        <TextField
          label="AI model"
          value={ai.aiModel}
          onChange={(aiModel) => setAi((current) => ({ ...current, aiModel }))}
        />
        <CredentialField
          id="support-ai-api-key"
          label="AI API key"
          value={ai.aiApiKey}
          onChange={(aiApiKey) =>
            setAi((current) => ({
              ...current,
              aiApiKey: aiApiKey ?? SECRET_SENTINEL,
            }))
          }
          placeholder="Provider API key"
        />
        <SettingCheckbox
          label="Enable Meilisearch"
          checked={ai.meilisearchEnabled}
          onChange={(meilisearchEnabled) =>
            setAi((current) => ({ ...current, meilisearchEnabled }))
          }
        />
        <TextField
          label="Meilisearch URL"
          type="url"
          value={ai.meilisearchUrl}
          onChange={(meilisearchUrl) =>
            setAi((current) => ({ ...current, meilisearchUrl }))
          }
        />
        <CredentialField
          id="support-meilisearch-api-key"
          label="Meilisearch API key"
          value={ai.meilisearchApiKey}
          onChange={(meilisearchApiKey) =>
            setAi((current) => ({
              ...current,
              meilisearchApiKey: meilisearchApiKey ?? SECRET_SENTINEL,
            }))
          }
          placeholder="Search key"
        />
        <SettingCheckbox
          label="Enable RAG"
          checked={ai.ragEnabled}
          onChange={(ragEnabled) =>
            setAi((current) => ({ ...current, ragEnabled }))
          }
        />
      </section>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={isSaving}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {isSaving ? "Saving..." : "Save Support Settings"}
      </button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "url" | "color";
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground/70">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full max-w-xl rounded-md border border-border bg-card px-3 py-1.5 text-sm"
      />
    </div>
  );
}

function SettingCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm text-foreground/80">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-border"
      />
    </label>
  );
}
