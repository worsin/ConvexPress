import { expect, test } from "bun:test";
import { assertAuthoringWrite, authoringWriteNeedsPrevious, assertLegacyAuthoring, permitValidatedCanonicalAuthoringWrite } from "../authoringVersionFence";
const previous = { _id: "post", title: "Draft", status: "draft", contentMode: "blocks", blocksVersion: 2, blocksRevision: 4, blocks: [] };
const errorCode = (run: () => unknown) => { try { run(); return null; } catch (error: any) { return error.data?.code ?? error.message; } };

test("auto-draft migration permits bind one legacy conversion and cannot create or republish auto-drafts", () => {
 const write = {table:"posts",operation:"patch" as const,id:"post",previous:{...previous,status:"auto-draft",blocksVersion:1},value:{blocksVersion:2,blocksRevision:5,blocks:[]}};
 expect(errorCode(()=>permitValidatedCanonicalAuthoringWrite(write))).toBe("CANONICAL_PUBLICATION_UNAVAILABLE");
 expect(errorCode(()=>assertAuthoringWrite(write,{} as any))).toBe("CANONICAL_PUBLICATION_UNAVAILABLE");
 const permit=permitValidatedCanonicalAuthoringWrite(write,{preserveLegacyAutoDraft:true});
 assertAuthoringWrite(write,permit);
 expect(errorCode(()=>assertAuthoringWrite(write,permit))).toBe("CANONICAL_PUBLICATION_UNAVAILABLE");
 for (const other of [
  {...write,operation:"insert" as const,value:{...write.value,status:"auto-draft"}},
  {...write,operation:"replace" as const,value:{...write.value,status:"auto-draft"}},
  {...write,previous:{...write.previous,blocksVersion:2}},
  {...write,previous:{...write.previous,status:"draft"},value:{...write.value,status:"auto-draft"}},
  {...write,value:{...write.value,status:"auto-draft"}},
  {...write,value:{...write.value,publishedAt:42}},
  {...write,previous:{...write.previous,status:"pending"}},
 ]) expect(errorCode(()=>permitValidatedCanonicalAuthoringWrite(other,{preserveLegacyAutoDraft:true}))).not.toBeNull();
 const altered=permitValidatedCanonicalAuthoringWrite(write,{preserveLegacyAutoDraft:true});
 expect(errorCode(()=>assertAuthoringWrite({...write,id:"different"},altered))).toBe("CANONICAL_AUTHORING_REQUIRED");
});

test("legacy and unrelated writes remain available; metadata patches do not demand an authoring read", () => {
  expect(authoringWriteNeedsPrevious("posts", "patch", { commentCount: 2 })).toBe(false);
  expect(authoringWriteNeedsPrevious("posts", "patch", { title: "Changed" })).toBe(true);
  expect(authoringWriteNeedsPrevious("posts", "patch", { status: "publish" })).toBe(true);
  expect(authoringWriteNeedsPrevious("media", "replace", { title: "Image" })).toBe(false);
  assertAuthoringWrite({ table: "posts", operation: "insert", value: { title: "Legacy", blocksVersion: 1 } });
  assertAuthoringWrite({ table: "posts", operation: "patch", id: "post", previous, value: { commentCount: 3 } });
  assertAuthoringWrite({ table: "media", operation: "insert", value: { blocksVersion: 900 } });
});

test("legacy body, title, autosave and replacement writers cannot alter v2 or downgrade its discriminator", () => {
  for (const value of [{ title: "Changed" }, { content: "Old body" }, { blocks: [] }, { blocksVersion: 1 }, { blocksVersion: undefined }, { autosaveTitle: "Old" }, { autosaveContent: "Old" }]) {
    expect(errorCode(() => assertAuthoringWrite({ table: "posts", operation: "patch", id: "post", previous, value }))).toBe("CANONICAL_AUTHORING_REQUIRED");
  }
  expect(errorCode(() => assertAuthoringWrite({ table: "posts", operation: "replace", id: "post", previous, value: { ...previous } }))).toBe("CANONICAL_AUTHORING_REQUIRED");
  expect(errorCode(() => assertLegacyAuthoring(previous))).toBe("CANONICAL_AUTHORING_REQUIRED");
});

test("new canonical rows and snapshots require explicit internal permits; forged serialized permits refuse", () => {
  for (const table of ["posts", "revisions"]) {
    const write = { table, operation: "insert" as const, value: { ...previous } };
    expect(errorCode(() => assertAuthoringWrite(write))).toBe("CANONICAL_AUTHORING_REQUIRED");
    expect(errorCode(() => assertAuthoringWrite(write, {} as any))).toBe("CANONICAL_AUTHORING_REQUIRED");
    const permit = permitValidatedCanonicalAuthoringWrite(write);
    assertAuthoringWrite(write, permit);
    expect(errorCode(() => assertAuthoringWrite(write, permit))).toBe("CANONICAL_AUTHORING_REQUIRED");
  }
});

test("permits bind exact candidate identity/content, operation, target and complete prior authoring", () => {
  const value = { title: "Next", blocksVersion: 2, blocksRevision: 5, blocks: [] };
  const write = { table: "posts", operation: "patch" as const, id: "post", previous, value };
  const altered = [
    { ...write, id: "other" }, { ...write, operation: "replace" as const },
    { ...write, value: { ...value } },
    { ...write, previous: { ...previous, title: "Concurrent legacy title" } },
    { ...write, previous: { ...previous, blocksRevision: 5 } },
  ];
  for (const other of altered) expect(errorCode(() => assertAuthoringWrite(other, permitValidatedCanonicalAuthoringWrite(write)))).toBe("CANONICAL_AUTHORING_REQUIRED");
  const permit = permitValidatedCanonicalAuthoringWrite(write);
  value.title = "Mutated after validation";
  expect(errorCode(() => assertAuthoringWrite(write, permit))).toBe("CANONICAL_AUTHORING_REQUIRED");
  assertAuthoringWrite(write, permitValidatedCanonicalAuthoringWrite(write));
});

test("unknown envelopes and downgrades refuse; canonical publication requires exact internal permits", () => {
  for (const version of [0, 3, null, "2"]) {
    const write = { table: "posts", operation: "patch" as const, id: "post", previous: { ...previous, blocksVersion: version }, value: { title: "Changed" } };
    expect(errorCode(() => assertAuthoringWrite(write))).toBe("UNSUPPORTED_AUTHORING_VERSION");
    expect(errorCode(() => permitValidatedCanonicalAuthoringWrite(write))).toBe("UNSUPPORTED_AUTHORING_VERSION");
  }
  for (const status of ["publish", "future", "private"]) {
    const write = { table: "posts", operation: "patch" as const, id: "post", previous, value: { status } };
    expect(errorCode(() => assertAuthoringWrite(write))).toBe("CANONICAL_AUTHORING_REQUIRED");
    assertAuthoringWrite(write, permitValidatedCanonicalAuthoringWrite(write));
  }
  const downgrade = { table: "posts", operation: "patch" as const, id: "post", previous, value: { blocksVersion: 1 } };
  expect(errorCode(() => permitValidatedCanonicalAuthoringWrite(downgrade))).toBe("CANONICAL_AUTHORING_REQUIRED");
  assertAuthoringWrite({ table: "posts", operation: "patch", id: "post", previous, value: { status: "trash" } });
});

test("publication confidentiality and deadline fields cannot bypass canonical permits as ordinary metadata", () => {
  for (const value of [{ visibility: "public" }, { password: undefined }, { scheduledAt: 200 }, { publishedAt: 200 }]) {
    const write = { table: "posts", operation: "patch" as const, id: "post", previous, value };
    expect(authoringWriteNeedsPrevious("posts", "patch", value)).toBe(true);
    expect(errorCode(() => assertAuthoringWrite(write))).toBe("CANONICAL_AUTHORING_REQUIRED");
    assertAuthoringWrite(write, permitValidatedCanonicalAuthoringWrite(write));
  }
});


test("no permit or metadata-clearing variant can downgrade canonical authoring", () => {
  for (const value of [{blocksVersion:1},{blocksVersion:undefined},{blocksVersion:1,blocks:undefined,contentMode:"article",content:"Original"}]) {
    const write={table:"posts",operation:"patch" as const,id:"post",previous,value};
    expect(() => permitValidatedCanonicalAuthoringWrite(write)).toThrow();
    expect(() => assertAuthoringWrite(write)).toThrow();
    const valid={...write,value:{title:"Canonical edit"}};
    expect(() => assertAuthoringWrite(write,permitValidatedCanonicalAuthoringWrite(valid))).toThrow();
  }
});

test("definition snapshots cannot enter legacy rows or bypass canonical write permits", () => {
  const definitions = { scope: { websiteKey: "site", instanceKey: "stage", deploymentOrigin: "https://site.convex.cloud" }, definitions: [] };
  for (const table of ["posts", "revisions"]) {
    for (const blocksVersion of [undefined, 1]) {
      expect(() => assertAuthoringWrite({ table, operation: "insert", value: { blocksVersion, composedDefinitions: definitions } })).toThrow();
    }
    for (const composedDefinitions of [definitions, undefined]) {
      const write = { table, operation: "patch" as const, id: "post", previous, value: { composedDefinitions } };
      expect(authoringWriteNeedsPrevious(table, "patch", write.value)).toBe(true);
      expect(() => assertAuthoringWrite(write)).toThrow();
      assertAuthoringWrite(write, permitValidatedCanonicalAuthoringWrite(write));
    }
  }
  const prior = { ...previous, composedDefinitions: structuredClone(definitions) };
  const value = { composedDefinitions: structuredClone(definitions) };
  const write = { table: "posts", operation: "patch" as const, id: "post", previous: prior, value };
  const changedCandidate = permitValidatedCanonicalAuthoringWrite(write);
  value.composedDefinitions.scope.instanceKey = "other";
  expect(() => assertAuthoringWrite(write, changedCandidate)).toThrow();
  const changedPrior = permitValidatedCanonicalAuthoringWrite(write);
  prior.composedDefinitions.scope.instanceKey = "concurrent";
  expect(() => assertAuthoringWrite(write, changedPrior)).toThrow();
  const downgrade = { ...write, value: { blocksVersion: 1 } };
  expect(() => permitValidatedCanonicalAuthoringWrite(downgrade)).toThrow();
  const cleared = { ...write, value: { blocksVersion: 1, composedDefinitions: undefined } };
  expect(() => assertAuthoringWrite(cleared)).toThrow();
  expect(() => permitValidatedCanonicalAuthoringWrite(cleared)).toThrow();
});

test("exact canonical permits cannot bypass stored block locks or downgrade around them", () => {
  const node = { id: "protected", name: "core/heading", version: 2, attrs: { text: "Original" }, lock: { edit: true, remove: true, move: true } };
  const saved = { ...previous, blocks: [node] };
  for (const [blocks, expected] of [[[], "BLOCK_REMOVE_LOCKED"], [[{ ...node, lock: {}, attrs: { text: "Changed" } }], "BLOCK_EDIT_LOCKED"]] as const) {
    const write = { table: "posts", operation: "patch" as const, id: "post", previous: saved, value: { blocks } };
    expect(errorCode(() => assertAuthoringWrite(write, permitValidatedCanonicalAuthoringWrite(write)))).toBe(expected);
  }
  const recovery = { table: "posts", operation: "patch" as const, id: "post", previous: saved, value: { blocksVersion: 1, blocks: [] } };
  expect(errorCode(() => assertAuthoringWrite(recovery))).toBe("CANONICAL_AUTHORING_REQUIRED");
  const unlock = { table: "posts", operation: "patch" as const, id: "post", previous: saved, value: { blocks: [{ ...node, lock: {} }] } };
  expect(() => assertAuthoringWrite(unlock, permitValidatedCanonicalAuthoringWrite(unlock))).not.toThrow();
});
