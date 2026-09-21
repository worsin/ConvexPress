import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { zipSync, unzipSync } from "fflate";
import { prepareTargetBoundSnapshot, MANAGEMENT_TABLES_PRESERVED_ON_IMPORT } from "../snapshotRestoreArchive";
import {
  inspectRemoteConvexSnapshot,
  prepareRemoteTargetBoundSnapshot,
  verifyRemoteSnapshotChecksum,
} from "../remoteSnapshotArchive";
const encoder = new TextEncoder();

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonLine(value: unknown) {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

function snapshot(input: {
  instanceKey: string;
  environmentKind: "live" | "staging";
  marker: string;
}) {
  const identity = {
    _id: `identity-${input.marker}`,
    _creationTime: 1,
    identityKey: "site-identity",
    websiteKey: "website-northstar",
    instanceKey: input.instanceKey,
    environmentKind: input.environmentKind,
    deploymentOrigin: "http://127.0.0.1:4800",
    managementOrigin: "http://127.0.0.1:4801",
    siteOrigin: "http://127.0.0.1:4100",
    siteContractVersion: "1.0.0",
    schemaVersion: "1.0.0",
    engineVersion: "1.0.0",
    managementCapabilities: ["site.restore"],
    initializedAt: 1,
    updatedAt: 1,
  };
  const files: Record<string, Uint8Array> = {
    "README.md": encoder.encode("snapshot"),
    "_tables/documents.jsonl": jsonLine({ name: "posts" }),
    "_storage/documents.jsonl": new Uint8Array(),
    "convexpress_siteIdentity/documents.jsonl": jsonLine(identity),
    "convexpress_siteIdentity/generated_schema.jsonl": jsonLine({ schema: true }),
    "posts/documents.jsonl": jsonLine({ _id: `post-${input.marker}`, title: input.marker }),
    "posts/generated_schema.jsonl": jsonLine({ schema: true }),
  };
  for (const table of MANAGEMENT_TABLES_PRESERVED_ON_IMPORT) {
    if (table === "convexpress_siteIdentity") continue;
    files[`${table}/documents.jsonl`] =
      table === "convexpress_managementAuthorities"
        ? jsonLine({
            _id: `authority-${input.marker}`,
            controllerId: `controller-${input.marker}`,
            keyId: `key-${input.marker}`,
            marker: input.marker,
          })
        : table === "convexpress_managementBindings"
          ? jsonLine({
              _id: `binding-${input.marker}`,
              authorityId: `authority-${input.marker}`,
              controllerId: `controller-${input.marker}`,
              syntheticOperatorId: `user-${input.marker}`,
              userId: `user-${input.marker}`,
              marker: input.marker,
              capabilityRevision: 1.0,
              updatedAt: 1.0,
            })
          : jsonLine({
              _id: `${table}-${input.marker}`,
              marker: input.marker,
            });
    files[`${table}/generated_schema.jsonl`] = jsonLine({ schema: true });
  }
  return zipSync(files);
}

function remote(
  files: Record<string, Uint8Array>,
  options: { range?: boolean; etag?: boolean; changed?: boolean; badDigest?: boolean } = {},
) {
  let fetched = 0;
  let rangeBytes = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const bytes = files[String(url)]!;
    if (!bytes) throw Error("unexpected URL");
    const headers = new Headers(init?.headers);
    const range = headers.get("range");
    const tag = '"' + checksum(bytes) + '"';
    const resultHeaders: Record<string, string> = {};
    if (options.etag !== false)
      resultHeaders.etag = options.changed && headers.has("if-match") ? '"changed"' : tag;
    resultHeaders.digest =
      "sha-256=" +
      (options.badDigest ? Buffer.alloc(32) : Buffer.from(checksum(bytes), "hex")).toString(
        "base64",
      );
    let body = bytes;
    let status = 200;
    if (range && options.range !== false) {
      const parts = /bytes=(\d+)-(\d+)/.exec(range)!;
      const start = Number(parts[1]);
      const end = Number(parts[2]);
      body = bytes.subarray(start, end + 1);
      status = 206;
      resultHeaders["content-range"] = `bytes ${start}-${end}/${bytes.length}`;
      rangeBytes += body.length;
    }
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (body.length) {
            const next = body.subarray(0, 65536);
            body = body.subarray(next.length);
            fetched += next.length;
            controller.enqueue(next);
          } else controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(stream, { status, headers: resultHeaders });
  };
  return {
    fetchImpl,
    get fetched() {
      return fetched;
    },
    get rangeBytes() {
      return rangeBytes;
    },
  };
}
function fixtures() {
  const source = snapshot({
    instanceKey: "northstar-staging",
    environmentKind: "staging",
    marker: "source",
  });
  const target = snapshot({
    instanceKey: "northstar-live",
    environmentKind: "live",
    marker: "target",
  });
  return {
    source,
    target,
    sourceInput: {
      url: "https://storage/source",
      checksumSha256: checksum(source),
      snapshotId: "snapshot-source",
      identity: {
        websiteKey: "website-northstar",
        instanceKey: "northstar-staging",
        environmentKind: "staging" as const,
      },
    },
    targetInput: {
      url: "https://storage/target",
      checksumSha256: checksum(target),
      snapshotId: "snapshot-target",
      identity: {
        websiteKey: "website-northstar",
        instanceKey: "northstar-live",
        environmentKind: "live" as const,
      },
    },
  };
}
const inspectInput = {
  url: "https://storage/source",
  snapshotId: "snapshot-source",
  expectedWebsiteKey: "website-northstar",
  expectedInstanceKey: "northstar-staging",
  expectedEnvironmentKind: "staging" as const,
  createdByControllerId: "controller-test",
};
test("remote inspection streams checksum and inventory, target binding preserves authorities and resets sessions", async () => {
  const f = fixtures();
  const server = remote({ [f.sourceInput.url]: f.source, [f.targetInput.url]: f.target });
  const inspected = await inspectRemoteConvexSnapshot({
    ...inspectInput,
    fetchImpl: server.fetchImpl,
  });
  expect(inspected.manifest.checksumSha256).toBe(checksum(f.source));
  const result = await prepareRemoteTargetBoundSnapshot({
    source: f.sourceInput,
    targetPreBackup: f.targetInput,
    fetchImpl: server.fetchImpl,
  });
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  const files = unzipSync(Buffer.concat(chunks));
  expect(new TextDecoder().decode(files["posts/documents.jsonl"])).toContain("source");
  expect(new TextDecoder().decode(files["convexpress_siteIdentity/documents.jsonl"])).toContain(
    "northstar-live",
  );
  expect(
    new TextDecoder().decode(files["convexpress_managementAuthorities/documents.jsonl"]),
  ).toContain("target");
  const bindingText = new TextDecoder().decode(
    files["convexpress_managementBindings/documents.jsonl"],
  );
  expect(JSON.parse(bindingText).userId).toBeUndefined();
  expect(bindingText).toContain('"capabilityRevision":1.0');
  expect(JSON.parse(bindingText).syntheticOperatorId).toBe(
    "controller:controller-target:key-target",
  );
  expect(files["convexpress_managementSessions/documents.jsonl"]?.length).toBe(0);
  expect(files["convexpress_managementNonces/documents.jsonl"]?.length).toBe(0);
  expect(files["media_epoch_claim/documents.jsonl"]?.length).toBe(0);
  expect(result.preservedTables).toEqual([...MANAGEMENT_TABLES_PRESERVED_ON_IMPORT]);
});
test("the actual streaming restore invalidates derived event, taxonomy, author and form state without changing authored records", async () => {
  const f = fixtures(), sourceFiles = unzipSync(f.source);
  const authored = {
    extension_events: {_id: "event", startsAt: 1000, endsAt: 2000, title: "夜の集い", calendarBucket: "stale"},
    termRelationships: {_id: "relation", postId: "post", termId: "term", order: 2, discoveryReady: true, discoveryEligible: true, discoveryPublishedAt: 100, discoveryAuthorId: "wrong"},
    users: {_id: "author", name: "Demo author", postCount: 999, postCountReady: true, role: "editor", metadata: {postCount: 7}},
    terms: {_id: "term", name: "Journal", count: 999, countReady: true, countState: {phase: "ready"}},
    authorPostCounts: {_id: "count", authorId: "author", phase: "ready", count: 999},
    forms: {_id:"form",title:"Keep this form",settings:"{\"entryLimit\":25}",submissionCountReady:true},
    formSubmissionCounts: {_id:"formCount",formId:"form",phase:"ready",count:999},
    commerce_products: {_id:"product",title:"Keep product",saleIndexVersion:1,collectionIndexVersion:1,salePriceFrom:100,salePriceTo:200},
    commerce_product_sales: {_id:"sale",productId:"product",bucket:"stale"},
    commerce_product_discovery: {_id:"discovery",productId:"product",kind:"recent"},
    commerce_review_ratings: {_id:"ratings",productId:"product",phase:"ready",generation:7,counts:[1,2,3,4,999],updatedAt:500,frontierTime:42,frontierId:"old",horizonTime:90,horizonId:"old-end"},
    commerce_review_items: {_id:"review",productId:"product",userId:"customer",rating:4,status:"approved",content:"Keep this review"},
    form_poll_votes: {_id:"vote",postId:"post",blockId:"poll",definitionVersion:"ballot",voterHash:"hashed-visitor",optionKey:"walk",createdAt:123},
    form_poll_tallies: {_id:"tally",postId:"post",blockId:"poll",definitionVersion:"ballot",counts:[{key:"walk",count:1},{key:"book",count:0}],total:1,updatedAt:123},
    form_poll_rate_limits: {_id:"pollRate",postId:"post",blockId:"poll",windowStart:120,accepted:120,updatedAt:123},
    membership_enrollment_repairs: {_id:"repair",userId:"customer",planId:"plan",version:7,afterTime:123,afterId:"old-row",horizonTime:456,horizonId:"old-last",restart:false,attempts:4,nextRetryAt:999999,lastError:"old error"},
  };
  for (const [table,row] of Object.entries(authored)) {
    sourceFiles[`${table}/documents.jsonl`] = jsonLine(row);
    sourceFiles[`${table}/generated_schema.jsonl`] = jsonLine({schema: true});
  }
  // Convex exports float syntax distinctly from tagged int64 and signed zero.
  sourceFiles["extension_events/documents.jsonl"] = encoder.encode(new TextDecoder().decode(sourceFiles["extension_events/documents.jsonl"]).trim().replace(/}$/, ',"offset":-0.0,"large":{"$integer":"AAAAAAAAAAA="}}\n'));
  const source = zipSync(sourceFiles);
  const result = await prepareRemoteTargetBoundSnapshot({source: {...f.sourceInput, checksumSha256: checksum(source)}, targetPreBackup: f.targetInput, fetchImpl: remote({[f.sourceInput.url]: source, [f.targetInput.url]: f.target}).fetchImpl});
  const chunks=[]; for await(const chunk of result.stream) chunks.push(chunk);
  const files=unzipSync(Buffer.concat(chunks));
  const read=(table:string)=>JSON.parse(new TextDecoder().decode(files[`${table}/documents.jsonl`]));
  const event=read("extension_events");
  expect(event.calendarBucket).toBeUndefined();
  expect(event.title).toBe(authored.extension_events.title);
  expect(event.startsAt).toBe(1000);
  expect(Object.is(event.offset,-0)).toBe(true);
  expect(event.large).toEqual({$integer:"AAAAAAAAAAA="});
  expect(new TextDecoder().decode(files["extension_events/documents.jsonl"])).toContain('"startsAt":1000.0');
  expect(read("termRelationships")).toEqual({_id:"relation",postId:"post",termId:"term",order:2});
  expect(read("terms")).toEqual({_id: "term", name: "Journal", count: 999});
  expect(read("users")).toEqual({_id:"author",name:"Demo author",role:"editor",metadata:{postCount:7}});
  expect(files["authorPostCounts/documents.jsonl"]?.length).toBe(0);
  expect(files["formSubmissionCounts/documents.jsonl"]?.length).toBe(0);
  expect(read("commerce_products")).toEqual({_id:"product",title:"Keep product",salePriceFrom:100,salePriceTo:200});
  expect(files["commerce_product_sales/documents.jsonl"]?.length).toBe(0);
  expect(files["commerce_product_discovery/documents.jsonl"]?.length).toBe(0);
  expect(read("commerce_review_ratings")).toEqual({_id:"ratings",productId:"product",phase:"pending",generation:8,counts:[0,0,0,0,0],updatedAt:0,frontierTime:null,frontierId:null,horizonTime:null,horizonId:null});
  expect(files["commerce_review_items/documents.jsonl"]).toEqual(sourceFiles["commerce_review_items/documents.jsonl"]);
  expect(files["form_poll_rate_limits/documents.jsonl"]?.length).toBe(0);
  expect(files["form_poll_votes/documents.jsonl"]).toEqual(sourceFiles["form_poll_votes/documents.jsonl"]);
  expect(files["form_poll_tallies/documents.jsonl"]).toEqual(sourceFiles["form_poll_tallies/documents.jsonl"]);
  expect(read("form_poll_votes")).toEqual(authored.form_poll_votes);
  expect(read("form_poll_tallies")).toEqual(authored.form_poll_tallies);
  expect(read("membership_enrollment_repairs")).toEqual({_id:"repair",userId:"customer",planId:"plan",version:8,afterTime:null,afterId:null,horizonTime:null,horizonId:null,restart:true,attempts:0,nextRetryAt:0});
  expect(read("forms")).toEqual({_id:"form",title:"Keep this form",settings:"{\"entryLimit\":25}"});
  expect(files["posts/documents.jsonl"]).toEqual(sourceFiles["posts/documents.jsonl"]);
  expect(files["users/generated_schema.jsonl"]).toEqual(sourceFiles["users/generated_schema.jsonl"]);
});

test("remote reads fail closed on ignored ranges, changed ETags, wrong checksums, Digest or identity", async () => {
  const f = fixtures();
  const files = { [f.sourceInput.url]: f.source };
  for (const options of [{ range: false }, { changed: true }, { etag: false }, { badDigest: true }])
    await expect(
      inspectRemoteConvexSnapshot({ ...inspectInput, fetchImpl: remote(files, options).fetchImpl }),
    ).rejects.toThrow();
  await expect(
    verifyRemoteSnapshotChecksum({
      url: f.sourceInput.url,
      expectedChecksumSha256: "0".repeat(64),
      fetchImpl: remote(files).fetchImpl,
    }),
  ).rejects.toThrow("checksum");
  await expect(
    inspectRemoteConvexSnapshot({
      ...inspectInput,
      expectedInstanceKey: "wrong-instance",
      fetchImpl: remote(files).fetchImpl,
    }),
  ).rejects.toThrow("identity");
  expect(
    (
      await inspectRemoteConvexSnapshot({
        ...inspectInput,
        immutableStorage: true,
        fetchImpl: remote(files, { etag: false }).fetchImpl,
      })
    ).manifest.verificationStatus,
  ).toBe("verified");
});
test("malformed ZIP, unsafe paths and corrupted required metadata are rejected", async () => {
  const f = fixtures();
  const original = unzipSync(f.source);
  for (const bytes of [
    new Uint8Array([0, 1, 2]),
    zipSync({ ...original, "../escape": encoder.encode("bad") }),
    zipSync({
      ...original,
      "convexpress_siteIdentity/documents.jsonl": encoder.encode("invalid json"),
    }),
  ]) {
    await expect(
      inspectRemoteConvexSnapshot({
        ...inspectInput,
        fetchImpl: remote({ [f.sourceInput.url]: bytes }).fetchImpl,
      }),
    ).rejects.toThrow();
  }
});

/** A valid 600 MiB stored ZIP entry, represented by a small prefix/suffix and zero ranges. */
function largeVirtualSnapshot() {
  const base = fixtures();
  const files = unzipSync(base.source);
  const largeName = "_storage/large-object.bin";
  const small = zipSync({ ...files, [largeName]: new Uint8Array() }, { level: 0 });
  const view = new DataView(small.buffer, small.byteOffset, small.byteLength);
  const end = small.length - 22;
  const central = view.getUint32(end + 16, true);
  let cursor = central;
  let insertion = 0;
  const payloadSize = 600 * 1024 * 1024;
  const crc = 0x676c5ed4; // IEEE CRC32 of exactly 600 MiB of zero bytes.
  while (view.getUint32(cursor, true) === 0x02014b50) {
    const nameLength = view.getUint16(cursor + 28, true),
      extraLength = view.getUint16(cursor + 30, true),
      commentLength = view.getUint16(cursor + 32, true);
    const name = new TextDecoder().decode(small.subarray(cursor + 46, cursor + 46 + nameLength));
    const local = view.getUint32(cursor + 42, true);
    if (name === largeName) {
      insertion = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      for (const offset of [local + 18, local + 22, cursor + 20, cursor + 24])
        view.setUint32(offset, payloadSize, true);
      view.setUint32(local + 14, crc, true);
      view.setUint32(cursor + 16, crc, true);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!insertion) throw Error("missing virtual entry");
  cursor = central;
  while (view.getUint32(cursor, true) === 0x02014b50) {
    const local = view.getUint32(cursor + 42, true);
    if (local >= insertion) view.setUint32(cursor + 42, local + payloadSize, true);
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
  }
  view.setUint32(end + 16, central + payloadSize, true);
  const size = small.length + payloadSize;
  const read = (start: number, length: number) => {
    const bytes = new Uint8Array(length);
    const stop = start + length;
    if (start < insertion) bytes.set(small.subarray(start, Math.min(stop, insertion)));
    if (stop > insertion + payloadSize) {
      const from = Math.max(start, insertion + payloadSize);
      bytes.set(small.subarray(from - payloadSize, stop - payloadSize), from - start);
    }
    return bytes;
  };
  const hash = createHash("sha256");
  for (let position = 0; position < size; position += 1024 * 1024)
    hash.update(read(position, Math.min(1024 * 1024, size - position)));
  return { size, read, checksum: hash.digest("hex"), base };
}

test("600 MiB virtual archive prepares and streams with bounded memory and downstream backpressure", async () => {
  const fixture = largeVirtualSnapshot();
  const normal = remote({ [fixture.base.targetInput.url]: fixture.base.target });
  let emitted = 0;
  let peak = process.memoryUsage().rss;
  const fetchImpl: typeof fetch = async (url, init) => {
    if (String(url) !== fixture.base.sourceInput.url) return normal.fetchImpl(url, init);
    const range = new Headers(init?.headers).get("range");
    const parts = range ? /bytes=(\d+)-(\d+)/.exec(range)! : null;
    let position = parts ? Number(parts[1]) : 0;
    const stop = parts ? Number(parts[2]) + 1 : fixture.size;
    return new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (position >= stop) {
              controller.close();
              return;
            }
            const take = Math.min(64 * 1024, stop - position);
            controller.enqueue(fixture.read(position, take));
            position += take;
            emitted += take;
            peak = Math.max(peak, process.memoryUsage().rss);
          },
        },
        { highWaterMark: 0 },
      ),
      {
        status: range ? 206 : 200,
        headers: {
          etag: '"immutable-large"',
          ...(range ? { "content-range": `bytes ${parts![1]}-${parts![2]}/${fixture.size}` } : {}),
        },
      },
    );
  };
  Bun.gc(true);
  const baseline = process.memoryUsage().rss;
  peak = baseline;
  const prepared = await prepareRemoteTargetBoundSnapshot({
    source: { ...fixture.base.sourceInput, checksumSha256: fixture.checksum },
    targetPreBackup: fixture.base.targetInput,
    fetchImpl,
  });
  const iterator = prepared.stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  expect(first.done).toBe(false);
  const stopped = emitted;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(emitted - stopped).toBeLessThanOrEqual(2 * 1024 * 1024);
  let total = first.value?.length ?? 0;
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    total += next.value.length;
  }
  expect(total).toBeGreaterThan(600 * 1024 * 1024);
  expect(peak - baseline).toBeLessThan(160 * 1024 * 1024);
}, 30_000);

test("central-directory CRC corruption, duplicate paths, encryption and oversized entries fail before import", async () => {
  const f = fixtures();
  const corrupt = (mutate: (view: DataView, offset: number) => void) => {
    const bytes = f.source.slice();
    const view = new DataView(bytes.buffer);
    let cursor = view.getUint32(bytes.length - 6, true);
    while (view.getUint32(cursor, true) === 0x02014b50) {
      const length = view.getUint16(cursor + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + length));
      if (name === "convexpress_siteIdentity/documents.jsonl") {
        mutate(view, cursor);
        break;
      }
      cursor += 46 + length + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    }
    return bytes;
  };
  const duplicated = zipSync({ ...unzipSync(f.source), "pasts/documents.jsonl": new Uint8Array() });
  const search = Buffer.from(duplicated.buffer, duplicated.byteOffset, duplicated.byteLength);
  for (
    let offset = search.indexOf("pasts/documents.jsonl");
    offset !== -1;
    offset = search.indexOf("pasts/documents.jsonl")
  ) {
    search.set(encoder.encode("posts/documents.jsonl"), offset);
  }
  for (const bytes of [
    corrupt((view, at) => view.setUint32(at + 16, 0, true)),
    corrupt((view, at) => view.setUint16(at + 8, view.getUint16(at + 8, true) | 1, true)),
    corrupt((view, at) => view.setUint32(at + 24, 0xffffffff, true)),
    duplicated,
  ])
    await expect(
      inspectRemoteConvexSnapshot({
        ...inspectInput,
        fetchImpl: remote({ [f.sourceInput.url]: bytes }).fetchImpl,
      }),
    ).rejects.toThrow();
});


test("a pre-rating-index snapshot explicitly clears newer target summaries instead of retaining stale ratings",async()=>{
 const f=fixtures(),targetFiles=unzipSync(f.target);
 targetFiles["commerce_review_ratings/documents.jsonl"]=jsonLine({_id:"stale",productId:"old-product",phase:"ready",counts:[0,0,0,0,999]});
 targetFiles["commerce_review_ratings/generated_schema.jsonl"]=jsonLine({schema:true});
    for(const table of ["commerce_product_sales","commerce_product_discovery"]){
      targetFiles[`${table}/documents.jsonl`]=jsonLine({_id:"stale-index",productId:"old-product"});
      targetFiles[`${table}/generated_schema.jsonl`]=jsonLine({schema:true});
    }
 const target=zipSync(targetFiles);
 const result=await prepareRemoteTargetBoundSnapshot({source:f.sourceInput,targetPreBackup:{...f.targetInput,checksumSha256:checksum(target)},fetchImpl:remote({[f.sourceInput.url]:f.source,[f.targetInput.url]:target}).fetchImpl});
 const chunks=[];for await(const chunk of result.stream)chunks.push(chunk);
 const files=unzipSync(Buffer.concat(chunks));
 expect(files["commerce_review_ratings/documents.jsonl"]).toBeDefined();expect(files["commerce_review_ratings/documents.jsonl"]?.length).toBe(0);
 expect(files["commerce_review_ratings/generated_schema.jsonl"]).toEqual(targetFiles["commerce_review_ratings/generated_schema.jsonl"]);
    for(const table of ["commerce_product_sales","commerce_product_discovery"]){
      expect(files[`${table}/documents.jsonl`]).toBeDefined();expect(files[`${table}/documents.jsonl`]?.length).toBe(0);
      expect(files[`${table}/generated_schema.jsonl`]).toEqual(targetFiles[`${table}/generated_schema.jsonl`]);
    }
});

test('production snapshot stream preserves same-instance RSVP state and operation receipts byte for byte',async()=>{
 const f=fixtures(),sourceFiles=unzipSync(f.source);
 const rows={
  event_rsvp_entries:{_id:'saved-entry',eventId:'saved-event',actorHash:'saved-actor',name:'Saved guest',email:'saved@example.invalid',status:'confirmed',revision:3,createdAt:1,updatedAt:3},
  event_rsvp_totals:{_id:'saved-total',eventId:'saved-event',confirmed:1,updatedAt:3},
  event_rsvp_operations:{_id:'saved-receipt',eventId:'saved-event',actorHash:'saved-actor',requestKey:'saved-request',fingerprint:'saved-fingerprint',receipt:{status:'confirmed',revision:3},createdAt:3},
  event_rsvp_rate_limits:{_id:'saved-rate',eventId:'saved-event',windowStart:1,accepted:2,updatedAt:3},
 };
 for(const [table,row] of Object.entries(rows)){sourceFiles[`${table}/documents.jsonl`]=jsonLine(row);sourceFiles[`${table}/generated_schema.jsonl`]=jsonLine({schema:true});}
 const source=zipSync(sourceFiles),target=snapshot({instanceKey:f.sourceInput.identity.instanceKey,environmentKind:'staging',marker:'current'});
 const result=await prepareRemoteTargetBoundSnapshot({source:{...f.sourceInput,checksumSha256:checksum(source)},targetPreBackup:{...f.targetInput,checksumSha256:checksum(target),identity:f.sourceInput.identity},fetchImpl:remote({[f.sourceInput.url]:source,[f.targetInput.url]:target}).fetchImpl});
 const chunks=[];for await(const chunk of result.stream)chunks.push(chunk);const restored=unzipSync(Buffer.concat(chunks));
 for(const table of Object.keys(rows)){expect(restored[`${table}/documents.jsonl`]).toEqual(sourceFiles[`${table}/documents.jsonl`]);expect(restored[`${table}/generated_schema.jsonl`]).toEqual(sourceFiles[`${table}/generated_schema.jsonl`]);}
});

const reusableDerivedTables = ["syncedBlockConsumers", "syncedBlockConsumerIndex", "syncedBlockConsumerDirty", "syncedBlockRefreshJobs", "syncedBlockRefreshFailures"];
async function reusableRestoreFixture(options: { same?: boolean; foreign?: boolean; legacy?: boolean; buffered?: boolean } = {}) {
 const f=fixtures(),sourceFiles=unzipSync(f.source),targetFiles=unzipSync(f.target);
 const sourceIdentity=JSON.parse(new TextDecoder().decode(sourceFiles['convexpress_siteIdentity/documents.jsonl']!));
 const targetIdentity={...sourceIdentity,_id:'target-identity',websiteKey:options.same?sourceIdentity.websiteKey:'website-another-client',instanceKey:options.same?sourceIdentity.instanceKey:'another-client-live',environmentKind:options.same?'staging':'live',deploymentOrigin:options.same?sourceIdentity.deploymentOrigin:'https://another-client.convex.cloud'};
 targetFiles['convexpress_siteIdentity/documents.jsonl']=jsonLine(targetIdentity);
 const head={_id:'shared-head',_creationTime:1,websiteKey:sourceIdentity.websiteKey,instanceKey:options.foreign?'foreign-instance':sourceIdentity.instanceKey,deploymentOrigin:sourceIdentity.deploymentOrigin,title:'Shared inquiry',generation:7,lastRevision:2,publishedRevision:1,refreshJobId:'old-job',createdBy:'author',updatedBy:'author',createdAt:1,updatedAt:2};
 const version={_id:'immutable-revision',syncedBlockId:head._id,revision:1,title:head.title,blocks:[{id:'nested',name:'core/synced',version:1,attrs:{syncedBlock:'nested-head',revisionPolicy:'pinned',revision:1}}],digest:'immutable-digest',createdBy:'author',createdAt:1,publishedAt:2};
 const answer={_id:'answer',entityType:'form_submission',entityId:'entry',fieldKey:'message',fieldName:'message',value:'Original answer',formFieldSnapshot:{label:'Project details',type:'textarea'},updatedBy:'guest',updatedAt:1};
 for(const [table,row] of Object.entries({syncedBlocks:head,syncedBlockRevisions:version,fieldValues:answer,...Object.fromEntries(reusableDerivedTables.map(t=>[t,{_id:'derived-'+t,sourceId:head._id,authority:{kind:'management',sessionId:'source-session'},status:'pending',cursor:'old-cursor'}]))})){
  targetFiles[`${table}/documents.jsonl`]=jsonLine({...row,_id:'old-target-'+table});targetFiles[`${table}/generated_schema.jsonl`]=jsonLine({schema:true});
  if(!options.legacy){sourceFiles[`${table}/documents.jsonl`]=jsonLine(row);sourceFiles[`${table}/generated_schema.jsonl`]=jsonLine({schema:true});}
 }
 const source=zipSync(sourceFiles),target=zipSync(targetFiles);
 if(options.buffered){
  const restored=await prepareTargetBoundSnapshot({sourceBytes:source,sourceChecksumSha256:checksum(source),sourceSnapshotId:f.sourceInput.snapshotId,sourceIdentity:f.sourceInput.identity,targetPreBackupBytes:target,targetPreBackupChecksumSha256:checksum(target),targetPreBackupSnapshotId:f.targetInput.snapshotId,targetIdentity:{websiteKey:targetIdentity.websiteKey,instanceKey:targetIdentity.instanceKey,environmentKind:targetIdentity.environmentKind}});
  return {files:unzipSync(restored.bytes),sourceFiles,head,version,answer,targetIdentity};
 }
 const result=await prepareRemoteTargetBoundSnapshot({source:{...f.sourceInput,checksumSha256:checksum(source)},targetPreBackup:{...f.targetInput,checksumSha256:checksum(target),identity:{websiteKey:targetIdentity.websiteKey,instanceKey:targetIdentity.instanceKey,environmentKind:targetIdentity.environmentKind}},fetchImpl:remote({[f.sourceInput.url]:source,[f.targetInput.url]:target}).fetchImpl});
 const chunks=[];for await(const chunk of result.stream)chunks.push(chunk);
 return {files:unzipSync(Buffer.concat(chunks)),sourceFiles,head,version,answer,targetIdentity};
}
for(const same of [false,true])test(`production snapshot ${same?'restore':'clone'} rebinds reusable heads and discards captured refresh authority`,async()=>{
 const f=await reusableRestoreFixture({same});
 const {refreshJobId,...saved}=f.head;
 expect(JSON.parse(new TextDecoder().decode(f.files['syncedBlocks/documents.jsonl']))).toEqual({...saved,websiteKey:f.targetIdentity.websiteKey,instanceKey:f.targetIdentity.instanceKey,deploymentOrigin:f.targetIdentity.deploymentOrigin});
 for(const table of reusableDerivedTables)expect(f.files[`${table}/documents.jsonl`]?.length).toBe(0);
 for(const table of ['syncedBlockRevisions','fieldValues'])expect(f.files[`${table}/documents.jsonl`]).toEqual(f.sourceFiles[`${table}/documents.jsonl`]);
});
test('production snapshot refuses a foreign reusable head instead of adopting it into the target',async()=>{
 await expect(reusableRestoreFixture({foreign:true})).rejects.toThrow('Reusable source does not belong to the snapshot identity');
});
test('pre-reusable snapshot explicitly empties newer target reusable tables',async()=>{
 const f=await reusableRestoreFixture({legacy:true});
 for(const table of ['syncedBlocks','syncedBlockRevisions',...reusableDerivedTables]){expect(f.files[`${table}/documents.jsonl`]).toBeDefined();expect(f.files[`${table}/documents.jsonl`]?.length).toBe(0);}
});

test('buffered and streaming reusable restore policies agree for clone, same-site restore and older archives',async()=>{
 for(const options of [{},{same:true},{legacy:true}]){
  const streamed=await reusableRestoreFixture(options),buffered=await reusableRestoreFixture({...options,buffered:true});
  for(const table of ['syncedBlocks','syncedBlockRevisions',...reusableDerivedTables])expect(buffered.files[`${table}/documents.jsonl`]).toEqual(streamed.files[`${table}/documents.jsonl`]);
 }
 await expect(reusableRestoreFixture({buffered:true,foreign:true})).rejects.toThrow('Reusable source does not belong to the snapshot identity');
});
