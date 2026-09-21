import { test, expect } from "bun:test";
import { planCanonicalData } from "./planner";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";
import { tagCloudArgsSchema, tagCloudResultSchema } from "./tagCloudContracts";
const scope = { websiteKey: "site", instanceKey: "staging" };
const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
const block = (id: string, max = 2) => ({ id, name: "core/tag-cloud", version: 2, attrs: { max } });
const topic = { id: "topic", name: "Making", href: "/tag/making" };
test("topic contracts reject fractions, excess limits, arbitrary destinations, duplicate results and nonadvancing cursors", () => {
  for (const args of [{ max: 1.5 }, { max: 0 }, { max: 101 }, { taxonomy: "private" }]) expect(tagCloudArgsSchema.safeParse(args).success).toBe(false);
  for (const result of [
    { items: [{ ...topic, href: "https://other.example" }], cursor: null, nextCursor: null },
    { items: [topic, topic], cursor: null, nextCursor: null },
    { items: [topic], cursor: "same", nextCursor: "same" },
    { items: [{ ...topic, count: 123 }], cursor: null, nextCursor: null },
  ]) expect(tagCloudResultSchema.safeParse(result).success).toBe(false);
});
test("topic planning deduplicates identical requests and keeps visitor state out of saved attributes", () => {
  const tree=[block("one"),block("two")];
  expect(planCanonicalData(tree,scope,policy).jobs).toHaveLength(1);
  expect(planCanonicalData(tree,scope,policy,{one:"page-two"}).jobs.map(job=>job.args)).toEqual([{max:2,cursor:"page-two"},{max:2,cursor:null}]);
  expect(tree[0]!.attrs).toEqual({max:2});
});
test("missing trusted topic reader refuses all reads; server and consumer verify limit, cursor and installation", async () => {
  const tree=[block("topics",1)], request={topics:"page-two"}; let reads=0;
  await expect(resolveCanonicalData(tree,scope,policy,async()=>{reads++;return null;})).rejects.toThrow("Trusted topic reader");
  expect(reads).toBe(0);
  const resolve=(result:unknown)=>resolveCanonicalData(tree,scope,policy,async()=>null,undefined,undefined,undefined,request,undefined,undefined,undefined,async()=>result);
  const result={items:[topic],cursor:"page-two",nextCursor:null};
  const envelope=await resolve(result);
  expect(validateCanonicalData(tree,scope,policy,envelope,request)).toEqual(envelope);
  expect(()=>validateCanonicalData(tree,scope,policy,envelope)).toThrow("another pagination request");
  expect(()=>validateCanonicalData(tree,{...scope,instanceKey:"other"},policy,envelope,request)).toThrow("another environment");
  for (const bad of [{...result,cursor:null},{...result,items:[topic,{...topic,id:"extra"}]}]) {
    await expect(resolve(bad)).rejects.toThrow("selected page or limit");
    const stale=structuredClone(envelope);stale.dataByBlock.topics!.data=bad;
    expect(()=>validateCanonicalData(tree,scope,policy,stale,request)).toThrow("current canonical attributes");
  }
});
