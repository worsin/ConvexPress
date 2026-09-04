/**
 * Clerk connection — one page per site that takes customer sign-in from
 * "nothing" to "working", and shows exactly where it stands in between.
 *
 * Entry paths
 *   · Connect an existing Clerk app with one secret key (everything else derived)
 *   · Start without a Clerk account (keyless app, claim later)
 *
 * After connecting the page owns: the readiness ledger, applying the issuer to
 * the site's Convex deployment (+ redeploy) from the desktop app, the webhook
 * (portal + signing secret), syncing Clerk's sign-in options so the website
 * forms follow them, and a real token probe on development instances.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { api as controlApi } from "@control/convex/_generated/api";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { IntegrationHeader, type IntegrationStatus } from "@/components/settings/integrations/IntegrationHeader";
import { SettingsSection } from "@/components/settings/integrations/SettingsSection";
import { CredentialField } from "@/components/settings/integrations/CredentialField";
import { WebhookEndpointField } from "@/components/settings/integrations/WebhookEndpointField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useControlClient, useControlShell } from "@/control/ControlShellContext";
import { getElectronBridge, type SiteDeployProgress } from "@/lib/electron";
import { siteProcessKey, targetForEnvironment, useSiteRunner } from "@/lib/site-runner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/settings/integrations/clerk")({
  component: ClerkConnectionPage,
});

// ─── Types (mirrors auth/clerkConnection.getStatus) ─────────────────────────

type ReadinessState = "ok" | "warn" | "fail" | "pending";

interface ReadinessItem {
  id: string;
  label: string;
  state: ReadinessState;
  note: string;
}

interface AttributeCapability {
  enabled: boolean;
  required: boolean;
  verifications: string[];
}

interface Capabilities {
  applicationName: string | null;
  attributes: Record<
    "emailAddress" | "phoneNumber" | "username" | "firstName" | "lastName" | "password",
    AttributeCapability
  >;
  social: string[];
  signUp: { mode: string; captchaEnabled: boolean; legalConsentEnabled: boolean };
  signIn: { preferredStrategy: string; secondFactorRequired: boolean; secondFactors: string[] };
  password: { minLength: number; requireSpecialChar: boolean; requireNumbers: boolean; requireUppercase: boolean; requireLowercase: boolean };
  passkeys: { enabled: boolean };
}

interface Status {
  connected: boolean;
  mode: "" | "manual" | "secret_key" | "keyless";
  hasSecretKey: boolean;
  publishableKey: string | null;
  frontendApi: string | null;
  issuer: string | null;
  environmentType: "" | "development" | "production";
  instanceId: string;
  claimUrl: string;
  dashboardUrl: string;
  claimedAt: number | null;
  connectedAt: number | null;
  svixConfigured: boolean;
  siteOrigins: string[];
  capabilities: Capabilities | null;
  capabilitiesSyncedAt: number | null;
  lastVerifiedAt: number | null;
  lastVerification: Record<string, unknown> | null;
  webhook: { url: string | null; secretStored: boolean; lastReceivedAt: number | null };
  deployment: {
    origin: string | null;
    httpActionsOrigin: string | null;
    issuer: string | null;
    hasSecretKeyEnv: boolean;
    issuerMatches: boolean;
    requiredEnv: Array<{ name: string; value?: string; secret?: boolean }>;
  };
  readiness: { items: ReadinessItem[]; loginReady: boolean; complete: boolean };
}

// ─── Small presentational helpers ───────────────────────────────────────────

/** Open a link in the system browser (desktop) or a new tab (browser). */
function openExternal(url: string) {
  const bridge = getElectronBridge();
  if (bridge?.siteRunner) void bridge.siteRunner.openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function errorText(cause: unknown): string {
  const data = (cause as { data?: { message?: string } })?.data;
  if (data?.message) return data.message;
  const message = cause instanceof Error ? cause.message : String(cause);
  const match = /Uncaught (?:Convex)?Error: (.+?)(?: at | \[)/.exec(message);
  return (match?.[1] ?? message).slice(0, 300);
}

function when(ts: number | null | undefined): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ts).toLocaleDateString();
}

function StateIcon({ state }: { state: ReadinessState }) {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-destructive" aria-hidden />;
  return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

function CopyValue({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="eyebrow text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className={cn("truncate rounded-md bg-surface-2 px-2 py-1 text-xs", !mono && "font-sans")}>{value}</code>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              // clipboard unavailable
            }
          }}
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "fail" | "muted"; children: React.ReactNode }) {
  const classes = {
    ok: "bg-success-soft text-success",
    warn: "bg-warning-soft text-warning",
    fail: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", classes)}>{children}</span>;
}

// ─── Page ───────────────────────────────────────────────────────────────────

function ClerkConnectionPage() {
  const status = useQuery((api as any).auth.clerkConnection.getStatus, {}) as Status | undefined;
  const connectWithSecretKey = useAction((api as any).auth.clerkConnection.connectWithSecretKey);
  const startKeyless = useAction((api as any).auth.clerkConnection.startKeyless);
  const verify = useAction((api as any).auth.clerkConnection.verify);
  const syncCapabilities = useAction((api as any).auth.clerkConnection.syncCapabilities);
  const webhookPortalUrl = useAction((api as any).auth.clerkConnection.webhookPortalUrl);
  const runTokenProbe = useAction((api as any).auth.clerkConnection.runTokenProbe);
  const saveWebhookSecret = useMutation((api as any).auth.clerkConnection.saveWebhookSecret);
  const markClaimed = useMutation((api as any).auth.clerkConnection.markClaimed);
  const disconnect = useMutation((api as any).auth.clerkConnection.disconnect);
  const envChanges = useQuery((api as any).auth.clerkConnection.deploymentEnvChanges, {}) as
    | Array<{ name: string; value: string | null }>
    | undefined;

  const shell = useControlShell();
  const controlClient = useControlClient();
  const runner = useSiteRunner();
  const bridge = getElectronBridge();

  const [showConnectForm, setShowConnectForm] = useState(false);
  const [secretKey, setSecretKey] = useState("");
  const [publishableKeyHint, setPublishableKeyHint] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "keyless" | "verify" | "sync" | "portal" | "probe" | "apply" | "disconnect">(null);
  const [probeResult, setProbeResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [deployLog, setDeployLog] = useState<SiteDeployProgress[]>([]);
  const [deployPhase, setDeployPhase] = useState<string | null>(null);
  const [webhookSecretDraft, setWebhookSecretDraft] = useState<string | null>(null);

  // Live deploy progress from the desktop app.
  useEffect(() => {
    if (!bridge?.siteDeploy) return;
    return bridge.siteDeploy.onProgress((event) => {
      setDeployLog((current) => [...current.slice(-80), event]);
      setDeployPhase(event.phase);
    });
  }, [bridge]);

  const environment = shell?.selectedEnvironment ?? null;
  const website = shell?.selectedWebsite ?? null;

  // Local storefront process for this environment (if the desktop runs one).
  const storefront = useMemo(() => {
    if (!environment) return null;
    return runner.byKey.get(siteProcessKey({ instanceKey: environment.instanceKey, mode: "dev" })) ?? null;
  }, [environment, runner.byKey]);

  const extraOrigins = useMemo(() => {
    const origins: string[] = [];
    if (environment?.siteOrigin) origins.push(environment.siteOrigin);
    if (storefront?.url) origins.push(storefront.url);
    return origins;
  }, [environment?.siteOrigin, storefront?.url]);

  /** Mirror the publishable key onto the environment record + restart a running storefront. */
  const propagatePublishableKey = useCallback(
    async (publishableKey: string) => {
      if (!environment || !controlClient) return;
      try {
        await controlClient.mutation(controlApi.websiteInstances.update, {
          instanceId: environment.instanceId as never,
          clerkPublishableKey: publishableKey,
        });
      } catch (cause) {
        toast.warning(`Environment record not updated: ${errorText(cause)}`);
      }
      if (storefront && (storefront.status === "running" || storefront.status === "starting")) {
        try {
          await runner.restart({ ...targetForEnvironment(environment, website), clerkPublishableKey: publishableKey });
          toast.success("Local storefront restarted with the new publishable key.");
        } catch (cause) {
          toast.warning(`Storefront restart failed: ${errorText(cause)}`);
        }
      }
    },
    [controlClient, environment, runner, storefront, website],
  );

  const afterConnect = useCallback(
    async (result: { publishableKey: string; warnings: string[]; jwtTemplate: { created: boolean; updated: boolean } }) => {
      setWarnings(result.warnings ?? []);
      setShowConnectForm(false);
      setSecretKey("");
      setPublishableKeyHint("");
      toast.success(
        result.jwtTemplate?.created
          ? "Clerk connected. Created the Convex token template."
          : "Clerk connected.",
      );
      await propagatePublishableKey(result.publishableKey);
    },
    [propagatePublishableKey],
  );

  const onConnect = async () => {
    setBusy("connect");
    try {
      const result = await connectWithSecretKey({
        secretKey: secretKey.trim(),
        ...(publishableKeyHint.trim() ? { publishableKey: publishableKeyHint.trim() } : {}),
        extraOrigins,
      });
      await afterConnect(result);
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const onKeyless = async () => {
    setBusy("keyless");
    try {
      const result = await startKeyless({ extraOrigins });
      await afterConnect(result);
      toast.info("Temporary Clerk app created. Claim it into your Clerk account when you are ready.");
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const onVerify = async () => {
    setBusy("verify");
    try {
      const result = await verify({});
      toast[result.readiness.loginReady ? "success" : "warning"](
        result.readiness.complete
          ? "Everything checks out."
          : result.readiness.loginReady
            ? "Customers can sign in. Some optional items still need attention."
            : "Sign-in is not ready yet. See the ledger below.",
      );
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const onSync = async () => {
    setBusy("sync");
    try {
      const result = await syncCapabilities({});
      toast[result.synced ? "success" : "warning"](
        result.synced ? "Sign-in options synced from Clerk." : "Clerk did not return its settings yet.",
      );
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const onPortal = async () => {
    setBusy("portal");
    try {
      const { url } = await webhookPortalUrl({});
      if (bridge?.siteRunner) await bridge.siteRunner.openUrl(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const onProbe = async () => {
    setBusy("probe");
    setProbeResult(null);
    try {
      const result = await runTokenProbe({});
      setProbeResult(result);
    } catch (cause) {
      setProbeResult({ ok: false, detail: errorText(cause) });
    } finally {
      setBusy(null);
    }
  };

  const onSaveWebhookSecret = async () => {
    if (webhookSecretDraft === null) return;
    try {
      await saveWebhookSecret({ webhookSecret: webhookSecretDraft });
      setWebhookSecretDraft(null);
      toast.success(webhookSecretDraft ? "Webhook signing secret saved." : "Webhook signing secret removed.");
    } catch (cause) {
      toast.error(errorText(cause));
    }
  };

  const onDisconnect = async () => {
    if (!window.confirm("Disconnect Clerk from this site? Customers will not be able to sign in until you connect again.")) return;
    setBusy("disconnect");
    try {
      await disconnect({});
      setWarnings([]);
      toast.success("Clerk disconnected.");
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  // ── Apply to deployment ──────────────────────────────────────────────────

  const canApplyFromDesktop = Boolean(bridge?.siteDeploy);
  const connectionIdRef = useRef<string | null>(null);

  const resolveFleetConnectionId = useCallback(async (): Promise<string | null> => {
    if (!controlClient || !website || !environment) return null;
    if (connectionIdRef.current) return connectionIdRef.current;
    const rows = (await controlClient.query(controlApi.connections.queries.listForWebsite, {
      websiteId: website.websiteId as never,
    })) as Array<{ instanceId: string; connections: Array<{ connectionId: string; isActive: boolean; status: string }> }>;
    const row = rows.find((entry) => String(entry.instanceId) === String(environment.instanceId));
    const active = row?.connections.find((connection) => connection.isActive && connection.status !== "revoked");
    connectionIdRef.current = active ? String(active.connectionId) : null;
    return connectionIdRef.current;
  }, [controlClient, environment, website]);

  const onApply = async () => {
    if (!status || !envChanges || envChanges.length === 0) return;
    setBusy("apply");
    setDeployLog([]);
    setDeployPhase("environment");
    const label = website && environment ? `${website.title} — ${environment.label ?? environment.kind}` : "This site";
    try {
      if (!bridge?.siteDeploy) throw new Error("Applying to the deployment needs the ConvexPress desktop app.");
      let credential:
        | { kind: "control-plane"; connectionId: string; authToken: string }
        | { kind: "bundled"; convexUrl: string }
        | { kind: "prompt"; deploymentOrigin: string };
      if (shell && controlClient && environment) {
        const connectionId = await resolveFleetConnectionId();
        if (!connectionId) throw new Error("This environment has no active connection. Connect it in Sites first.");
        // The desktop main process fetches the sealed key itself; it never
        // passes through this page.
        const authToken = await shell.getControlToken();
        if (!authToken) throw new Error("Your protected operator session must be refreshed before deploying.");
        credential = { kind: "control-plane", connectionId, authToken };
      } else {
        const bundled = await bridge.siteDeploy.bundledCredential();
        const origin = status.deployment.origin?.replace(/\/+$/, "") ?? "";
        if (bundled.available && (!origin || bundled.convexUrl.replace(/\/+$/, "") === origin)) {
          credential = { kind: "bundled", convexUrl: bundled.convexUrl };
        } else {
          // Single-site install without a bundled key: ask for the deploy key
          // once in the protected window (it is never handed to this page).
          if (!origin) throw new Error("This site does not report its deployment address yet.");
          credential = { kind: "prompt", deploymentOrigin: origin };
        }
      }
      const result = await bridge.siteDeploy.run({ label: `Clerk connection · ${label}`, credential, envChanges });
      if (result.cancelled) {
        setDeployPhase(null);
        return;
      }
      if (!result.ok) throw new Error(result.error ?? "Deploy failed.");
      toast.success("Deployment updated. Verifying…");
      await verify({});
    } catch (cause) {
      setDeployPhase("failed");
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const onApplyEnvOnlyViaControlPlane = async () => {
    if (!envChanges || envChanges.length === 0) return;
    setBusy("apply");
    try {
      const connectionId = await resolveFleetConnectionId();
      if (!connectionId || !controlClient) throw new Error("This environment has no active connection. Connect it in Sites first.");
      await controlClient.action(controlApi.connections.siteAuth.applySiteEnvironment, {
        connectionId: connectionId as never,
        changes: envChanges,
      });
      toast.success("Environment variables written. Redeploy the site backend to activate the issuer.");
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (status === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const headerStatus: IntegrationStatus = !status.connected
    ? "not_configured"
    : status.readiness.loginReady
      ? "connected"
      : "degraded";

  const showForm = !status.connected || showConnectForm;
  const capabilities = status.capabilities;

  return (
    <div className="w-full space-y-6 p-6">
      <IntegrationHeader
        name="Clerk connection"
        description="Customer sign-up and sign-in for the website. One credential in; publishable key, issuer, token template, origins, webhook app and sign-in options are set up for you."
        status={headerStatus}
        lastVerifiedAt={status.lastVerifiedAt}
        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
        actions={
          status.connected ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onVerify} disabled={busy !== null}>
                {busy === "verify" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Verify now
              </Button>
              {status.dashboardUrl && (
                <Button type="button" variant="ghost" onClick={() => openExternal(status.dashboardUrl)}>
                  Clerk dashboard <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm">
          <p className="mb-1 font-medium">Connected with notes</p>
          <ul className="list-disc space-y-1 pl-5 text-ink-2">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SettingsSection
            title={status.connected ? "Connect a different Clerk app" : "Connect an existing Clerk app"}
            description="Paste the secret key from Clerk Dashboard → Configure → API keys. The publishable key, Frontend API, Convex token template, origins and webhook app are derived and configured automatically."
          >
            <div className="grid gap-2">
              <Label htmlFor="clerk-secret-key">Secret key</Label>
              <Input
                id="clerk-secret-key"
                type="password"
                autoComplete="off"
                value={secretKey}
                onChange={(event) => setSecretKey(event.target.value)}
                placeholder="sk_test_… or sk_live_…"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="clerk-publishable-hint">
                Publishable key <span className="font-normal text-muted-foreground">(optional, only if Clerk reports several domains)</span>
              </Label>
              <Input
                id="clerk-publishable-hint"
                autoComplete="off"
                value={publishableKeyHint}
                onChange={(event) => setPublishableKeyHint(event.target.value)}
                placeholder="pk_test_… or pk_live_…"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={onConnect} disabled={busy !== null || !/^sk_(test|live)_/.test(secretKey.trim())}>
                {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Connect
              </Button>
              {status.connected && (
                <Button type="button" variant="ghost" onClick={() => setShowConnectForm(false)} disabled={busy !== null}>
                  Cancel
                </Button>
              )}
            </div>
          </SettingsSection>

          {!status.connected && (
            <SettingsSection
              title="Start without a Clerk account"
              description="Creates a temporary development Clerk app for this site right now. Sign-in works immediately; claim the app into your Clerk account whenever you like (one click, from this page)."
            >
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                <li>Development instance only. Claim it, then create a production instance before launch.</li>
                <li>Unclaimed apps are temporary; claim before relying on it.</li>
              </ul>
              <Button type="button" variant="secondary" onClick={onKeyless} disabled={busy !== null}>
                {busy === "keyless" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Create a keyless Clerk app
              </Button>
            </SettingsSection>
          )}
        </div>
      )}

      {status.connected && (
        <>
          {/* Overview */}
          <SettingsSection
            title="Connected application"
            description={
              status.mode === "keyless"
                ? "Temporary keyless Clerk app owned by nobody yet."
                : "Details derived from the secret key. The publishable key is what the website loads."
            }
            actions={
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowConnectForm(true)} disabled={busy !== null}>
                  Use a different key
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onDisconnect} disabled={busy !== null}>
                  Disconnect
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{status.environmentType === "production" ? "Production instance" : "Development instance"}</Badge>
              <Badge variant="outline">
                {status.mode === "keyless" ? "Keyless" : status.mode === "secret_key" ? "Connected with secret key" : "Manual"}
              </Badge>
              {status.connectedAt && <span className="text-xs text-muted-foreground">connected {when(status.connectedAt)}</span>}
              {capabilities?.applicationName && <span className="text-xs text-muted-foreground">· {capabilities.applicationName}</span>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {status.publishableKey && <CopyValue label="Publishable key" value={status.publishableKey} />}
              {status.frontendApi && <CopyValue label="Frontend API / JWT issuer" value={status.frontendApi} />}
              {status.instanceId && <CopyValue label="Instance" value={status.instanceId} />}
              {status.siteOrigins.length > 0 && (
                <CopyValue label="Site origins registered" value={status.siteOrigins.join(", ")} mono={false} />
              )}
            </div>

            {status.mode === "keyless" && !status.claimedAt && (
              <div className="rounded-2xl border border-primary/30 bg-primary-soft/40 p-4">
                <p className="text-sm font-medium">Claim this app into your Clerk account</p>
                <p className="mt-1 text-sm text-ink-2">
                  Opens Clerk. Sign in (or create an account) and the app moves into your workspace with all settings intact. Then come back and press "I claimed it".
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => openExternal(status.claimUrl)}>
                    Claim in Clerk <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await markClaimed({});
                        toast.success("Marked as claimed.");
                      } catch (cause) {
                        toast.error(errorText(cause));
                      }
                    }}
                  >
                    I claimed it
                  </Button>
                </div>
              </div>
            )}
          </SettingsSection>

          {/* Readiness ledger */}
          <SettingsSection
            title="Readiness"
            description={
              status.readiness.complete
                ? "Everything is in place."
                : status.readiness.loginReady
                  ? "Customers can sign in. Items marked with a warning are optional or informational."
                  : "Customers cannot sign in yet. Fix the failing items in order."
            }
          >
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {status.readiness.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5">
                    <StateIcon state={item.state} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="break-words text-xs text-muted-foreground">{item.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SettingsSection>

          {/* Deployment */}
          <SettingsSection
            title="Site deployment"
            description="The site's Convex backend only trusts customer tokens from the issuer in its own environment variables, and that list is read when the backend is deployed."
            actions={
              status.deployment.issuerMatches ? (
                <Pill tone="ok">In sync</Pill>
              ) : (
                <Pill tone="fail">Needs apply</Pill>
              )
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1 text-sm">
                <span className="eyebrow text-[11px] text-muted-foreground">Deployment</span>
                <code className="truncate rounded-md bg-surface-2 px-2 py-1 text-xs">{status.deployment.origin ?? "unknown"}</code>
              </div>
              <div className="grid gap-1 text-sm">
                <span className="eyebrow text-[11px] text-muted-foreground">Issuer live on deployment</span>
                <code className="truncate rounded-md bg-surface-2 px-2 py-1 text-xs">{status.deployment.issuer ?? "not set"}</code>
              </div>
            </div>

            {!status.deployment.issuerMatches && (
              <div className="space-y-3">
                {canApplyFromDesktop ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={onApply} disabled={busy !== null || !envChanges?.length}>
                      {busy === "apply" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                      Apply to deployment and redeploy
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Sets {envChanges?.map((change) => change.name).join(", ")} and pushes the backend. About a minute.
                    </span>
                  </div>
                ) : shell && controlClient ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="outline" onClick={onApplyEnvOnlyViaControlPlane} disabled={busy !== null || !envChanges?.length}>
                        {busy === "apply" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                        Write environment variables
                      </Button>
                      <span className="text-xs text-muted-foreground">Then redeploy from the desktop app or the command below.</span>
                    </div>
                    <ManualCommands status={status} />
                  </div>
                ) : (
                  <ManualCommands status={status} />
                )}
              </div>
            )}
            {deployLog.length > 0 && (
                  <div className="rounded-2xl border border-border bg-surface-2 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                      {deployPhase === "complete" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : deployPhase === "failed" ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {deployPhase === "complete" ? "Done" : deployPhase === "failed" ? "Failed" : `Working: ${deployPhase}`}
                    </div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
                      {deployLog.map((entry) => `${entry.phase.padEnd(12)} ${entry.message}`).join("\n")}
                    </pre>
                  </div>
                )}
          </SettingsSection>

          {/* Webhook */}
          <SettingsSection
            title="Profile sync webhook"
            description="Optional. Accounts are created the moment a customer first signs in; the webhook additionally keeps names, emails and photos in sync when they change in Clerk, and deactivates deleted users."
            actions={
              status.webhook.secretStored ? (
                <Pill tone={status.webhook.lastReceivedAt ? "ok" : "warn"}>
                  {status.webhook.lastReceivedAt ? `Last event ${when(status.webhook.lastReceivedAt)}` : "Waiting for first event"}
                </Pill>
              ) : (
                <Pill tone="muted">Not configured</Pill>
              )
            }
          >
            {status.webhook.url && (
              <WebhookEndpointField
                id="clerk-webhook-url"
                label="Endpoint URL"
                url={status.webhook.url}
                help="This site's Convex HTTP-actions address. Subscribe to user.created, user.updated, user.deleted."
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={onPortal} disabled={busy !== null}>
                {busy === "portal" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                Open Clerk webhook portal
              </Button>
              <span className="text-xs text-muted-foreground">Add the endpoint above there, then paste its signing secret here.</span>
            </div>
            <CredentialField
              id="clerk-webhook-secret"
              label="Signing secret"
              value={webhookSecretDraft ?? (status.webhook.secretStored ? "__set__" : "")}
              onChange={(next) => setWebhookSecretDraft(next)}
              placeholder="whsec_…"
              allowClear
            />
            {webhookSecretDraft !== null && (
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={onSaveWebhookSecret}>
                  Save signing secret
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setWebhookSecretDraft(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </SettingsSection>

          {/* Sign-in options */}
          <SettingsSection
            title="Sign-in options the website follows"
            description="Read from Clerk's own configuration. The storefront's login and registration forms adapt to these, so whatever you enable in Clerk keeps working."
            actions={
              <Button type="button" variant="outline" size="sm" onClick={onSync} disabled={busy !== null}>
                {busy === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync from Clerk
              </Button>
            }
          >
            {capabilities ? (
              <CapabilitiesSummary capabilities={capabilities} syncedAt={status.capabilitiesSyncedAt} />
            ) : (
              <p className="text-sm text-muted-foreground">Not synced yet. The website uses email + password defaults until then.</p>
            )}
          </SettingsSection>

          {/* Token probe */}
          {status.environmentType !== "production" && (
            <SettingsSection
              title="Sign-in probe"
              description="Mints a real session token from Clerk for a probe user and verifies it exactly like this deployment does (issuer, audience, email claim). Development instances only."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={onProbe} disabled={busy !== null}>
                  {busy === "probe" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Run sign-in probe
                </Button>
                {probeResult && (
                  <span className={cn("text-sm", probeResult.ok ? "text-success" : "text-destructive")}>{probeResult.detail}</span>
                )}
              </div>
            </SettingsSection>
          )}
        </>
      )}
    </div>
  );
}

function ManualCommands({ status }: { status: Status }) {
  const target = status.deployment.origin ?? "<deployment-url>";
  const lines = [
    ...status.deployment.requiredEnv.map((entry) =>
      entry.value
        ? `bunx convex env set ${entry.name} ${entry.value} --url ${target} --admin-key <admin-key>`
        : `bunx convex env set ${entry.name} <value from Clerk> --url ${target} --admin-key <admin-key>`,
    ),
    `bunx convex deploy --url ${target} --admin-key <admin-key>`,
  ];
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Run from <code>ConvexPress-Admin/packages/backend</code>. Cloud deployments: omit <code>--url/--admin-key</code> and use the deploy key instead.
      </p>
      <pre className="overflow-x-auto rounded-2xl border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">
        {lines.join("\n")}
      </pre>
    </div>
  );
}

function CapabilitiesSummary({ capabilities, syncedAt }: { capabilities: Capabilities; syncedAt: number | null }) {
  const attribute = (label: string, value: AttributeCapability) => (
    <li key={label} className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {value.verifications.length > 0 && (
          <span className="text-xs text-muted-foreground">verify by {value.verifications.join(" or ").replace(/_/g, " ")}</span>
        )}
        <Pill tone={!value.enabled ? "muted" : value.required ? "ok" : "warn"}>
          {!value.enabled ? "off" : value.required ? "required" : "optional"}
        </Pill>
      </span>
    </li>
  );
  const social = capabilities.social.map((provider) => provider.replace(/^oauth_/, "")).join(", ");
  const passwordRules: string[] = [];
  if (capabilities.password.minLength) passwordRules.push(`min ${capabilities.password.minLength} chars`);
  if (capabilities.password.requireNumbers) passwordRules.push("number");
  if (capabilities.password.requireUppercase) passwordRules.push("uppercase");
  if (capabilities.password.requireLowercase) passwordRules.push("lowercase");
  if (capabilities.password.requireSpecialChar) passwordRules.push("special character");

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="eyebrow mb-1 text-[11px] text-muted-foreground">Sign-up fields</p>
        <ul className="divide-y divide-border">
          {attribute("Email address", capabilities.attributes.emailAddress)}
          {attribute("Phone number", capabilities.attributes.phoneNumber)}
          {attribute("Username", capabilities.attributes.username)}
          {attribute("First name", capabilities.attributes.firstName)}
          {attribute("Last name", capabilities.attributes.lastName)}
          {attribute("Password", capabilities.attributes.password)}
        </ul>
      </div>
      <div className="space-y-4 text-sm">
        <div>
          <p className="eyebrow mb-1 text-[11px] text-muted-foreground">Social sign-in</p>
          <p>{social || "None enabled"}</p>
        </div>
        <div>
          <p className="eyebrow mb-1 text-[11px] text-muted-foreground">Sign-up</p>
          <p>
            Mode: {capabilities.signUp.mode}
            {capabilities.signUp.captchaEnabled ? " · bot protection on" : ""}
            {capabilities.signUp.legalConsentEnabled ? " · legal consent required" : ""}
          </p>
        </div>
        <div>
          <p className="eyebrow mb-1 text-[11px] text-muted-foreground">Sign-in</p>
          <p>
            Preferred: {capabilities.signIn.preferredStrategy === "otp" ? "email code" : "password"}
            {capabilities.signIn.secondFactorRequired ? " · second factor required" : ""}
            {capabilities.signIn.secondFactors.length ? ` · MFA: ${capabilities.signIn.secondFactors.join(", ").replace(/_/g, " ")}` : ""}
            {capabilities.passkeys.enabled ? " · passkeys" : ""}
          </p>
        </div>
        <div>
          <p className="eyebrow mb-1 text-[11px] text-muted-foreground">Password rules</p>
          <p>{passwordRules.length ? passwordRules.join(", ") : "Clerk defaults"}</p>
        </div>
        <p className="text-xs text-muted-foreground">Synced {when(syncedAt)}.</p>
      </div>
    </div>
  );
}
