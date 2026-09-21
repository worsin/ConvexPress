import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { getElectronBridge } from "@/lib/electron";
import { createWebsiteOperatorLink } from "@/lib/templates/websiteOperatorLink";
import type { SelectedSiteTarget } from "./SiteRuntimeProvider";

type Target = Pick<SelectedSiteTarget, "connectionId" | "websiteKey" | "instanceKey" | "deploymentOrigin">;
type Launch = { url: string; stop(): Promise<void> };
type Editing = { start(target: Target, siteUrl: string): Promise<Launch> };
const Context = createContext<Editing | null>(null);
export const useWebsiteEditing = () => useContext(Context);
const handoff = makeFunctionReference<"mutation", { codeHash: string }, { url: string; instanceKey: string; expiresAt: number }>("auth/operatorHandoffs:create");

/** Lives above selected-site navigation. Every request obtains a fresh broker
 * session for the immutable launch target, using the current desktop login. */
export function WebsiteEditingProvider({ issue, children }: {
  issue(target: Target): Promise<{ token: string; expiresAt: number }>;
  children: ReactNode;
}) {
  const registrations = useRef(new Map<string, { target: Target; siteUrl: string }>());
  const issueRef = useRef(issue); issueRef.current = issue;
  const generation = useRef(0);
  const createLink = useCallback(async (leaseId: string) => {
    const captured = generation.current;
    const registration = registrations.current.get(leaseId);
    if (!registration) throw Error("Website editing ended");
    const session = await issueRef.current(registration.target);
    const current = () => captured === generation.current && registrations.current.get(leaseId) === registration;
    if (!current() || session.expiresAt <= Date.now() + 10_000) throw Error("Website editing authorization changed");
    const client = new ConvexHttpClient(registration.target.deploymentOrigin, {
      logger: false,
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }),
    });
    client.setAuth(session.token);
    try {
      const link = await createWebsiteOperatorLink(args => client.mutation(handoff, args), { siteUrl: registration.siteUrl, instanceKey: registration.target.instanceKey });
      if (!current()) throw Error("Website editing authorization changed");
      return link;
    } finally { client.clearAuth(); }
  }, []);
  useEffect(() => {
    const bridge = getElectronBridge()?.websiteEditing;
    if (!bridge) return;
    const unsubscribe = bridge.onRequest(({ requestId, leaseId }) => {
      void createLink(leaseId).then(url => bridge.respond({ requestId, url }), () => bridge.respond({ requestId, url: null })).catch(() => {});
    });
    const unsubscribeClosed = bridge.onClosed(({ leaseId }) => registrations.current.delete(leaseId));
    return () => {
      generation.current++; unsubscribe(); unsubscribeClosed();
      for (const leaseId of registrations.current.keys()) void bridge.stop(leaseId).catch(() => {});
      registrations.current.clear();
    };
  }, [createLink]);
  const start = useCallback(async (target: Target, siteUrl: string): Promise<Launch> => {
    const bridge = getElectronBridge()?.websiteEditing;
    if (!bridge) throw Error("Update the desktop app to connect website editing");
    const leaseId = crypto.randomUUID();
    const captured = generation.current;
    registrations.current.set(leaseId, { target: { ...target }, siteUrl });
    const stop = async () => { registrations.current.delete(leaseId); await bridge.stop(leaseId); };
    try {
      const descriptor = await bridge.start({ leaseId, siteUrl });
      if (captured !== generation.current || !registrations.current.has(leaseId)) throw Error("Website editing ended");
      const endpoint = new URL(descriptor.endpoint);
      if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port || endpoint.pathname !== "/convexpress/website-editing" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !/^[a-f0-9]{64}$/.test(descriptor.key) || descriptor.expiresAt <= Date.now()) throw Error("Invalid desktop editing connection");
      const url = new URL(await createLink(leaseId));
      const fragment = new URLSearchParams(url.hash.slice(1));
      fragment.set("cp-desktop", JSON.stringify(descriptor)); url.hash = fragment.toString();
      return { url: url.href, stop };
    } catch (error) { await stop().catch(() => {}); throw error; }
  }, [createLink]);
  const value = useMemo(() => ({ start }), [start]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
