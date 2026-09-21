import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { defineTable, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import schema from "../../schema";
import { chooseMediaReferenceIndex, ensureMediaReferenceIndex, mediaReferenceIndex, withMediaReferenceIndexes } from "../referenceIndexes";
import { mediaReferenceIndexes, typedMediaReferences } from "../referenceInventory.generated";

test("the final schema has no duplicate ordered index fields or descriptors on any table", () => {
  const collisions: string[] = [];
  for (const [table, definition] of Object.entries(schema.tables)) {
    const fields = new Map<string, string>(), names = new Set<string>();
    const exported = definition.export();
    for (const index of [...exported.indexes, ...exported.stagedDbIndexes]) {
      const key = JSON.stringify(index.fields);
      if (fields.has(key)) collisions.push(`${table}: ${fields.get(key)} / ${index.indexDescriptor}: ${key}`);
      if (names.has(index.indexDescriptor)) collisions.push(`${table}: duplicate name ${index.indexDescriptor}`);
      fields.set(key, index.indexDescriptor);
      names.add(index.indexDescriptor);
    }
  }
  expect(collisions).toEqual([]);
});

test("gallery references reuse the deployed exact media index", () => {
  expect(mediaReferenceIndex("gallery_albumItems", "mediaId")).toBe("by_media");
});

test("reference index composition is idempotent", () => {
  const before = schema.export();
  withMediaReferenceIndexes(schema.tables);
  expect(schema.export()).toBe(before);
});

test("every generated scalar lookup agrees with the final active schema, including storage/dependent indexes", () => {
  for (const [table, descriptors] of Object.entries(typedMediaReferences)) {
    const indexes = (schema.tables as any)[table].export().indexes;
    for (const descriptor of descriptors) {
      if ((descriptor.path as readonly string[]).includes("*")) continue;
      const field = descriptor.path.join(".");
      expect(mediaReferenceIndex(table, field)).toBe(chooseMediaReferenceIndex(indexes, field));
    }
  }
  for (const [table, field] of [["media", "storageId"], ["mediaSizes", "storageId"], ["mediaMeta", "value"]]) {
    const indexes = (schema.tables as any)[table].export().indexes;
    expect(indexes.filter((index: any) => index.fields.length === 1 && index.fields[0] === field)).toEqual([{ indexDescriptor: "by_storage", fields: [field] }]);
  }
  expect(mediaReferenceIndexes.gallery_albumItems.mediaId).toBe("by_media");
});

test("exact indexes win over composites; only a leading equality field is reusable", () => {
  const make = () => defineTable({ mediaId: v.id("media"), status: v.string() });
  const exact = make().index("by_media_status", ["mediaId", "status"]).index("by_media", ["mediaId"]);
  expect(ensureMediaReferenceIndex(exact, "mediaId", "fixture")).toBe("by_media");
  expect(exact.export().indexes.length).toBe(2);
  const prefix = make().index("by_media_status", ["mediaId", "status"]);
  expect(ensureMediaReferenceIndex(prefix, "mediaId", "fixture")).toBe("by_media_status");
  expect(prefix.export().indexes.length).toBe(1);
  const nonPrefix = make().index("by_status_media", ["status", "mediaId"]);
  expect(ensureMediaReferenceIndex(nonPrefix, "mediaId", "fixture")).toBe("by_media_ref_mediaId");
  expect(nonPrefix.export().indexes.length).toBe(2);
});

test("staged exact and conflicting generated-name indexes refuse rather than creating duplicates", () => {
  const staged = defineTable({ mediaId: v.id("media") }).index("by_media", { fields: ["mediaId"], staged: true });
  expect(() => ensureMediaReferenceIndex(staged, "mediaId", "fixture")).toThrow();
  expect(staged.export().indexes.length).toBe(0);
  const conflict = defineTable({ mediaId: v.id("media"), other: v.string() }).index("by_media_ref_mediaId", ["other"]);
  expect(() => ensureMediaReferenceIndex(conflict, "mediaId", "fixture")).toThrow();
  expect(conflict.export().indexes.length).toBe(1);
  expect(() => mediaReferenceIndex("gallery_albumItems", "albumId")).toThrow();
});

test("registered query loads in a fresh process without schema evaluation and chooses the persisted mapping", async () => {
  const moduleUrl = new URL("../referenceReads.ts", import.meta.url).href;
  const proofDir = mkdtempSync(join(tmpdir(), "convexpress-query-proof-"));
  const proofFile = join(proofDir, "proof.json");
  try {
    // Bun's captured child stdout can be empty in the combined suite despite a
    // completed query. A private proof file verifies execution independently of
    // that transport; missing files, child failures and wrong results all fail.
    await promisify(execFile)(process.execPath, ["-e", `
      const {scan} = await import(${JSON.stringify(moduleUrl)});
      let picked;
      const ctx = {db: {query(table) {if(table !== 'gallery_albumItems') throw Error('wrong table'); return {
        withIndex(name, range) { picked = name; range({eq(field,id) {if(field !== 'mediaId' || id !== 'm1') throw Error('wrong range');}});
          return {paginate: async () => ({page:[],isDone:true,continueCursor:''})}; }
      };}}};
      await scan._handler(ctx,{table:'gallery_albumItems',field:'mediaId',mediaIds:['m1']});
      const schemaLoaded = Object.keys(import.meta.require.cache).some(path => path.endsWith('/convex/schema.ts'));
      const { writeFileSync } = await import("node:fs");
      writeFileSync(${JSON.stringify(proofFile)}, JSON.stringify({picked,schemaLoaded}));
    `], {encoding:"utf8", env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});
    expect(JSON.parse(readFileSync(proofFile, "utf8"))).toEqual({picked:"by_media",schemaLoaded:false});
  } finally {
    rmSync(proofDir, {recursive:true,force:true});
  }
});

test("real registered gallery scan uses the reused index and excludes unrelated junction rows", async () => {
  const { convexTest } = await import("convex-test");
  const t = convexTest({ schema, modules: {
    "./convex/_generated/api.js": () => import("../../_generated/api.js"),
    "./convex/_generated/server.js": () => import("../../_generated/server.js"),
    "./convex/media/referenceReads.ts": () => import("../referenceReads"),
  } });
  await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "fixture@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const media = { title: "Image", fileName: "image.png", slug: "image", url: "https://example.invalid/image", mimeType: "image/png", fileSize: 10, mediaType: "image" as const, status: "active" as const, uploadedBy: user, createdAt: 1, updatedAt: 1 };
    const target = await ctx.db.insert("media", media), unrelated = await ctx.db.insert("media", media);
    const album = await ctx.db.insert("gallery_albums", { title: "Fixture", slug: "fixture", status: "draft", visibility: "public", authorId: user, categoryIds: [], layoutPreset: "grid", columnsDesktop: 3, columnsTablet: 2, columnsMobile: 1, lightboxEnabled: false, captionsEnabled: false, downloadEnabled: false, itemCount: 301, createdAt: 1, updatedAt: 1 });
    for (let i = 0; i < 300; i++) await ctx.db.insert("gallery_albumItems", { albumId: album, mediaId: unrelated, sortOrder: i, createdAt: 1, updatedAt: 1 });
    const item = await ctx.db.insert("gallery_albumItems", { albumId: album, mediaId: target, sortOrder: 300, createdAt: 1, updatedAt: 1 });
    const result = await ctx.runQuery(makeFunctionReference<"query", { table: string; field: string; mediaIds: typeof target[] }, { rows: number; references: { documentId: string }[] }>("media/referenceReads:scan"), { table: "gallery_albumItems", field: "mediaId", mediaIds: [target] });
    expect(result.rows).toBe(1);
    expect(result.references.map(ref => ref.documentId)).toEqual([item]);
  });
});
