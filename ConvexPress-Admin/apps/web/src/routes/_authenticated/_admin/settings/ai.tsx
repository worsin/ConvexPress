/**
 * AI Provider Settings Page
 *
 * Configure AI provider (OpenRouter or Anthropic Direct), API keys,
 * default model, and Tavily research API key.
 *
 * Unlike standard settings pages, this uses a custom flow similar to
 * the analytics page: manual save with test connection capability.
 *
 * Settings are stored in the settings table with section: "ai".
 * Keys: provider, apiKey, defaultModel, tavilyApiKey
 */

import { useState, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Brain,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Search,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/settings/ai")({
  component: AISettingsPage,
});

// ─── Model Options ────────────────────────────────────────────────────────────

const OPENROUTER_MODELS = [
  {
    label: "Claude Sonnet 4 (Recommended)",
    value: "anthropic/claude-sonnet-4-20250514",
  },
  { label: "Claude Opus 4", value: "anthropic/claude-opus-4-20250514" },
  { label: "Claude Haiku 4", value: "anthropic/claude-haiku-4-20250414" },
  { label: "GPT-4o", value: "openai/gpt-4o" },
  { label: "GPT-4o Mini", value: "openai/gpt-4o-mini" },
  { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro-preview" },
  { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash-preview" },
  {
    label: "Llama 3.1 405B Instruct",
    value: "meta-llama/llama-3.1-405b-instruct",
  },
  {
    label: "DeepSeek V3",
    value: "deepseek/deepseek-chat",
  },
];

const ANTHROPIC_MODELS = [
  {
    label: "Claude Sonnet 4 (Recommended)",
    value: "claude-sonnet-4-20250514",
  },
  { label: "Claude Opus 4", value: "claude-opus-4-20250514" },
  { label: "Claude Haiku 4", value: "claude-haiku-4-20250414" },
];

// ─── Component ────────────────────────────────────────────────────────────────

function AISettingsPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "ai" as any,
  });
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const saveSecret = useMutation(api.settings.secrets.saveServiceSecret);
  const deleteSecret = useMutation(api.settings.secrets.deleteServiceSecret);

  // Check encrypted secret existence (not the value, just whether one is stored)
  const hasProviderKey = useQuery(api.settings.secrets.hasServiceSecret, {
    service: "ai.provider",
  });
  const hasTavilyKey = useQuery(api.settings.secrets.hasServiceSecret, {
    service: "ai.tavily",
  });

  // Form state
  const [provider, setProvider] = useState<"openrouter" | "anthropic">(
    "openrouter",
  );
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState(
    "anthropic/claude-sonnet-4-20250514",
  );
  const [tavilyApiKey, setTavilyApiKey] = useState("");

  // Track whether user has typed a new key (vs. showing placeholder for existing)
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [tavilyKeyDirty, setTavilyKeyDirty] = useState(false);

  // UI state
  const [showApiKey, setShowApiKey] = useState(false);
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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

  // Initialize form from stored settings (non-secret fields only)
  useEffect(() => {
    if (settings && settings !== null) {
      const s = settings as any;
      if (s.provider) setProvider(s.provider);
      if (s.defaultModel) setDefaultModel(s.defaultModel);
      // Legacy migration: if apiKey is still in settings, pre-fill so user
      // can save to migrate it to encrypted storage
      if (s.apiKey && !hasProviderKey) {
        setApiKey(s.apiKey);
        setApiKeyDirty(true);
      }
      if (s.tavilyApiKey && !hasTavilyKey) {
        setTavilyApiKey(s.tavilyApiKey);
        setTavilyKeyDirty(true);
      }
    }
  }, [settings, hasProviderKey, hasTavilyKey]);

  // Reset model when provider changes
  const handleProviderChange = useCallback(
    (newProvider: "openrouter" | "anthropic") => {
      setProvider(newProvider);
      setTestResult(null);
      // Set a sensible default model for the new provider
      if (newProvider === "openrouter") {
        setDefaultModel("anthropic/claude-sonnet-4-20250514");
      } else {
        setDefaultModel("claude-sonnet-4-20250514");
      }
    },
    [],
  );

  // ─── Save Handler ─────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Save non-secret settings (provider, model) to the settings table.
      // API keys are stored encrypted in service_secrets, NOT in settings.
      await updateSection({
        section: "ai" as any,
        values: {
          provider,
          defaultModel,
        },
      });

      // Save API keys to encrypted secret storage (only if user entered a new value)
      if (apiKeyDirty && apiKey.trim()) {
        await saveSecret({ service: "ai.provider", secret: apiKey.trim() });
      } else if (apiKeyDirty && !apiKey.trim()) {
        // User cleared the key
        await deleteSecret({ service: "ai.provider" });
      }

      if (tavilyKeyDirty && tavilyApiKey.trim()) {
        await saveSecret({
          service: "ai.tavily",
          secret: tavilyApiKey.trim(),
        });
      } else if (tavilyKeyDirty && !tavilyApiKey.trim()) {
        await deleteSecret({ service: "ai.tavily" });
      }

      // Reset dirty flags after successful save
      setApiKeyDirty(false);
      setTavilyKeyDirty(false);
      setApiKey("");
      setTavilyApiKey("");

      toast.success("AI settings saved successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save AI settings: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }, [
    provider,
    apiKey,
    defaultModel,
    tavilyApiKey,
    apiKeyDirty,
    tavilyKeyDirty,
    updateSection,
    saveSecret,
    deleteSecret,
  ]);

  // ─── Test AI Connection ───────────────────────────────────────────────────

  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim()) {
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
            model: defaultModel || "claude-sonnet-4-20250514",
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
    if (!tavilyApiKey.trim()) {
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

  const modelOptions =
    provider === "openrouter" ? OPENROUTER_MODELS : ANTHROPIC_MODELS;

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
                  Access Claude, GPT-4o, Gemini, Llama, and more through a
                  single API key. Best for flexibility and cost management.
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
            <div>
              <label
                htmlFor="ai-api-key"
                className="block text-sm font-medium text-foreground mb-1"
              >
                {provider === "openrouter"
                  ? "OpenRouter API Key"
                  : "Anthropic API Key"}
              </label>

              {/* Encrypted key indicator */}
              {hasProviderKey && !apiKeyDirty && (
                <div className="flex items-center gap-1.5 mb-2 text-xs text-success">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>API key is stored securely (encrypted)</span>
                </div>
              )}

              <div className="relative">
                <input
                  id="ai-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKeyDirty ? apiKey : ""}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setApiKeyDirty(true);
                    setTestResult(null);
                  }}
                  placeholder={
                    hasProviderKey && !apiKeyDirty
                      ? "Enter a new key to replace the existing one"
                      : provider === "openrouter"
                        ? "sk-or-v1-..."
                        : "sk-ant-api03-..."
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {provider === "openrouter" ? (
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
                )}
              </p>
            </div>

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
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {modelOptions.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
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
              disabled={isTesting || (!apiKey.trim() && !hasProviderKey)}
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
            <div>
              <label
                htmlFor="tavily-api-key"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Tavily API Key
              </label>

              {/* Encrypted key indicator */}
              {hasTavilyKey && !tavilyKeyDirty && (
                <div className="flex items-center gap-1.5 mb-2 text-xs text-success">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>API key is stored securely (encrypted)</span>
                </div>
              )}

              <div className="relative">
                <input
                  id="tavily-api-key"
                  type={showTavilyKey ? "text" : "password"}
                  value={tavilyKeyDirty ? tavilyApiKey : ""}
                  onChange={(e) => {
                    setTavilyApiKey(e.target.value);
                    setTavilyKeyDirty(true);
                    setTavilyTestResult(null);
                  }}
                  placeholder={
                    hasTavilyKey && !tavilyKeyDirty
                      ? "Enter a new key to replace the existing one"
                      : "tvly-..."
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowTavilyKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showTavilyKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
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
              </p>
            </div>

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
              disabled={isTavilyTesting || (!tavilyApiKey.trim() && !hasTavilyKey)}
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

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
