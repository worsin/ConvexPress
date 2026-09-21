import { expect, test } from "bun:test";
import { parsePollDefinition, pollDefinitionVersion } from "./pollContracts";
import { pollArgsSchema, pollSnapshotSchema } from "./pollDataContracts";
import { planCanonicalData } from "./planner";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";
const scope = { websiteKey: "site", instanceKey: "staging" };
const policy = { enabledPlugins: ["forms"], capabilities: ["poll.submission"], disabledBlocks: [] };
const attrs = parsePollDefinition({ question: "Which practice?", options: [{ key: "a", label: "Observation" }, { key: "b", label: "Notebook" }] });
const tree = ["one", "two"].map(id => ({ id, name: "core/poll", version: 1, attrs }));
const resolve = (read: (args: { blockId: string }) => Promise<unknown>) => resolveCanonicalData(tree, scope, policy, async () => null, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, read);
test("poll version follows ballot meaning and response policy, preserving reorder and display-only edits", () => {
  const version = pollDefinitionVersion(attrs);
  expect(pollDefinitionVersion({ ...attrs, showResults: false, options: [...attrs.options].reverse() })).toBe(version);
  for (const patch of [{ question: "A new question" }, { responsePolicy: "signedIn" as const }, { options: [{ key: "a", label: "Another meaning" }, attrs.options[1]] }]) expect(pollDefinitionVersion({ ...attrs, ...patch })).not.toBe(version);
  for (const options of [[attrs.options[0]], [attrs.options[0], attrs.options[0]], [{ key: "__proto__", label: "No" }, attrs.options[1]], [{ key: "c", label: "Notebook " }, attrs.options[1]]]) expect(() => parsePollDefinition({ ...attrs, options })).toThrow();
});
test("poll plan uses compiled block identities, requires capability and refuses malformed definitions before reads", async () => {
  expect(planCanonicalData(tree, scope, policy).jobs.map(job => job.args)).toEqual([{ blockId: "one" }, { blockId: "two" }]);
  expect(pollArgsSchema.safeParse({ blockId: "one", postId: "other" }).success).toBe(false);
  for (const changed of [{ ...policy, enabledPlugins: [] }, { ...policy, capabilities: [] }, { ...policy, disabledBlocks: ["core/poll"] }]) expect(() => planCanonicalData(tree, scope, changed)).toThrow();
  expect(() => planCanonicalData([{ ...tree[0], attrs: {} }], scope, policy)).toThrow("at least two");
  let reads = 0;
  await expect(resolveCanonicalData(tree, scope, policy, async () => { reads++; return null; })).rejects.toThrow("Trusted poll reader");
  expect(reads).toBe(0);
});
test("poll envelope rejects other source blocks, unknown disclosures and mismatched environment", async () => {
  const envelope = await resolve(async args => ({ ...args, poll: null, asOf: 1, nextChangeAt: null }));
  expect(validateCanonicalData(tree, scope, policy, envelope)).toEqual(envelope);
  await expect(resolve(async () => ({ blockId: "other", poll: null, asOf: 1, nextChangeAt: null }))).rejects.toThrow("source block");
  const edited = structuredClone(envelope); (edited.dataByBlock.one.data as { blockId: string }).blockId = "two";
  expect(() => validateCanonicalData(tree, scope, policy, edited)).toThrow();
  expect(() => validateCanonicalData(tree, { ...scope, instanceKey: "production" }, policy, envelope)).toThrow();
});
test("poll DTO enforces exact aggregate totals, hidden-result disclosure and response choice identity", () => {
  const poll = { postId: "page", blockId: "poll", definitionVersion: pollDefinitionVersion(attrs), question: attrs.question, options: attrs.options.map(option => ({ ...option, count: 1 })), total: 2, responsePolicy: "visitor", canVote: true, votedKey: null, asOf: 1, nextChangeAt: null };
  expect(pollSnapshotSchema.safeParse(poll).success).toBe(true);
  for (const patch of [{ total: 3 }, { total: null }, { votedKey: "missing" }, { votedKey: "a" }, { voterHash: "private" }, { options: [poll.options[0], poll.options[0]] }]) expect(pollSnapshotSchema.safeParse({ ...poll, ...patch }).success).toBe(false);
});
