import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { ControlEnvironment } from "@/control/ControlShellContext";
import type { Values } from "./draftModel";

export interface TemplateSection { active: string; overrides: Record<string, string>; variants: Record<string, string>; settings: Record<string, Values> }
export interface TemplateSnapshot { values: TemplateSection; revision: string; identity: { websiteKey: string; instanceKey: string; environmentKind: string } | null }
export interface PromotionReview { source: TemplateSnapshot; target: TemplateSnapshot; targetLabel: string; publish: () => Promise<TemplateSnapshot>; dispose: () => void }
interface BrokerClient { query: (...args: any[]) => Promise<any>; action: (...args: any[]) => Promise<any> }
interface SiteClient { setAuth: (token: string) => void; clearAuth: () => void; query: (...args: any[]) => Promise<any>; mutation: (...args: any[]) => Promise<any> }

/** Resolve only a registered live environment and authorize through the existing site-session broker. */
export async function prepareTemplatePromotion(source: TemplateSnapshot, live: Pick<ControlEnvironment, "instanceId" | "instanceKey" | "kind" | "deploymentOrigin" | "label">, control: BrokerClient, makeClient: (origin: string) => SiteClient = origin => new ConvexHttpClient(origin)): Promise<PromotionReview> {
  if (source.identity?.environmentKind !== "staging" || live.kind !== "live" || live.instanceKey === source.identity.instanceKey) throw new Error("Choose staging as the source and live as the destination.");
  const connections = await control.query(makeFunctionReference<"query">("connections/queries:listForInstance"), { instanceId: live.instanceId });
  const connection = connections.find((item: { status: string; isActive: boolean; hasCredentials: boolean }) => item.status === "connected" && item.isActive && item.hasCredentials);
  if (!connection) throw new Error("The live environment has no active management connection.");
  const session = await control.action(makeFunctionReference<"action">("siteBroker/session:exchange"), { connectionId: connection.connectionId, requestedCapabilities: ["health.read", "compatibility.read"], requestedSiteRole: "administrator" });
  if (session.instanceKey !== live.instanceKey || session.websiteKey !== source.identity.websiteKey) throw new Error("The live session belongs to a different website or environment.");
  const client = makeClient(live.deploymentOrigin);
  client.setAuth(session.token);
  try {
    const target = await client.query(makeFunctionReference<"query">("settings/templateDrafts:snapshot"), {}) as TemplateSnapshot;
    if (target.identity?.instanceKey !== live.instanceKey || target.identity.websiteKey !== source.identity.websiteKey || target.identity.environmentKind !== "live") throw new Error("Live site identity changed. Reload before promoting.");
    // Clone the reviewed snapshot so later editor changes cannot alter the promotion payload.
    const reviewedSource = structuredClone(source);
    return {
      source: reviewedSource, target, targetLabel: live.label || live.instanceKey,
      dispose: () => client.clearAuth(),
      publish: () => client.mutation(makeFunctionReference<"mutation">("settings/templateDrafts:publish"), {
        values: reviewedSource.values, expectedRevision: target.revision, confirmLive: true,
        source: { ...reviewedSource.identity, environmentKind: "staging", revision: reviewedSource.revision },
      }) as Promise<TemplateSnapshot>,
    };
  } catch (error) { client.clearAuth(); throw error; }
}
