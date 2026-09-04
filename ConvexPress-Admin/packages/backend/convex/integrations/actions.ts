"use node";

/**
 * Integrations — live verification.
 *
 * `verify` makes a real, read-only request to the provider with the
 * credentials this website has stored (or the env fallback), records a safe
 * summary in `integration_checks`, and returns it. Nothing here writes to a
 * provider, and no credential or raw response body is ever persisted.
 */

import { v } from "convex/values";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { decryptSettingSecret } from "../helpers/settingsSecret";
import { getIntegration } from "./registry";

type Detail = { label: string; ok: boolean; note?: string };
type Outcome = {
  status: "verified" | "failed" | "skipped";
  summary: string;
  details: Detail[];
};

const TIMEOUT_MS = 12_000;

async function probe(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Provider error text that is safe to show: short, no echoes of our request. */
function shortError(status: number, json: any, text: string): string {
  const firstError = Array.isArray(json?.errors) ? json.errors[0] : null;
  const message =
    json?.error?.message ??
    firstError?.message ??
    firstError?.long_message ??
    json?.error_description ??
    json?.message ??
    (typeof json?.error === "string" ? json.error : null) ??
    json?.error?.type ??
    text;
  const trimmed = String(message ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  return `HTTP ${status}${trimmed ? ` · ${trimmed}` : ""}`;
}

function failure(summary: string, details: Detail[] = []): Outcome {
  return { status: "failed", summary, details };
}

function success(summary: string, details: Detail[] = []): Outcome {
  return { status: "verified", summary, details };
}

function skipped(summary: string, details: Detail[] = []): Outcome {
  return { status: "skipped", summary, details };
}

type Config = Record<string, string | boolean | undefined>;

async function decryptAll(
  values: Record<string, unknown>,
  envValues: Record<string, string>,
): Promise<Config> {
  const out: Config = {};
  for (const [key, raw] of Object.entries(values)) {
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      out[key] =
        trimmed.startsWith("enc:") || trimmed.startsWith("b64:")
          ? await decryptSettingSecret(trimmed)
          : trimmed;
    } else if (typeof raw === "boolean") {
      out[key] = raw;
    }
  }
  for (const [key, value] of Object.entries(envValues)) {
    if (!out[key]) out[key] = value;
  }
  return out;
}

function str(config: Config, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

// ─── Providers ──────────────────────────────────────────────────────────────

async function verifyResend(config: Config): Promise<Outcome> {
  const key = str(config, "resendApiKey");
  if (!key) return failure("No API key configured.");
  const res = await probe("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return failure(`Resend rejected the key: ${shortError(res.status, res.json, res.text)}`);
  const domains: Array<{ name: string; status: string }> = res.json?.data ?? [];
  const from = str(config, "fromAddress");
  const fromDomain = from.includes("@") ? from.split("@")[1].toLowerCase() : "";
  const match = domains.find((domain) => domain.name.toLowerCase() === fromDomain);
  const details: Detail[] = [
    { label: "API key", ok: true, note: `${domains.length} domain${domains.length === 1 ? "" : "s"} on the account` },
    {
      label: "From address",
      ok: Boolean(match && match.status === "verified"),
      note: !from
        ? "No from address set"
        : !match
          ? `${fromDomain} is not added to Resend`
          : match.status === "verified"
            ? `${fromDomain} verified`
            : `${fromDomain} is ${match.status}`,
    },
    {
      label: "Webhook secret",
      ok: Boolean(str(config, "webhookSecret")),
      note: str(config, "webhookSecret") ? "Delivery tracking enabled" : "Optional · delivery events will not be tracked",
    },
  ];
  const ready = details[0].ok && details[1].ok;
  return ready
    ? success(`Sending as ${from} through a verified domain.`, details)
    : failure(
        match ? `Domain ${fromDomain} is not verified in Resend.` : `Add ${fromDomain || "a sending domain"} to Resend before sending.`,
        details,
      );
}

async function verifyClerk(config: Config): Promise<Outcome> {
  const key = str(config, "clerkSecretKey");
  if (!key) return failure("No secret key configured.");
  const users = await probe("https://api.clerk.com/v1/users?limit=1", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!users.ok) return failure(`Clerk rejected the key: ${shortError(users.status, users.json, users.text)}`);
  const details: Detail[] = [
    { label: "Secret key", ok: true, note: key.startsWith("sk_live_") ? "Live instance" : "Development instance" },
  ];
  const issuer = str(config, "clerkJwtIssuerDomain").replace(/\/$/, "");
  if (issuer) {
    const jwks = await probe(`${issuer}/.well-known/jwks.json`);
    const keys = Array.isArray(jwks.json?.keys) ? jwks.json.keys.length : 0;
    details.push({
      label: "JWT issuer",
      ok: jwks.ok && keys > 0,
      note: jwks.ok ? `${keys} signing key${keys === 1 ? "" : "s"} published` : shortError(jwks.status, jwks.json, jwks.text),
    });
  } else {
    details.push({ label: "JWT issuer", ok: false, note: "Set the issuer domain so customer tokens can be validated" });
  }
  details.push({
    label: "Webhook secret",
    ok: Boolean(str(config, "clerkWebhookSecret")),
    note: str(config, "clerkWebhookSecret") ? "Profile sync enabled" : "Optional · profiles will not sync from Clerk",
  });
  const ready = details[1].ok;
  return ready ? success("Clerk API and JWT issuer respond.", details) : failure("Clerk key works but the JWT issuer is not reachable.", details);
}

async function verifyMeilisearch(host: string, apiKey: string): Promise<{ ok: boolean; details: Detail[]; summary: string }> {
  const base = host.replace(/\/$/, "");
  if (!base) return { ok: false, details: [], summary: "No host configured." };
  const health = await probe(`${base}/health`);
  if (!health.ok) {
    return { ok: false, details: [{ label: "Host", ok: false, note: shortError(health.status, health.json, health.text) }], summary: `Meilisearch at ${base} is unreachable.` };
  }
  const version = await probe(`${base}/version`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!version.ok) {
    return {
      ok: false,
      details: [
        { label: "Host", ok: true, note: `Healthy (${health.json?.status ?? "available"})` },
        { label: "API key", ok: false, note: shortError(version.status, version.json, version.text) },
      ],
      summary: "Meilisearch is reachable but rejected the API key.",
    };
  }
  const indexes = await probe(`${base}/indexes?limit=50`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const count = Array.isArray(indexes.json?.results) ? indexes.json.results.length : 0;
  return {
    ok: true,
    details: [
      { label: "Host", ok: true, note: `Healthy · v${version.json?.pkgVersion ?? "?"}` },
      { label: "API key", ok: true, note: indexes.ok ? `${count} index${count === 1 ? "" : "es"} visible` : "Key accepted" },
    ],
    summary: `Meilisearch v${version.json?.pkgVersion ?? "?"} at ${base} accepts the key.`,
  };
}

async function verifySearch(config: Config): Promise<Outcome> {
  const result = await verifyMeilisearch(str(config, "meilisearchHost"), str(config, "meilisearchApiKey"));
  return result.ok ? success(result.summary, result.details) : failure(result.summary, result.details);
}

async function verifyModelProvider(
  provider: string,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; note: string; modelKnown: boolean | null }> {
  if (provider === "openrouter") {
    const res = await probe("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { ok: false, note: shortError(res.status, res.json, res.text), modelKnown: null };
    const data = res.json?.data ?? {};
    const usage = typeof data.usage === "number" ? `$${data.usage.toFixed(2)} used` : "usage unknown";
    const limit = data.limit === null || data.limit === undefined ? "no limit" : `$${data.limit} limit`;
    let modelKnown: boolean | null = null;
    if (model) {
      const models = await probe("https://openrouter.ai/api/v1/models");
      const ids: string[] = Array.isArray(models.json?.data) ? models.json.data.map((entry: any) => entry.id) : [];
      modelKnown = ids.length ? ids.includes(model) : null;
    }
    // OpenRouter's `label` echoes a masked key fragment; never surface it.
    return { ok: true, note: `Key accepted · ${usage} · ${limit}`, modelKnown };
  }
  if (provider === "openai") {
    const res = await probe("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { ok: false, note: shortError(res.status, res.json, res.text), modelKnown: null };
    const ids: string[] = Array.isArray(res.json?.data) ? res.json.data.map((entry: any) => entry.id) : [];
    return { ok: true, note: `${ids.length} models available`, modelKnown: model ? ids.includes(model) : null };
  }
  if (provider === "anthropic") {
    const res = await probe("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) return { ok: false, note: shortError(res.status, res.json, res.text), modelKnown: null };
    const ids: string[] = Array.isArray(res.json?.data) ? res.json.data.map((entry: any) => entry.id) : [];
    return { ok: true, note: `${ids.length} models available`, modelKnown: model ? ids.includes(model) : null };
  }
  return { ok: false, note: `Unknown provider ${provider}`, modelKnown: null };
}

async function verifyAi(config: Config): Promise<Outcome> {
  const provider = str(config, "provider") || "openrouter";
  const apiKey = str(config, "apiKey");
  if (!apiKey) return failure(`No ${provider} API key configured.`);
  const model = str(config, "defaultModel");
  const main = await verifyModelProvider(provider, apiKey, model);
  const details: Detail[] = [{ label: `${provider} key`, ok: main.ok, note: main.note }];
  if (!main.ok) return failure(`${provider} rejected the key.`, details);
  if (model) {
    details.push({
      label: "Default model",
      ok: main.modelKnown !== false,
      note: main.modelKnown === null ? `${model} (not checked)` : main.modelKnown ? `${model} available` : `${model} is not in the provider's model list`,
    });
  }
  const imageKey = str(config, "imageApiKey") || (provider === "openai" ? apiKey : "");
  if (imageKey) {
    const image = await verifyModelProvider("openai", imageKey, str(config, "imageModel") || "gpt-image-1");
    details.push({
      label: "Image generation",
      ok: image.ok,
      note: image.ok ? (image.modelKnown === false ? "Key works · image model not listed" : "OpenAI image key works") : image.note,
    });
  } else {
    details.push({ label: "Image generation", ok: false, note: "Optional · no OpenAI image key" });
  }
  const modelProblem = details.find((detail) => detail.label === "Default model" && !detail.ok);
  return modelProblem
    ? failure(`${provider} key works, but the default model is unavailable.`, details)
    : success(`${provider} accepts the key${model ? ` · ${model}` : ""}.`, details);
}

async function verifyTavily(config: Config): Promise<Outcome> {
  const key = str(config, "tavilyApiKey");
  if (!key) return failure("No Tavily API key configured.");
  const res = await probe("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: "ConvexPress", max_results: 1, search_depth: "basic" }),
  });
  if (!res.ok) return failure(`Tavily rejected the key: ${shortError(res.status, res.json, res.text)}`);
  const count = Array.isArray(res.json?.results) ? res.json.results.length : 0;
  return success("Tavily search responds.", [{ label: "Search", ok: true, note: `${count} result returned for a probe query` }]);
}

async function verifyKbSearch(config: Config): Promise<Outcome> {
  const details: Detail[] = [];
  let ok = true;
  if (config.meilisearchEnabled === false && !str(config, "meilisearchUrl")) {
    details.push({ label: "Meilisearch", ok: true, note: "Disabled" });
  } else {
    const search = await verifyMeilisearch(str(config, "meilisearchUrl"), str(config, "meilisearchApiKey"));
    details.push(...search.details.map((detail) => ({ ...detail, label: `Meilisearch ${detail.label.toLowerCase()}` })));
    ok = ok && search.ok;
    if (!search.ok && search.details.length === 0) details.push({ label: "Meilisearch", ok: false, note: search.summary });
  }
  const ragKey = str(config, "ragApiKey");
  if (config.ragEnabled === true || ragKey) {
    if (!ragKey) {
      details.push({ label: "AI answers", ok: false, note: "Enabled without an API key" });
      ok = false;
    } else {
      const provider = str(config, "ragProvider") || "openai";
      const result = await verifyModelProvider(provider, ragKey, str(config, "ragModel"));
      details.push({ label: `AI answers (${provider})`, ok: result.ok, note: result.note });
      ok = ok && result.ok;
    }
  } else {
    details.push({ label: "AI answers", ok: true, note: "Disabled" });
  }
  return ok ? success("Knowledge base search services respond.", details) : failure("A knowledge base search service failed.", details);
}

async function verifySupportAi(config: Config): Promise<Outcome> {
  const provider = str(config, "aiProvider");
  const apiKey = str(config, "aiApiKey");
  if (!provider || !apiKey) return failure("Provider and API key are required.");
  const result = await verifyModelProvider(provider, apiKey, str(config, "aiModel"));
  const details: Detail[] = [{ label: `${provider} key`, ok: result.ok, note: result.note }];
  let ok = result.ok;
  if (str(config, "aiModel")) {
    details.push({
      label: "Model",
      ok: result.modelKnown !== false,
      note: result.modelKnown === false ? `${str(config, "aiModel")} not listed by ${provider}` : str(config, "aiModel"),
    });
    ok = ok && result.modelKnown !== false;
  }
  if (config.meilisearchEnabled === true) {
    const search = await verifyMeilisearch(str(config, "meilisearchUrl"), str(config, "meilisearchApiKey"));
    details.push(...search.details.map((detail) => ({ ...detail, label: `Meilisearch ${detail.label.toLowerCase()}` })));
    ok = ok && search.ok;
  }
  return ok ? success("Support AI provider responds.", details) : failure("Support AI is not fully working.", details);
}

async function verifyStripe(config: Config): Promise<Outcome> {
  const key = str(config, "stripeSecretKey");
  if (!key) return failure("No secret key configured.");
  const res = await probe("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return failure(`Stripe rejected the key: ${shortError(res.status, res.json, res.text)}`);
  const account = res.json ?? {};
  const keyMode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "production" : "sandbox";
  const mode = str(config, "stripeMode") || "sandbox";
  const publishable = str(config, "stripePublishableKey");
  const publishableMode = publishable.startsWith("pk_live_") ? "production" : publishable.startsWith("pk_test_") ? "sandbox" : null;
  const webhook = str(config, "stripeWebhookSecret");
  const details: Detail[] = [
    { label: "Secret key", ok: true, note: `${account.id ?? "account"} · ${(account.country ?? "").toUpperCase()} · ${(account.default_currency ?? "").toUpperCase()}` },
    { label: "Mode", ok: keyMode === mode, note: keyMode === mode ? `${mode} key matches the ${mode} setting` : `Key is ${keyMode} but mode is set to ${mode}` },
    {
      label: "Publishable key",
      ok: Boolean(publishable) && publishableMode === keyMode,
      note: !publishable ? "Missing · checkout cannot load" : publishableMode === keyMode ? `${publishableMode} key` : "Does not match the secret key's mode",
    },
    { label: "Webhook secret", ok: webhook.startsWith("whsec_"), note: webhook ? (webhook.startsWith("whsec_") ? "Present" : "Does not look like a whsec_ signing secret") : "Optional · renewals and async payments will not update" },
    { label: "Charges", ok: account.charges_enabled === true, note: account.charges_enabled ? "Enabled" : "Not enabled on this Stripe account" },
  ];
  const blocking = details.filter((detail) => !detail.ok && ["Mode", "Publishable key"].includes(detail.label));
  return blocking.length
    ? failure(`Stripe key works but ${blocking.map((detail) => detail.label.toLowerCase()).join(" and ")} need attention.`, details)
    : success(`Connected to ${account.id ?? "Stripe"} in ${keyMode} mode.`, details);
}

async function verifyPayPal(config: Config): Promise<Outcome> {
  const clientId = str(config, "paypalClientId");
  const clientSecret = str(config, "paypalClientSecret");
  if (!clientId || !clientSecret) return failure("Client ID and client secret are required.");
  const mode = str(config, "paypalMode") || "sandbox";
  const base = mode === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const res = await probe(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return failure(`PayPal (${mode}) rejected the credentials: ${shortError(res.status, res.json, res.text)}`);
  const details: Detail[] = [
    { label: "OAuth", ok: true, note: `${mode} token issued · scopes: ${String(res.json?.scope ?? "").split(" ").length}` },
    { label: "Webhook ID", ok: Boolean(str(config, "paypalWebhookId")), note: str(config, "paypalWebhookId") ? "Present" : "Optional · webhook events cannot be verified" },
  ];
  return success(`PayPal ${mode} credentials accepted.`, details);
}

async function verifyGoogle(config: Config): Promise<Outcome> {
  const placesKey = str(config, "placesApiKey");
  if (!placesKey) return failure("No Places API key configured.");
  const places = await probe(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent("1600 Amphitheatre")}&key=${encodeURIComponent(placesKey)}`,
  );
  const placesStatus = String(places.json?.status ?? `HTTP ${places.status}`);
  const placesOk = places.ok && ["OK", "ZERO_RESULTS"].includes(placesStatus);
  const details: Detail[] = [
    { label: "Places autocomplete", ok: placesOk, note: placesOk ? placesStatus : `${placesStatus}${places.json?.error_message ? ` · ${String(places.json.error_message).slice(0, 120)}` : ""}` },
  ];
  const geocodeKey = str(config, "geocodeApiKey") || placesKey;
  const geocode = await probe(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent("1600 Amphitheatre Parkway, Mountain View, CA")}&key=${encodeURIComponent(geocodeKey)}`,
  );
  const geocodeStatus = String(geocode.json?.status ?? `HTTP ${geocode.status}`);
  const geocodeOk = geocode.ok && ["OK", "ZERO_RESULTS"].includes(geocodeStatus);
  details.push({
    label: str(config, "geocodeApiKey") ? "Geocoding" : "Geocoding (Places key)",
    ok: geocodeOk,
    note: geocodeOk ? geocodeStatus : `${geocodeStatus}${geocode.json?.error_message ? ` · ${String(geocode.json.error_message).slice(0, 120)}` : ""}`,
  });
  return placesOk ? success(`Google Places responds${geocodeOk ? " and geocoding works" : ""}.`, details) : failure("Google rejected the Places key.", details);
}

async function verifyCaptcha(config: Config): Promise<Outcome> {
  const providers = [
    { key: "FORMS_TURNSTILE_SECRET_KEY", label: "Turnstile", url: "https://challenges.cloudflare.com/turnstile/v0/siteverify" },
    { key: "FORMS_HCAPTCHA_SECRET_KEY", label: "hCaptcha", url: "https://hcaptcha.com/siteverify" },
    { key: "FORMS_RECAPTCHA_SECRET_KEY", label: "reCAPTCHA", url: "https://www.google.com/recaptcha/api/siteverify" },
  ];
  const details: Detail[] = [];
  let any = false;
  let ok = true;
  for (const provider of providers) {
    const secret = str(config, provider.key);
    if (!secret) continue;
    any = true;
    // A deliberately invalid response token proves the SECRET is accepted:
    // providers answer "invalid-input-response" for a good secret and
    // "invalid-input-secret" for a bad one. No challenge is consumed.
    const res = await probe(provider.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=convexpress-probe`,
    });
    const codes: string[] = Array.isArray(res.json?.["error-codes"]) ? res.json["error-codes"] : [];
    const secretOk = res.ok && !codes.some((code) => /secret/i.test(code));
    ok = ok && secretOk;
    details.push({ label: provider.label, ok: secretOk, note: secretOk ? "Secret accepted" : codes.join(", ") || shortError(res.status, res.json, res.text) });
  }
  if (!any) return skipped("No CAPTCHA secret is set in the environment.");
  return ok ? success("CAPTCHA secrets accepted.", details) : failure("A CAPTCHA secret was rejected.", details);
}

async function verifyAirtable(config: Config): Promise<Outcome> {
  const token = str(config, "AIRTABLE_API_KEY");
  if (!token) return skipped("AIRTABLE_API_KEY is not set in the environment.");
  const res = await probe("https://api.airtable.com/v0/meta/bases", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return failure(`Airtable rejected the token: ${shortError(res.status, res.json, res.text)}`);
  const bases: Array<{ id: string; name: string }> = res.json?.bases ?? [];
  const details: Detail[] = [{ label: "Token", ok: true, note: `${bases.length} base${bases.length === 1 ? "" : "s"} accessible` }];
  const baseId = str(config, "AIRTABLE_BASE_ID");
  if (baseId) {
    const found = bases.find((base) => base.id === baseId);
    details.push({ label: "Base", ok: Boolean(found), note: found ? found.name : `${baseId} is not accessible with this token` });
    if (!found) return failure("Token works but cannot reach the configured base.", details);
  }
  return success("Airtable token accepted.", details);
}

// ─── Entry point ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const verify = action({
  args: { providerId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.settings.internals.requireManageOptionsInternal, {});
    const definition = getIntegration(args.providerId);
    if (!definition) throw new Error(`Unknown integration: ${args.providerId}`);
    if (!definition.verifiable) throw new Error(`${definition.title} cannot be verified.`);

    const loaded = await ctx.runQuery(internal.integrations.internals.loadProviderConfiguration, {
      providerId: args.providerId,
    });
    const started = Date.now();
    let outcome: Outcome;
    try {
      if (definition.storage.kind === "shipping") {
        outcome = await verifyShipping(ctx, definition.storage.provider);
      } else {
        const config = await decryptAll(loaded.values, loaded.envValues);
        outcome =
          definition.id === "ga4"
            ? await verifyGa4(ctx, config)
            : await verifyByProvider(definition.id, config);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome = failure(/abort/i.test(message) ? "The provider did not respond within 12 seconds." : message.slice(0, 200));
    }
    const latencyMs = Date.now() - started;

    const checkedBy = await ctx.runQuery(internal.integrations.internals.currentOperatorId, {});
    await ctx.runMutation(internal.integrations.internals.recordCheck, {
      providerId: args.providerId,
      status: outcome.status,
      checkedBy: checkedBy ?? undefined,
      latencyMs,
      summary: outcome.summary,
      details: outcome.details,
      configFingerprint: loaded.fingerprint,
    });
    return { status: outcome.status, summary: outcome.summary, latencyMs, details: outcome.details };
  },
});

async function verifyByProvider(id: string, config: Config): Promise<Outcome> {
  switch (id) {
    case "resend":
      return verifyResend(config);
    case "clerk":
      return verifyClerk(config);
    case "meilisearch":
      return verifySearch(config);
    case "ai":
      return verifyAi(config);
    case "tavily":
      return verifyTavily(config);
    case "kb-search":
      return verifyKbSearch(config);
    case "support-ai":
      return verifySupportAi(config);
    case "stripe":
      return verifyStripe(config);
    case "paypal":
      return verifyPayPal(config);
    case "google":
      return verifyGoogle(config);
    case "captcha":
      return verifyCaptcha(config);
    case "airtable":
      return verifyAirtable(config);
    default:
      return failure(`No verifier for ${id}.`);
  }
}

async function verifyGa4(ctx: any, config: Config): Promise<Outcome> {
  const propertyId = str(config, "ga4PropertyId");
  const serviceAccountJson = str(config, "ga4ServiceAccountJson");
  if (!propertyId || !serviceAccountJson) return failure("Property ID and service account JSON are required.");
  const result: any = await ctx.runAction(api.ga4.actions.testConnection, { propertyId, serviceAccountJson });
  if (result?.success) {
    return success(`GA4 report ran for ${propertyId}.`, [
      { label: "Service account", ok: true, note: String(result.clientEmail ?? "") },
      { label: "Property", ok: true, note: propertyId },
    ]);
  }
  return failure(String(result?.error ?? "GA4 rejected the credentials."), [
    { label: "Property", ok: false, note: propertyId },
  ]);
}

async function verifyShipping(
  ctx: any,
  provider: "shipstation" | "ups" | "usps" | "fedex" | "dhl",
): Promise<Outcome> {
  const result: any =
    provider === "shipstation"
      ? await ctx.runAction(api.shipping.actions.verifyShipStationConnection, {})
      : await ctx.runAction(api.shipping.actions.verifyDirectCarrierFoundation, { provider });
  if (result?.success) {
    const note =
      typeof result.accountCount === "number"
        ? `${result.accountCount} carrier account${result.accountCount === 1 ? "" : "s"}`
        : result.verificationMode === "local_readiness"
          ? "Credentials complete (local readiness check)"
          : "Live API check passed";
    return success(String(result.message ?? `${provider} verification succeeded.`), [{ label: "Carrier", ok: true, note }]);
  }
  const missing: string[] = Array.isArray(result?.missingFields) ? result.missingFields : [];
  return failure(String(result?.error ?? result?.message ?? `${provider} verification failed.`), [
    { label: "Carrier", ok: false, note: missing.length ? `Missing: ${missing.join(", ")}` : undefined },
  ]);
}
