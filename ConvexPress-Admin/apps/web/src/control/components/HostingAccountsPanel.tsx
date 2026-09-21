import { useControlAccessChecks } from "../ControlAccessProvider";
import { api } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getElectronBridge } from "@/lib/electron";
import { useControlShell } from "../ControlShellContext";
type Scope = { organizationId: string; businessId?: string };
type Provider = "convex" | "cloudflare" | "vercel";
export function HostingAccountsPanel(props: Scope) {
  const shell = useControlShell();
  const agency = !!shell && ["owner", "admin"].includes(shell.operator.role);
  const access = useControlAccessChecks(agency
      ? { checks: [{ selectorType: "capability", code: "connection.manage", ...props }] }
      : "skip",
  );
  return agency && access?.[0]?.allowed ? <Accounts {...props} /> : null;
}
function Accounts(scope: Scope) {
  const fieldId = useId();
  const shell = useControlShell();
  const bridge = getElectronBridge()?.hosting;
  const [method, setMethod] = useState<"oauth" | "api">("oauth");
  const [tokenKind, setTokenKind] = useState<"user" | "account">("user");
  const typed = {
    organizationId: scope.organizationId as Id<"overseer_organizations">,
    businessId: scope.businessId as Id<"overseer_businesses"> | undefined,
  };
  const accounts = useQuery(api.hosting.accounts.list, typed);
  const connect = useAction(api.hosting.actions.connect);
  const revoke = useMutation(api.hosting.accounts.revoke);
  const refresh = useAction(api.hosting.cloudflareOAuth.refresh);
  const [provider, setProvider] = useState<Provider>("convex");
  const [externalAccountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = accounts?.find((a) => a.accountId === editing);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const credential = token;
    setToken("");
    try {
      if (provider === "cloudflare" && method === "oauth") {
        if (!bridge || !shell) throw Error("Open the desktop app to connect with Cloudflare, or choose an API token.");
        const authToken = await shell.getControlToken();
        if (!authToken) throw Error("Refresh your operator session before connecting Cloudflare.");
        await bridge.connectCloudflareOAuth({ ...typed, ...(current ? { organizationId: current.organizationId, businessId: current.businessId ?? undefined } : {}), externalAccountId: externalAccountId.trim(), expectedRevision: current?.revision ?? 0, authToken });
      } else await connect({
        ...typed,
        ...(current
          ? { organizationId: current.organizationId, businessId: current.businessId ?? undefined }
          : {}),
        provider,
        externalAccountId: externalAccountId.trim(),
        token: credential,
        expectedRevision: current?.revision ?? 0,
        ...(provider === "cloudflare" ? { cloudflareTokenKind: tokenKind } : {}),
      });
      setOpen(false);
      setEditing(null);
      setAccountId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect hosting account");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Hosting accounts"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Hosting accounts</h2>
          <p className="text-sm text-muted-foreground">
            Verified provider access for{" "}
            {scope.businessId ? "this business" : "this organization and its businesses"}.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setAccountId("");
            setToken("");
            setError(null);
            setOpen(true);
          }}
        >
          Connect account
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {accounts?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Connect Convex for separate site databases, and Cloudflare or Vercel for website hosting.
        </p>
      )}
      {accounts?.map((a) => (
        <div
          key={a.accountId}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
        >
          <div>
            <p className="text-sm font-medium">
              {a.label}{" "}
              <span className="font-normal text-muted-foreground">
                · {a.provider} · {a.status}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {a.externalAccountId}
              {scope.businessId && !a.businessId ? " · Shared by organization" : ""}
              {a.provider === "cloudflare" && <span className="block">
                {a.credentialKind === "oauth" ? "Connected with Cloudflare · automatic renewal" : a.credentialKind === "api_token" ? "API token" : "Existing token · reconnect to enable durable access"}
                {a.credentialState === "reconnect" ? " · Reconnect required" : a.credentialState === "refreshing" ? " · Renewal in progress" : ""}
                {typeof a.credentialExpiresAt === "number" && ` · Token expires ${new Date(a.credentialExpiresAt).toLocaleString()}`}
              </span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setProvider(a.provider);
                setAccountId(a.externalAccountId);
                setEditing(a.accountId);
                setToken("");
                setError(null);
                setOpen(true);
              }}
            >
              {a.status === "revoked" || (a.provider === "cloudflare" && a.credentialKind !== "api_token") ? "Reconnect" : "Replace token"}
            </Button>
            {a.provider === "cloudflare" && a.status === "active" && a.credentialKind === "oauth" && a.credentialState !== "reconnect" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                setBusy(true); setError(null);
                try { await refresh({ accountId: a.accountId }); }
                catch (cause) { setError(cause instanceof Error ? cause.message : "Cloudflare renewal failed; reconnect this account"); }
                finally { setBusy(false); }
              }}>Check access</Button>
            )}
            {a.status === "active" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await revoke({ accountId: a.accountId, expectedRevision: a.revision });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not revoke account");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Revoke access
              </Button>
            )}
          </div>
        </div>
      ))}
      {open && (
        <form onSubmit={save} className="grid gap-3 border-t border-border pt-3">
          <div className="grid gap-1 text-sm">
            <label htmlFor={`${fieldId}-provider`}>Provider</label>
            <select
              id={`${fieldId}-provider`}
              className="h-9 rounded-md border border-input bg-background px-3"
              value={provider}
              disabled={busy || !!editing}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <option value="convex">Convex</option>
              <option value="cloudflare">Cloudflare</option>
              <option value="vercel">Vercel</option>
            </select>
          </div>
          <div className="grid gap-1 text-sm">
            <label htmlFor={`${fieldId}-external-account`}>
              {provider === "convex"
                ? "Convex team ID"
                : provider === "cloudflare"
                  ? "Cloudflare account ID"
                  : "Vercel team or user ID"}
            </label>
            <Input
              id={`${fieldId}-external-account`}
              value={externalAccountId}
              required
              disabled={busy || !!editing}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </div>
          {provider === "cloudflare" && <div className="grid gap-1 text-sm">
            <label htmlFor={`${fieldId}-method`}>Connection method</label>
            <select id={`${fieldId}-method`} className="h-9 rounded-md border border-input bg-background px-3" disabled={busy} value={method} onChange={e => { setMethod(e.target.value as "oauth" | "api"); setToken(""); }}>
              <option value="oauth">Connect with Cloudflare</option><option value="api">API token</option>
            </select>
            {method === "oauth" && <p className="text-xs text-muted-foreground">Approve ConvexPress in your browser. The desktop app keeps this account connected with renewable credentials.</p>}
            {method === "api" && <><label htmlFor={`${fieldId}-token-kind`}>API token owner</label><select id={`${fieldId}-token-kind`} className="h-9 rounded-md border border-input bg-background px-3" disabled={busy} value={tokenKind} onChange={e => setTokenKind(e.target.value as "user" | "account")}><option value="user">User API token</option><option value="account">Account API token</option></select><p className="text-xs text-muted-foreground">Use a scoped API token with Workers Scripts Write access to this account. Browser and Wrangler access tokens expire and cannot be renewed here.</p></>}
          </div>}
          {(provider !== "cloudflare" || method === "api") && <div className="grid gap-1 text-sm">
            <label htmlFor={`${fieldId}-token`}>{provider === "cloudflare" ? "API token" : "Access token"}</label>
            <Input
              id={`${fieldId}-token`}
              type="password"
              autoComplete="off"
              value={token}
              required
              disabled={busy}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>}
          <p className="text-xs text-muted-foreground">
            The token is verified with the provider and encrypted in the control plane. It is never
            returned to this interface.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Connecting…" : provider === "cloudflare" && method === "oauth" ? "Connect with Cloudflare" : "Verify and connect"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (busy && provider === "cloudflare" && method === "oauth") void bridge?.cancelCloudflareOAuth();
                setToken("");
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
