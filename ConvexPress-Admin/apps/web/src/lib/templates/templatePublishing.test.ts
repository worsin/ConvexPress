import { expect, test } from "bun:test";
import { prepareTemplatePromotion, type TemplateSnapshot } from "./templatePublishing";
const source = (): TemplateSnapshot => ({ values: { active: "core", overrides: {}, variants: {}, settings: { core: { colors: { primary: "#123456" } } } }, revision: "staging-v1", identity: { websiteKey: "shop", instanceKey: "shop:staging", environmentKind: "staging" } });
const live = { instanceId: "live" as any, instanceKey: "shop:live", kind: "live" as const, deploymentOrigin: "https://live.example.invalid", label: "Shop live" };
function mocks() {
 const writes: any[] = []; let cleared = 0;
 const target = { ...source(), revision: "live-v1", identity: { websiteKey: "shop", instanceKey: "shop:live", environmentKind: "live" } };
 return { writes, target, clearCount: () => cleared, control: { query: async () => [{ connectionId: "connection", status: "connected", isActive: true, hasCredentials: true }], action: async () => ({ token: "synthetic-test-session", instanceKey: "shop:live", websiteKey: "shop" }) }, makeClient: () => ({ setAuth: () => {}, clearAuth: () => { cleared++; }, query: async () => target, mutation: async (_fn: any, args: any) => { writes.push(args); return target; } }) };
}
test("promotion writes only the reviewed snapshot and expected live revision", async () => {
 const m = mocks(); const draft = source(); const review = await prepareTemplatePromotion(draft, live, m.control, m.makeClient);
 draft.values.active = "journal";
 await review.publish(); review.dispose();
 expect(m.writes[0].values.active).toBe("core");
 expect(m.writes[0].expectedRevision).toBe("live-v1");
 expect(m.writes[0].source.instanceKey).toBe("shop:staging");
 expect(m.clearCount()).toBe(1);
});
test("mismatched target identity is rejected and session discarded without writes", async () => {
 const m = mocks(); m.target.identity.websiteKey = "other";
 const failure = await prepareTemplatePromotion(source(), live, m.control, m.makeClient).then(() => null, (error: unknown) => error);
 expect(failure instanceof Error).toBe(true);
 expect(m.writes).toHaveLength(0); expect(m.clearCount()).toBe(1);
});
