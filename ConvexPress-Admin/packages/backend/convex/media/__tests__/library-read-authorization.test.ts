import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { BUILT_IN_ROLES } from "../../seed/roles";
import { countDocuments, counts, get, getByIds, getPublic, getSrcSet, getUrl, list } from "../queries";

const libraryCalls = [
  ["get", get, { mediaId: "media1" }],
  ["list", list, { paginationOpts: { numItems: 20, cursor: null } }],
  ["counts", counts, {}],
  ["countDocuments", countDocuments, { paginationOpts: { numItems: 20, cursor: null } }],
  ["getByIds", getByIds, { mediaIds: ["media1"] }],
  ["getUrl", getUrl, { mediaId: "media1" }],
] as const;

function fixture(options: { role?: string; status?: string; revoked?: boolean; anonymous?: boolean } = {}) {
  const role = BUILT_IN_ROLES.find((entry) => entry.slug === (options.role ?? "subscriber"))!;
  const isLocal = role.type === "internal";
  const ctx = commerceHarness({
    settings: [],
    roles: [{ ...role, _id: "role", ...(options.revoked ? { capabilities: [] } : {}) }],
    users: [
      { _id: "reader", authSource: isLocal ? "local" : "clerk", clerkUserId: "clerk-reader", status: options.status ?? "active", roleId: "role" },
      { _id: "uploader", email: "fixture-uploader@example.invalid" },
    ],
    media: [{ _id: "media1", uploadedBy: "uploader", status: "active", title: "Field notes", mediaType: "video", storageId: "storage1", url: "https://example.invalid/stale", createdAt: 1 }],
    mediaMeta: [{ _id: "meta1", mediaId: "media1", key: "fixture_private", value: "authored metadata" }],
  }, "reader");
  ctx.auth.getUserIdentity = async () => options.anonymous ? null : {
    subject: isLocal ? "reader" : "clerk-reader",
    tokenIdentifier: isLocal ? "https://convexpress-admin.local|reader" : "https://clerk.example|clerk-reader",
  };
  ctx.storage = { getUrl: async (id: string) => `https://example.invalid/${id}` };
  return ctx;
}

for (const state of ["revoked", "banned", "inactive", "anonymous"] as const) {
  test(`all library handlers refuse ${state} readers before reading media or storage`, async () => {
    const ctx = fixture({ revoked: state === "revoked", anonymous: state === "anonymous", status: state === "banned" || state === "inactive" ? state : "active" });
    let mediaReads = 0;
    const originalGet = ctx.db.get;
    const originalQuery = ctx.db.query;
    ctx.db.get = async (...args: any[]) => {
      if (args[0] === "media" || args.at(-1) === "media1") mediaReads++;
      return originalGet(...args);
    };
    ctx.db.query = (table: string) => {
      if (["media", "mediaMeta", "mediaSizes"].includes(table)) mediaReads++;
      return originalQuery(table);
    };
    ctx.storage.getUrl = async () => { mediaReads++; return "https://example.invalid/storage1"; };
    for (const [name, registered, args] of libraryCalls) {
      let error: any;
      try { await (registered as any)._handler(ctx, args); } catch (caught) { error = caught; }
      expect({ handler: name, code: error?.data?.code }).toEqual({ handler: name, code: state === "anonymous" ? "UNAUTHORIZED" : "FORBIDDEN" });
    }
    expect(mediaReads).toBe(0);
  });
}

for (const role of ["subscriber", "administrator"]) {
  test(`the built-in ${role} retains library reads and the learner playback URL`, async () => {
    const ctx = fixture({ role });
    const detail = await (get as any)._handler(ctx, { mediaId: "media1" });
    expect(detail.url).toBe("https://example.invalid/storage1");
    expect(detail.metaMap.fixture_private).toBe("authored metadata");
    expect((await (list as any)._handler(ctx, { paginationOpts: { numItems: 20, cursor: null } })).page[0]._id).toBe("media1");
    expect((await (counts as any)._handler(ctx, {})).video).toBe(1);
    expect((await (getByIds as any)._handler(ctx, { mediaIds: ["media1", "missing"] })).map((item: any) => item?._id ?? null)).toEqual(["media1", null]);
    expect(await (getUrl as any)._handler(ctx, { mediaId: "media1" })).toBe("https://example.invalid/storage1");
    expect(await (get as any)._handler(ctx, { mediaId: "missing" })).toBeNull();
  });
}

test("public rendering remains available without library authorization and omits private fields", async () => {
  for (const options of [{ anonymous: true }, { status: "banned" }, { revoked: true }]) {
    const ctx = fixture(options);
    const publicMedia = await (getPublic as any)._handler(ctx, { mediaId: "media1" });
    expect(publicMedia.url).toBe("https://example.invalid/storage1");
    expect(publicMedia.uploadedBy).toBeUndefined();
    expect(publicMedia.metaMap).toBeUndefined();
    expect(publicMedia.uploaderName).toBeUndefined();
    expect(await (getSrcSet as any)._handler(ctx, { mediaId: "media1" })).toBe("");
    ctx.tables.media[0].status = "trashed";
    expect(await (getPublic as any)._handler(ctx, { mediaId: "media1" })).toBeNull();
  }
});
