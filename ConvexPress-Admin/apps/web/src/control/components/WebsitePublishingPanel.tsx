import { WebsitePublishingBoundary } from "./WebsitePublishingBoundary";
import { useEffect, useId, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useControlShell } from "../ControlShellContext";
import { getElectronBridge } from "@/lib/electron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Props = { organizationId: string; businessId: string; websiteId: string; instanceId: string; kind: string; siteOrigin: string };
export function WebsitePublishingPanel(props: Props) {
  return <WebsitePublishingBoundary key={props.instanceId}><AuthorizedPublishingPanel {...props} /></WebsitePublishingBoundary>;
}
function AuthorizedPublishingPanel(props: Props) {
  const shell = useControlShell();
  const agency = !!shell && ["owner", "admin"].includes(shell.operator.role);
  const access = useQuery(api.rbac.queries.checkManyAccess, agency ? { checks: ["connection.manage", "site.deploy", ...(props.kind === "live" ? ["environment.live.operate"] : [])].map(code => ({ selectorType: "capability" as const, code, organizationId: props.organizationId, businessId: props.businessId, websiteId: props.websiteId, instanceId: props.instanceId })) } : "skip");
  return agency && access?.every(result => result.allowed) ? <PublishingForm key={props.instanceId} {...props} /> : null;
}
function PublishingForm(props: Props) {
  const [provider, setProvider] = useState<"cloudflare" | "vercel">(() => props.siteOrigin.endsWith(".vercel.app") ? "vercel" : "cloudflare");
  const [busy, setBusy] = useState(false);
  const id = useId();
  return <div>
    <label className="flex items-center gap-3 px-[18px] py-3 text-xs" htmlFor={`${id}-provider`}>Website host
      <select id={`${id}-provider`} value={provider} disabled={busy} onChange={event => setProvider(event.target.value as "cloudflare" | "vercel")} className="h-9 rounded-md border border-input bg-background px-2">
        <option value="cloudflare">Cloudflare</option><option value="vercel">Vercel</option>
      </select>
    </label>
    {provider === "vercel" ? <VercelPublishingForm {...props} onBusy={setBusy} /> : <CloudflarePublishingForm {...props} onBusy={setBusy} />}
  </div>;
}
function CloudflarePublishingForm(props: Props & { onBusy(value: boolean): void }) {
  const shell = useControlShell();
  const id = useId();
  const bridge = getElectronBridge()?.websitePublish;
  const supportedOrigin = /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(props.siteOrigin);
  const accounts = useQuery(api.hosting.accounts.list, { organizationId: props.organizationId as Id<"overseer_organizations">, businessId: props.businessId as Id<"overseer_businesses"> });
  const state = useQuery(api.hosting.websiteReleases.status, supportedOrigin ? { instanceId: props.instanceId as Id<"overseer_websiteInstances"> } : "skip");
  const available = accounts?.filter(account => account.provider === "cloudflare" && account.status === "active") ?? [];
  const [selected, setSelected] = useState("");
  const accountId = state?.binding?.accountId ?? (selected || available[0]?.accountId || "");
  const initialName = (() => { try { return new URL(props.siteOrigin).hostname.endsWith(".workers.dev") ? new URL(props.siteOrigin).hostname.split(".")[0] : ""; } catch { return ""; } })();
  const [worker, setWorker] = useState(initialName), [clerk, setClerk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => props.onBusy(busy), [busy, props.onBusy]);
  const workerName = state?.binding?.workerName ?? worker;
  const [, refreshLease] = useState(0);
  useEffect(() => {
    const until = state?.latest?.leaseUntil;
    if (!until || until <= Date.now()) return;
    const timer = setTimeout(() => refreshLease(value => value + 1), Math.min(until - Date.now() + 50, 120_050));
    return () => clearTimeout(timer);
  }, [state?.latest?.leaseUntil]);
  const active = !!state?.latest && ["intent", "uploading", "uncertain"].includes(state.latest.state) && state.latest.leaseUntil > Date.now();
  useEffect(() => bridge?.onProgress(event => { if (event.instanceId === props.instanceId) setMessage(event.message); }), [bridge, props.instanceId]);
  async function publish() {
    if (!bridge || !shell) return;
    setBusy(true); setError("");
    try {
      const authToken = await shell.getControlToken();
      if (!authToken) throw Error("Refresh your protected operator session before publishing.");
      await bridge.run({ instanceId: props.instanceId, accountId, workerName, authToken, clerkPublishableKey: clerk ?? state?.latest?.clerkPublishableKey ?? "", confirmLive: confirmed });
      setMessage("Website published."); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Website publication was not confirmed."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Website publishing" className="space-y-3 border-t border-border px-[18px] py-4">
    <h3 className="text-sm font-semibold">Publish website</h3>
    <p className="text-xs text-muted-foreground">Publish the bundled storefront to this environment’s Cloudflare Worker. Content comes from its registered database.</p>
    {!supportedOrigin ? <p className="text-sm text-muted-foreground">Configure this environment’s workers.dev address to use desktop publishing. Custom-domain publishing is not available yet.</p> : !bridge ? <p className="text-sm text-muted-foreground">Open ConvexPress Desktop to publish this website.</p> : !available.length ? <p className="text-sm text-muted-foreground">Connect a Cloudflare account for this business or organization first.</p> : <>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs" htmlFor={`${id}-account`}>Cloudflare account<select id={`${id}-account`} value={accountId} disabled={busy || !!state?.binding} onChange={event => setSelected(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2">{available.map(account => <option key={account.accountId} value={account.accountId}>{account.label}</option>)}</select></label>
        <label className="grid gap-1 text-xs" htmlFor={`${id}-worker`}>Worker name<Input id={`${id}-worker`} value={workerName} disabled={busy || !!state?.binding} onChange={event => setWorker(event.target.value)} /></label>
      </div>
      <label className="grid gap-1 text-xs" htmlFor={`${id}-clerk`}>Clerk publishable key (optional)<Input id={`${id}-clerk`} value={clerk ?? state?.latest?.clerkPublishableKey ?? ""} disabled={busy} autoComplete="off" placeholder="pk_live_… or pk_test_…" onChange={event => setClerk(event.target.value)} /></label>
      <p className="text-xs text-muted-foreground">Target: {props.siteOrigin}</p>
      {props.kind === "live" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Publish these changes to the live website</label>}
      <div className="flex gap-2"><Button onClick={publish} disabled={busy || active || !state || !available.some(a => a.accountId === accountId) || !workerName || (props.kind === "live" && !confirmed)}>{busy ? "Publishing…" : state?.latest && ["intent", "uploading", "uncertain"].includes(state.latest.state) ? "Reconcile and publish" : "Publish website"}</Button>{busy && <Button variant="outline" onClick={() => void bridge.cancel(props.instanceId)}>Cancel</Button>}</div>
    </>}
    {state?.latest && <p className="text-xs text-muted-foreground">Release: {state.latest.state} · {state.latest.phase} · {state.latest.artifactHash.slice(0, 12)}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}

function VercelPublishingForm(props: Props & { onBusy(value: boolean): void }) {
  const shell = useControlShell(), id = useId(), bridge = getElectronBridge()?.websitePublish;
  const supported = (() => { try { const url = new URL(props.siteOrigin); return url.protocol === "https:" && url.origin === props.siteOrigin && !url.hostname.endsWith(".workers.dev"); } catch { return false; } })();
  const accounts = useQuery(api.hosting.accounts.list, { organizationId: props.organizationId as Id<"overseer_organizations">, businessId: props.businessId as Id<"overseer_businesses"> });
  const state = useQuery(api.hosting.vercelReleases.status, supported ? { instanceId: props.instanceId as Id<"overseer_websiteInstances"> } : "skip");
  const available = accounts?.filter(account => account.provider === "vercel" && account.status === "active") ?? [];
  const [selected, setSelected] = useState("");
  const [project, setProject] = useState(() => {
    try { const host = new URL(props.siteOrigin).hostname; return host.replace(/\.vercel\.app$/, "").replace(/[^a-z0-9-]/g, "-").slice(0, 100); }
    catch { return ""; }
  });
  const [clerk, setClerk] = useState<string | null>(null), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [, refreshLease] = useState(0);
  useEffect(() => props.onBusy(busy), [busy, props.onBusy]);
  useEffect(() => bridge?.onProgress(event => { if (event.instanceId === props.instanceId) setMessage(event.message); }), [bridge, props.instanceId]);
  useEffect(() => {
    const until = state?.latest?.leaseUntil;
    if (!until || until <= Date.now()) return;
    const timer = setTimeout(() => refreshLease(value => value + 1), Math.min(until - Date.now() + 50, 120_050));
    return () => clearTimeout(timer);
  }, [state?.latest?.leaseUntil]);
  const accountId = state?.binding?.accountId ?? (selected || available[0]?.accountId || ""), projectName = state?.binding?.projectName ?? project;
  const active = !!state?.latest && ["active", "pending"].includes(state.latest.state) && state.latest.leaseUntil > Date.now();
  async function publish() {
    if (!bridge || !shell) return;
    setBusy(true); setError("");
    try {
      const authToken = await shell.getControlToken();
      if (!authToken) throw Error("Refresh your protected operator session before publishing.");
      await bridge.run({ provider: "vercel", instanceId: props.instanceId, accountId, projectName, authToken, clerkPublishableKey: clerk ?? state?.latest?.clerkPublishableKey ?? "", confirmLive: confirmed,
        ...(state?.latest && ["active", "pending"].includes(state.latest.state) ? { resumeReleaseId: state.latest.releaseId } : {}) });
      setMessage("Website published and public pages verified."); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Vercel publication was not confirmed."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Vercel website publishing" className="space-y-3 border-t border-border px-[18px] py-4">
    <h3 className="text-sm font-semibold">Publish website</h3>
    <p className="text-xs text-muted-foreground">Publish to a dedicated Vercel project for this environment. Content comes from its registered database.</p>
    {!supported ? <p className="text-sm text-muted-foreground">Configure this environment’s Vercel address or custom domain first.</p> : !bridge ? <p className="text-sm text-muted-foreground">Open ConvexPress Desktop to publish this website.</p> : !available.length ? <p className="text-sm text-muted-foreground">Connect a Vercel account for this business or organization first.</p> : <>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs" htmlFor={`${id}-account`}>Vercel account<select id={`${id}-account`} value={accountId} disabled={busy || !!state?.binding} onChange={event => setSelected(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2">{available.map(account => <option key={account.accountId} value={account.accountId}>{account.label}</option>)}</select></label>
        <label className="grid gap-1 text-xs" htmlFor={`${id}-project`}>Project name<Input id={`${id}-project`} value={projectName} disabled={busy || !!state?.binding} onChange={event => setProject(event.target.value)} /></label>
      </div>
      <label className="grid gap-1 text-xs" htmlFor={`${id}-clerk`}>Clerk publishable key (optional)<Input id={`${id}-clerk`} value={clerk ?? state?.latest?.clerkPublishableKey ?? ""} disabled={busy} autoComplete="off" placeholder="pk_live_… or pk_test_…" onChange={event => setClerk(event.target.value)} /></label>
      <p className="text-xs text-muted-foreground">Target: {props.siteOrigin}</p>
      {props.kind === "live" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Publish these changes to the live website</label>}
      <div className="flex gap-2"><Button onClick={publish} disabled={busy || active || !state || !available.some(account => account.accountId === accountId) || !projectName || (props.kind === "live" && !confirmed)}>{busy ? "Publishing…" : state?.latest && ["active", "pending"].includes(state.latest.state) ? "Resume publishing" : "Publish website"}</Button>{busy && <Button variant="outline" onClick={() => void bridge.cancel(props.instanceId)}>Cancel</Button>}</div>
    </>}
    {state?.latest && <p className="text-xs text-muted-foreground">Release: {state.latest.state} · {state.latest.phase} · {state.latest.artifactHash.slice(0, 12)}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
