import { expect, test } from "bun:test";
import { assertAuthoringWrite, authoringWriteNeedsPrevious, assertLegacyAuthoring, permitValidatedCanonicalAuthoringWrite, permitValidatedLegacyRecoveryWrite } from "../authoringVersionFence";
const previous = { _id: "post", title: "Draft", status: "draft", contentMode: "blocks", blocksVersion: 2, blocksRevision: 4, blocks: [] };
const errorCode = (run: () => unknown) => { try { run(); return null; } catch (error: any) { return error.data?.code ?? error.message; } };

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


test("explicit legacy recovery permit is exact, one-use and cannot authorize ordinary downgrade writers", () => {
  const write = { table: "posts", operation: "patch" as const, id: "post", previous, value: { title: "Recovered", contentMode: "article", content: "Original", blocksVersion: 1, blocksRevision: 5, blocks: undefined } };
  expect(() => permitValidatedCanonicalAuthoringWrite(write)).toThrow();
  expect(() => assertAuthoringWrite(write)).toThrow();
  const permit = permitValidatedLegacyRecoveryWrite(write);
  assertAuthoringWrite(write, permit);
  expect(() => assertAuthoringWrite(write, permit)).toThrow();
  const altered = permitValidatedLegacyRecoveryWrite(write);
  expect(() => assertAuthoringWrite({ ...write, value: { ...write.value, content: "Other" } }, altered)).toThrow();
  expect(() => permitValidatedLegacyRecoveryWrite({ ...write, table: "revisions" })).toThrow();
  expect(() => permitValidatedLegacyRecoveryWrite({ ...write, previous: { ...previous, blocksVersion: 1 } })).toThrow();
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
  expect(() => permitValidatedLegacyRecoveryWrite(downgrade)).toThrow();
  const cleared = { ...write, value: { blocksVersion: 1, composedDefinitions: undefined } };
  assertAuthoringWrite(cleared, permitValidatedLegacyRecoveryWrite(cleared));
});
