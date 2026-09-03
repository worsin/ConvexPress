import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import type { AnyRouter } from "@tanstack/react-router";
import { RouterProvider } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, LogOut, PanelTop } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ControlAuthClient } from "./auth-client";
import {
  signInControlOperator,
  signOutControlOperator,
} from "./auth-client";
import { SiteRuntimeProvider } from "./SiteRuntimeProvider";
import { EnvironmentBar } from "./components/EnvironmentBar";
import {
  ScopeSwitcher,
  type ScopeSelection,
} from "./components/ScopeSwitcher";

export function StandaloneApp({
  authClient,
  router,
}: {
  authClient: ControlAuthClient;
  router: AnyRouter;
}) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <StartupState label="Restoring protected operator session" />;
  if (!session) return <OperatorLogin authClient={authClient} />;
  return <ControlPlaneShell authClient={authClient} router={router} />;
}

function ControlPlaneShell({
  authClient,
  router,
}: {
  authClient: ControlAuthClient;
  router: AnyRouter;
}) {
  const context = useQuery(controlApi.context.get, {});
  const operator = useQuery(controlApi.operators.current, {});
  const setActive = useMutation(controlApi.context.setActive);
  const exchange = useAction(controlApi.siteBroker.session.exchange);
  const [pendingSelection, setPendingSelection] = useState<ScopeSelection | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const switchGeneration = useRef(0);

  const serverSelection: ScopeSelection = context?.active ?? {
    organizationId: null,
    businessId: null,
    websiteId: null,
    instanceId: null,
  };
  const selection = pendingSelection ?? serverSelection;
  const selectedEnvironment =
    context?.environments.find(
      (entry) => String(entry.instanceId) === selection.instanceId,
    ) ?? null;
  const connections = useQuery(
    controlApi.connections.queries.listForInstance,
    selectedEnvironment
      ? { instanceId: selectedEnvironment.instanceId }
      : "skip",
  );
  const activeConnection = connections?.find(
    (connection) =>
      connection.status === "connected" &&
      connection.isActive &&
      connection.hasCredentials,
  );

  const siteRole = roleToSiteRole(operator?.role);
  const target = useMemo(() => {
    if (
      !selectedEnvironment ||
      !activeConnection ||
      selectedEnvironment.compatibility === "incompatible"
    ) {
      return null;
    }
    return {
      connectionId: String(activeConnection.connectionId),
      instanceKey: selectedEnvironment.instanceKey,
      deploymentOrigin: selectedEnvironment.deploymentOrigin,
      siteOrigin: selectedEnvironment.siteOrigin,
    };
  }, [activeConnection, selectedEnvironment]);

  const exchangeSession = useCallback(
    async (requestedTarget: NonNullable<typeof target>) => {
      const result = await exchange({
        connectionId: requestedTarget.connectionId as Id<"overseer_connections">,
        requestedCapabilities: ["health.read", "compatibility.read"],
        requestedSiteRole: siteRole,
      });
      if (result.instanceKey !== requestedTarget.instanceKey) {
        throw new Error("Selected site identity changed during session exchange");
      }
      return { token: result.token, expiresAt: result.expiresAt };
    },
    [exchange, siteRole],
  );

  const changeScope = useCallback(
    (next: ScopeSelection) => {
      const generation = ++switchGeneration.current;
      setScopeError(null);
      setPendingSelection(next);
      void setActive({
        organizationId: next.organizationId as Id<"overseer_organizations"> | null,
        businessId: next.businessId as Id<"overseer_businesses"> | null,
        websiteId: next.websiteId as Id<"overseer_websites"> | null,
        instanceId: next.instanceId as Id<"overseer_websiteInstances"> | null,
      })
        .then(() => {
          if (switchGeneration.current === generation) setPendingSelection(null);
        })
        .catch(() => {
          if (switchGeneration.current !== generation) return;
          setPendingSelection(null);
          setScopeError("The selected scope is no longer available to this operator.");
        });
    },
    [setActive],
  );

  const signOut = useCallback(async () => {
    await signOutControlOperator(authClient);
  }, [authClient]);

  if (!context || !operator) return <StartupState label="Loading authorized websites" />;

  const operatorIdentity = {
    id: String(operator.userId),
    email: operator.email ?? "operator@convexpress.local",
    displayName: operator.name ?? operator.email ?? "ConvexPress Operator",
  };

  return (
    <div className="min-h-svh bg-slate-100 text-slate-950">
      <header className="relative z-[10000] bg-[#101827] text-white shadow-lg">
        <div className="flex flex-col gap-3 px-3 pb-3 pt-8 lg:flex-row lg:items-center lg:pt-3">
          <div className="flex min-w-56 items-center gap-3 px-1">
            <span className="grid size-9 place-items-center bg-cyan-300 text-[#101827]">
              <PanelTop className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-serif text-lg leading-none">ConvexPress</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Multisite control
              </span>
            </span>
          </div>
          <ScopeSwitcher
            context={context}
            selection={selection}
            pending={pendingSelection !== null}
            onChange={changeScope}
          />
          <div className="flex items-center justify-between gap-3 px-1 lg:justify-end">
            <span className="max-w-44 truncate text-xs text-slate-300">
              {operatorIdentity.displayName}
            </span>
            <Button
              aria-label="Sign out of ConvexPress control plane"
              className="border border-white/20 bg-transparent text-white hover:bg-white/10"
              size="sm"
              onClick={() => void signOut()}
            >
              <LogOut className="mr-2 size-4" /> Sign out
            </Button>
          </div>
        </div>
        {scopeError ? (
          <p role="alert" className="bg-red-700 px-4 py-2 text-sm text-white">
            {scopeError}
          </p>
        ) : null}
      </header>
      <EnvironmentBar environment={selectedEnvironment} />
      {connections !== undefined && selectedEnvironment && !activeConnection ? (
        <p role="alert" className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
          This environment has no active management connection.
        </p>
      ) : null}
      <SiteRuntimeProvider
        target={target}
        exchangeSession={exchangeSession}
        operator={operatorIdentity}
        onSignOut={signOut}
      >
        <RouterProvider router={router} />
      </SiteRuntimeProvider>
    </div>
  );
}

function roleToSiteRole(role: string | undefined) {
  if (role === "viewer") return "subscriber" as const;
  if (role === "member") return "editor" as const;
  return "administrator" as const;
}

function StartupState({ label }: { label: string }) {
  return (
    <div className="grid min-h-svh place-items-center bg-[#101827] text-white">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 size-7 animate-spin text-cyan-300" />
        <p className="text-sm text-slate-300">{label}</p>
      </div>
    </div>
  );
}

function OperatorLogin({ authClient }: { authClient: ControlAuthClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="grid min-h-svh bg-[#e8edf1] p-5 text-slate-950 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
      <section className="relative hidden overflow-hidden bg-[#101827] p-12 text-white lg:block">
        <div className="absolute inset-x-0 top-0 h-1 bg-cyan-300" />
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Standalone control plane</p>
        <h1 className="mt-10 max-w-2xl font-serif text-6xl leading-[0.95] tracking-[-0.035em]">
          One desk.<br />Every website.<br />No shared database.
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-8 text-slate-300">
          Manage organizations, businesses, and isolated ConvexPress environments without merging customer accounts or site data.
        </p>
        <div className="absolute bottom-12 left-12 right-12 grid grid-cols-3 gap-px bg-white/15 text-xs">
          {[
            ["01", "Choose scope"],
            ["02", "Exchange authority"],
            ["03", "Open isolated site"],
          ].map(([number, label]) => (
            <div key={number} className="bg-[#101827] p-4">
              <span className="font-mono text-cyan-300">{number}</span>
              <span className="mt-2 block text-slate-300">{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid place-items-center bg-white p-6 sm:p-12">
        <form
          className="w-full max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            void signInControlOperator(authClient, email, password)
              .catch(() => setError("The email or password was not accepted."))
              .finally(() => setPending(false));
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Operator access</p>
          <h2 className="mt-3 font-serif text-4xl tracking-tight">Sign in to ConvexPress</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This account controls which businesses and websites you may open. Website customer logins remain separate.
          </p>
          {error ? (
            <p role="alert" className="mt-5 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-900">{error}</p>
          ) : null}
          <label className="mt-7 block text-sm font-semibold" htmlFor="control-email">Email</label>
          <input
            id="control-email"
            autoComplete="username"
            autoFocus
            className="mt-2 w-full border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label className="mt-5 block text-sm font-semibold" htmlFor="control-password">Password</label>
          <input
            id="control-password"
            autoComplete="current-password"
            className="mt-2 w-full border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Button className="mt-7 w-full rounded-none bg-blue-700 py-6 text-white hover:bg-blue-800" disabled={pending} type="submit">
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {pending ? "Signing in" : "Continue"}
          </Button>
        </form>
      </section>
    </main>
  );
}
