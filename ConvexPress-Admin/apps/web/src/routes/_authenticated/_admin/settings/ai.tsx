/**
 * AI Provider Settings Page
 *
 * Configure AI provider (OpenRouter, OpenAI Direct, or Anthropic Direct),
 * API keys, model routing, image generation, and Tavily research API key.
 *
 * This page now autosaves provider and credential changes. Explicit buttons
 * remain only for connection testing.
 *
 * Settings are stored in the settings table with section: "ai".
 * Keys: provider, apiKey, defaultModel, task model routing, image settings,
 * and tavilyApiKey.
 */

import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
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
type AIProvider = "openrouter" | "anthropic" | "openai";

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

const OPENAI_MODEL_GROUPS: ModelGroup[] = [
  {
    label: "Current",
    options: [
      { label: "GPT-5.5 Pro (most capable)", value: "gpt-5.5-pro" },
      { label: "GPT-5.5", value: "gpt-5.5" },
      { label: "GPT-5.4 Pro", value: "gpt-5.4-pro" },
      { label: "GPT-5.4 (balanced)", value: "gpt-5.4" },
      { label: "GPT-5.4 Mini (fastest)", value: "gpt-5.4-mini" },
      { label: "GPT-5.4 Nano", value: "gpt-5.4-nano" },
    ],
  },
  {
    label: "Specialty",
    options: [
      { label: "GPT-5.3 Codex (coding)", value: "gpt-5.3-codex" },
      { label: "GPT-5.3 Chat", value: "gpt-5.3-chat" },
    ],
  },
];

const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-opus-4.7";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-7";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";

function defaultModelForProvider(provider: AIProvider): string {
  if (provider === "anthropic") return DEFAULT_ANTHROPIC_MODEL;
  if (provider === "openai") return DEFAULT_OPENAI_MODEL;
  return DEFAULT_OPENROUTER_MODEL;
}

function modelGroupsForProvider(provider: AIProvider): ModelGroup[] {
  if (provider === "anthropic") return ANTHROPIC_MODEL_GROUPS;
  if (provider === "openai") return OPENAI_MODEL_GROUPS;
  return OPENROUTER_MODEL_GROUPS;
}

// ─── Component ────────────────────────────────────────────────────────────────

function AISettingsPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "ai" as any,
  });
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const testProviderConnection = useAction(
    (api as any).ai.actions.testProviderConnection,
  );
  const testTavilyConnection = useAction(
    (api as any).ai.actions.testTavilyConnection,
  );

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
      pageGenerationModel: string;
      blockEditingModel: string;
      researchModel: string;
      legacyContentModel: string;
      imageApiKey: string | null;
      imageModel: string;
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
      pageGenerationModel:
        (source.pageGenerationModel as string | undefined) ??
        (source.defaultModel as string | undefined) ??
        DEFAULT_OPENROUTER_MODEL,
      blockEditingModel:
        (source.blockEditingModel as string | undefined) ??
        (source.defaultModel as string | undefined) ??
        DEFAULT_OPENROUTER_MODEL,
      researchModel:
        (source.researchModel as string | undefined) ??
        (source.defaultModel as string | undefined) ??
        DEFAULT_OPENROUTER_MODEL,
      legacyContentModel:
        (source.legacyContentModel as string | undefined) ??
        (source.defaultModel as string | undefined) ??
        DEFAULT_OPENROUTER_MODEL,
      imageApiKey: (source.imageApiKey as string | null) ?? "",
      imageModel: (source.imageModel as string | undefined) ?? "gpt-image-1",
      tavilyApiKey: (source.tavilyApiKey as string | null) ?? "",
    }),
    onSave: async (nextDraft) => {
      await updateSection({
        section: "ai" as any,
        values: {
          provider: nextDraft.provider,
          apiKey: nextDraft.apiKey ?? SECRET_SENTINEL,
          defaultModel: nextDraft.defaultModel,
          pageGenerationModel: nextDraft.pageGenerationModel,
          blockEditingModel: nextDraft.blockEditingModel,
          researchModel: nextDraft.researchModel,
          legacyContentModel: nextDraft.legacyContentModel,
          imageApiKey: nextDraft.imageApiKey ?? SECRET_SENTINEL,
          imageModel: nextDraft.imageModel,
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
  const pageGenerationModel = draft?.pageGenerationModel ?? defaultModel;
  const blockEditingModel = draft?.blockEditingModel ?? defaultModel;
  const researchModel = draft?.researchModel ?? defaultModel;
  const legacyContentModel = draft?.legacyContentModel ?? defaultModel;
  const imageApiKey = draft?.imageApiKey ?? "";
  const imageModel = draft?.imageModel ?? "gpt-image-1";
  const tavilyApiKey = draft?.tavilyApiKey ?? "";

  // Reset model when provider changes
  const handleProviderChange = useCallback(
    (newProvider: AIProvider) => {
      setDraft((current) =>
        current
          ? {
              ...current,
              provider: newProvider,
              defaultModel: defaultModelForProvider(newProvider),
              pageGenerationModel: defaultModelForProvider(newProvider),
              blockEditingModel: defaultModelForProvider(newProvider),
              researchModel: defaultModelForProvider(newProvider),
              legacyContentModel: defaultModelForProvider(newProvider),
            }
          : current,
      );
      setTestResult(null);
    },
    [setDraft],
  );

  // ─── Test AI Connection ───────────────────────────────────────────────────

  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: "Please enter an API key." });
      return;
    }
    if (isDirty) {
      setTestResult({
        success: false,
        message: "Wait for autosave to finish before testing the saved key.",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testProviderConnection({});
      setTestResult({ success: result.ok, message: result.message });
    } catch (err) {
      setTestResult({
        success: false,
        message:
          err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setIsTesting(false);
    }
  }, [apiKey, isDirty, testProviderConnection]);

  // ─── Test Tavily Connection ───────────────────────────────────────────────

  const handleTestTavily = useCallback(async () => {
    if (!tavilyApiKey.trim()) {
      setTavilyTestResult({
        success: false,
        message: "Please enter a Tavily API key.",
      });
      return;
    }
    if (isDirty) {
      setTavilyTestResult({
        success: false,
        message: "Wait for autosave to finish before testing the saved key.",
      });
      return;
    }

    setIsTavilyTesting(true);
    setTavilyTestResult(null);

    try {
      const result = await testTavilyConnection({});
      setTavilyTestResult({ success: result.ok, message: result.message });
    } catch (err) {
      setTavilyTestResult({
        success: false,
        message:
          err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setIsTavilyTesting(false);
    }
  }, [isDirty, tavilyApiKey, testTavilyConnection]);

  // ─── Loading State ────────────────────────────────────────────────────────

  if (settings === undefined) {
    return (
      <div className="w-full p-6">
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
      <div className="w-full p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-64 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const modelGroups = modelGroupsForProvider(provider);
  const taskModelControls = [
    {
      id: "pageGenerationModel",
      label: "Page generation",
      value: pageGenerationModel,
      help: "Used by Replace page with AI generated content.",
    },
    {
      id: "blockEditingModel",
      label: "Block editing",
      value: blockEditingModel,
      help: "Used by block regenerate, improve, variants, and block conversion.",
    },
    {
      id: "researchModel",
      label: "Research synthesis",
      value: researchModel,
      help: "Used when AI writes from researched source material.",
    },
    {
      id: "legacyContentModel",
      label: "Legacy structured content",
      value: legacyContentModel,
      help: "Used by the older hero/topic/summary generation workflow.",
    },
  ] as const;

  return (
    <div className="w-full p-6">
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
                provider === "openai"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={provider === "openai"}
                onChange={() => handleProviderChange("openai")}
                className="mt-0.5"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    OpenAI Direct
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Fallback
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect directly to OpenAI's API. Only GPT models available.
                  Useful as a fallback if OpenRouter is unavailable.
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
                  : provider === "openai"
                    ? "OpenAI API Key"
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
                provider === "openrouter"
                  ? "sk-or-v1-..."
                  : provider === "openai"
                    ? "sk-proj-..."
                    : "sk-ant-api03-..."
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
                ) : provider === "openai" ? (
                  <>
                    Get your API key from{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline inline-flex items-center gap-0.5"
                    >
                      platform.openai.com/api-keys
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
              disabled={isTesting || !apiKey.trim() || isDirty}
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

        {/* Model Routing Section */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Model Routing
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose which model is used for each AI workflow. Blank task-specific
            values fall back to the default model.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {taskModelControls.map((control) => (
              <div key={control.id}>
                <label
                  htmlFor={`ai-${control.id}`}
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  {control.label}
                </label>
                <select
                  id={`ai-${control.id}`}
                  value={control.value}
                  onChange={(e) =>
                    setDraft((current) =>
                      current
                        ? { ...current, [control.id]: e.target.value }
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
                  {control.help}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Image Generation Section */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Image Generation
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Media image generation uses OpenAI image models. If no separate
            image key is set, it falls back to the main OpenAI API key.
          </p>

          <div className="space-y-4">
            <CredentialField
              id="openai-image-api-key"
              label="OpenAI Image API Key"
              value={imageApiKey}
              onChange={(value) =>
                setDraft((current) =>
                  current ? { ...current, imageApiKey: value } : current,
                )
              }
              placeholder="sk-proj-..."
              help="Optional. Use this only if image generation should bill through a different OpenAI project."
            />

            <div>
              <label
                htmlFor="ai-image-model"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Image Model
              </label>
              <select
                id="ai-image-model"
                value={imageModel}
                onChange={(e) =>
                  setDraft((current) =>
                    current
                      ? { ...current, imageModel: e.target.value }
                      : current,
                  )
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="gpt-image-1">GPT Image 1</option>
                <option value="dall-e-3">DALL-E 3</option>
              </select>
            </div>
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
