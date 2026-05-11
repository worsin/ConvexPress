/**
 * AI Provider Settings Page
 *
 * Configure AI provider (OpenRouter or Anthropic Direct), API keys,
 * default model, and Tavily research API key.
 *
 * This page now autosaves provider and credential changes. Explicit buttons
 * remain only for connection testing.
 *
 * Settings are stored in the settings table with section: "ai".
 * Keys: provider, apiKey, defaultModel, tavilyApiKey
 */

import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import {
  Brain,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CredentialField,
  SECRET_SENTINEL,
} from "@/components/settings/integrations/CredentialField";
import { SaveBar } from "@/components/settings/integrations/SaveBar";
import { useSettingsAutosaveDraft } from "@/hooks/useSettingsAutosaveDraft";

export const Route = createFileRoute("/_authenticated/_admin/settings/ai")({
  component: AISettingsPage,
});

// ─── Model Options ────────────────────────────────────────────────────────────
//
// Sourced from:
//   - https://openrouter.ai/api/v1/models (April 2026 snapshot)
//   - https://platform.claude.com/docs/en/docs/about-claude/models
//
// When updating, prefer the "alias" form (e.g. `claude-opus-4-7` not
// `claude-opus-4-7-20260118`) so users automatically get the latest
// snapshot of a given model without an admin edit.

type ModelOption = { label: string; value: string };
type ModelGroup = { label: string; options: ModelOption[] };
type AIProvider = "openrouter" | "anthropic";

const OPENROUTER_MODEL_GROUPS: ModelGroup[] = [
  {
    label: "Anthropic — Claude",
    options: [
      { label: "Claude Opus 4.7 (most capable)", value: "anthropic/claude-opus-4.7" },
      { label: "Claude Sonnet 4.6 (balanced)", value: "anthropic/claude-sonnet-4.6" },
      { label: "Claude Opus 4.6", value: "anthropic/claude-opus-4.6" },
      { label: "Claude Opus 4.6 Fast", value: "anthropic/claude-4.6-opus-fast" },
    ],
  },
  {
    label: "OpenAI — GPT",
    options: [
      { label: "GPT-5.5 Pro", value: "openai/gpt-5.5-pro" },
      { label: "GPT-5.5", value: "openai/gpt-5.5" },
      { label: "GPT-5.4 Pro", value: "openai/gpt-5.4-pro" },
      { label: "GPT-5.4", value: "openai/gpt-5.4" },
      { label: "GPT-5.4 Mini", value: "openai/gpt-5.4-mini" },
      { label: "GPT-5.4 Nano", value: "openai/gpt-5.4-nano" },
      { label: "GPT-5.3 Codex (coding)", value: "openai/gpt-5.3-codex" },
      { label: "GPT-5.3 Chat", value: "openai/gpt-5.3-chat" },
    ],
  },
  {
    label: "Google — Gemini",
    options: [
      { label: "Gemini 3.1 Pro Preview", value: "google/gemini-3.1-pro-preview" },
      { label: "Gemini 3.1 Flash Lite Preview", value: "google/gemini-3.1-flash-lite-preview" },
      { label: "Gemini 3.1 Flash Image (Nano Banana 2)", value: "google/gemini-3.1-flash-image-preview" },
    ],
  },
  {
    label: "Moonshot — Kimi",
    options: [
      { label: "Kimi K2.6", value: "moonshotai/kimi-k2.6" },
      { label: "Kimi K2.5", value: "moonshotai/kimi-k2.5" },
    ],
  },
  {
    label: "Zhipu — GLM",
    options: [
      { label: "GLM 5.1", value: "z-ai/glm-5.1" },
      { label: "GLM 5 Turbo", value: "z-ai/glm-5-turbo" },
      { label: "GLM 5", value: "z-ai/glm-5" },
      { label: "GLM 5V Turbo (vision)", value: "z-ai/glm-5v-turbo" },
    ],
  },
];

const ANTHROPIC_MODEL_GROUPS: ModelGroup[] = [
  {
    label: "Current",
    options: [
      { label: "Claude Opus 4.7 (most capable)", value: "claude-opus-4-7" },
      { label: "Claude Sonnet 4.6 (balanced)", value: "claude-sonnet-4-6" },
      { label: "Claude Haiku 4.5 (fastest)", value: "claude-haiku-4-5" },
    ],
  },
  {
    label: "Legacy",
    options: [
      { label: "Claude Opus 4.6", value: "claude-opus-4-6" },
      { label: "Claude Sonnet 4.5", value: "claude-sonnet-4-5" },
      { label: "Claude Opus 4.5", value: "claude-opus-4-5" },
      { label: "Claude Opus 4.1", value: "claude-opus-4-1" },
    ],
  },
];

const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-opus-4.7";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-7";

// ─── Component ────────────────────────────────────────────────────────────────

function AISettingsPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "ai" as any,
  });
  const updateSection = useMutation(api.settings.mutations.updateSection);

  const {
    draft,
    setDraft,
    discardChanges,
    isDirty,
    autosaveStatus,
    autosaveError,
  } = useSettingsAutosaveDraft<
    {
      provider: AIProvider;
      apiKey: string | null;
      defaultModel: string;
      tavilyApiKey: string | null;
    },
    Record<string, unknown>
  >({
    source: settings as Record<string, unknown> | null | undefined,
    createDraft: (source) => ({
      provider: (source.provider as AIProvider | undefined) ?? "openrouter",
      apiKey: (source.apiKey as string | null) ?? "",
      defaultModel:
        (source.defaultModel as string | undefined) ?? DEFAULT_OPENROUTER_MODEL,
      tavilyApiKey: (source.tavilyApiKey as string | null) ?? "",
    }),
    onSave: async (nextDraft) => {
      await updateSection({
        section: "ai" as any,
        values: {
          provider: nextDraft.provider,
          apiKey: nextDraft.apiKey ?? SECRET_SENTINEL,
          defaultModel: nextDraft.defaultModel,
          tavilyApiKey: nextDraft.tavilyApiKey ?? SECRET_SENTINEL,
        },
      });
    },
  });

  // UI state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTavilyTesting, setIsTavilyTesting] = useState(false);
  const [tavilyTestResult, setTavilyTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const provider = draft?.provider ?? "openrouter";
  const apiKey = draft?.apiKey ?? "";
  const defaultModel = draft?.defaultModel ?? DEFAULT_OPENROUTER_MODEL;
  const tavilyApiKey = draft?.tavilyApiKey ?? "";

  // Reset model when provider changes
  const handleProviderChange = useCallback(
    (newProvider: AIProvider) => {
      setDraft((current) =>
        current
          ? {
              ...current,
              provider: newProvider,
              defaultModel:
                newProvider === "openrouter"
                  ? DEFAULT_OPENROUTER_MODEL
                  : DEFAULT_ANTHROPIC_MODEL,
            }
          : current,
      );
      setTestResult(null);
    },
    [setDraft],
  );

  // ─── Test AI Connection ───────────────────────────────────────────────────

  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim() || apiKey === SECRET_SENTINEL) {
      setTestResult({ success: false, message: "Please enter an API key." });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const baseUrl =
        provider === "openrouter"
          ? "https://openrouter.ai/api/v1"
          : "https://api.anthropic.com/v1";

      if (provider === "openrouter") {
        // Test OpenRouter by listing models
        const response = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
        });
        if (response.ok) {
          setTestResult({
            success: true,
            message: "OpenRouter connection successful. API key is valid.",
          });
        } else {
          const data = await response.json().catch(() => ({}));
          setTestResult({
            success: false,
            message:
              (data as any)?.error?.message ??
              `HTTP ${response.status}: ${response.statusText}`,
          });
        }
      } else {
        // Test Anthropic by sending a minimal message
        const response = await fetch(`${baseUrl}/messages`, {
          method: "POST",
          headers: {
            "x-api-key": apiKey.trim(),
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: defaultModel || DEFAULT_ANTHROPIC_MODEL,
            max_tokens: 1,
            messages: [{ role: "user", content: "Hi" }],
          }),
        });
        if (response.ok) {
          setTestResult({
            success: true,
            message: "Anthropic connection successful. API key is valid.",
          });
        } else {
          const data = await response.json().catch(() => ({}));
          setTestResult({
            success: false,
            message:
              (data as any)?.error?.message ??
              `HTTP ${response.status}: ${response.statusText}`,
          });
        }
      }
    } catch (err) {
      setTestResult({
        success: false,
        message:
          err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setIsTesting(false);
    }
  }, [provider, apiKey, defaultModel]);

  // ─── Test Tavily Connection ───────────────────────────────────────────────

  const handleTestTavily = useCallback(async () => {
    if (!tavilyApiKey.trim() || tavilyApiKey === SECRET_SENTINEL) {
      setTavilyTestResult({
        success: false,
        message: "Please enter a Tavily API key.",
      });
      return;
    }

    setIsTavilyTesting(true);
    setTavilyTestResult(null);

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyApiKey.trim(),
          query: "test",
          max_results: 1,
        }),
      });

      if (response.ok) {
        setTavilyTestResult({
          success: true,
          message: "Tavily connection successful. API key is valid.",
        });
      } else {
        const data = await response.json().catch(() => ({}));
        setTavilyTestResult({
          success: false,
          message:
            (data as any)?.detail ??
            (data as any)?.message ??
            `HTTP ${response.status}: ${response.statusText}`,
        });
      }
    } catch (err) {
      setTavilyTestResult({
        success: false,
        message:
          err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setIsTavilyTesting(false);
    }
  }, [tavilyApiKey]);

  // ─── Loading State ────────────────────────────────────────────────────────

  if (settings === undefined) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-64 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-64 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const modelGroups =
    provider === "openrouter"
      ? OPENROUTER_MODEL_GROUPS
      : ANTHROPIC_MODEL_GROUPS;

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Brain className="h-6 w-6 text-foreground" />
          <h1 className="text-2xl font-bold text-foreground">
            AI Provider Settings
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your AI provider for content generation, research, and
          structured field population.
        </p>
      </div>

      {/* Provider Selection Section */}
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            AI Provider
          </h2>

          {/* Provider Radio Buttons */}
          <div className="space-y-3 mb-6">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                provider === "openrouter"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name="provider"
                value="openrouter"
                checked={provider === "openrouter"}
                onChange={() => handleProviderChange("openrouter")}
                className="mt-0.5"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    OpenRouter
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Recommended
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Access Claude, GPT-5, Gemini 3.1, Kimi K2, GLM, and more
                  through a single API key. Best for flexibility and cost
                  management.
                </p>
              </div>
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                provider === "anthropic"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name="provider"
                value="anthropic"
                checked={provider === "anthropic"}
                onChange={() => handleProviderChange("anthropic")}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-semibold text-foreground">
                  Anthropic Direct
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect directly to Anthropic's API. Only Claude models
                  available.
                </p>
              </div>
            </label>
          </div>

          {/* API Key Input */}
          <div className="space-y-4">
            <CredentialField
              id="ai-api-key"
              label={
                provider === "openrouter"
                  ? "OpenRouter API Key"
                  : "Anthropic API Key"
              }
              value={apiKey}
              onChange={(value) => {
                setDraft((current) =>
                  current ? { ...current, apiKey: value } : current,
                );
                setTestResult(null);
              }}
              placeholder={
                provider === "openrouter" ? "sk-or-v1-..." : "sk-ant-api03-..."
              }
              help={
                provider === "openrouter" ? (
                  <>
                    Get your API key from{" "}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline inline-flex items-center gap-0.5"
                    >
                      openrouter.ai/keys
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                ) : (
                  <>
                    Get your API key from{" "}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline inline-flex items-center gap-0.5"
                    >
                      console.anthropic.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )
              }
            />

            {/* Default Model */}
            <div>
              <label
                htmlFor="ai-model"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Default Model
              </label>
              <select
                id="ai-model"
                value={defaultModel}
                onChange={(e) =>
                  setDraft((current) =>
                    current
                      ? { ...current, defaultModel: e.target.value }
                      : current,
                  )
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {modelGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                The model used for AI content generation. Can be overridden
                per-request.
              </p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md p-3",
                  testResult.success
                    ? "bg-success/10"
                    : "bg-destructive/10",
                )}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <p
                  className={cn(
                    "text-sm",
                    testResult.success
                      ? "text-success"
                      : "text-destructive",
                  )}
                >
                  {testResult.message}
                </p>
              </div>
            )}

            {/* Test Connection Button */}
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={
                isTesting || !apiKey.trim() || apiKey === SECRET_SENTINEL
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                "border border-border bg-background text-foreground hover:bg-muted",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Test Connection
                </>
              )}
            </button>
          </div>
        </div>

        {/* Research Provider Section */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground">
              Research Provider
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Tavily provides web research capabilities for AI content generation,
            allowing the AI to find and cite current information.
          </p>

          <div className="space-y-4">
            <CredentialField
              id="tavily-api-key"
              label="Tavily API Key"
              value={tavilyApiKey}
              onChange={(value) => {
                setDraft((current) =>
                  current ? { ...current, tavilyApiKey: value } : current,
                );
                setTavilyTestResult(null);
              }}
              placeholder="tvly-..."
              help={
                <>
                  Get your API key from{" "}
                  <a
                    href="https://app.tavily.com/home"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-0.5"
                  >
                    app.tavily.com
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              }
            />

            {/* Tavily Test Result */}
            {tavilyTestResult && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md p-3",
                  tavilyTestResult.success
                    ? "bg-success/10"
                    : "bg-destructive/10",
                )}
              >
                {tavilyTestResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <p
                  className={cn(
                    "text-sm",
                    tavilyTestResult.success
                      ? "text-success"
                      : "text-destructive",
                  )}
                >
                  {tavilyTestResult.message}
                </p>
              </div>
            )}

            {/* Test Tavily Button */}
            <button
              type="button"
              onClick={handleTestTavily}
              disabled={
                isTavilyTesting ||
                !tavilyApiKey.trim() ||
                tavilyApiKey === SECRET_SENTINEL
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                "border border-border bg-background text-foreground hover:bg-muted",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isTavilyTesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Test Connection
                </>
              )}
            </button>
          </div>
        </div>

        <SaveBar
          dirty={isDirty}
          mode="autosave"
          autosaveStatus={autosaveStatus}
          autosaveError={autosaveError}
          onDiscard={discardChanges}
        />
      </div>
    </div>
  );
}
