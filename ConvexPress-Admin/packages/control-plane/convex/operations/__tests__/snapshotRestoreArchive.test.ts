import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";
import { unzipSync, zipSync } from "fflate";

import {
  MANAGEMENT_TABLES_PRESERVED_ON_IMPORT,
  prepareTargetBoundSnapshot,
} from "../snapshotRestoreArchive";

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
    "media_epoch_claim/documents.jsonl": jsonLine({ key: "active", phase: "dispatched", marker: input.marker }),
    "media_epoch_claim/generated_schema.jsonl": jsonLine({ schema: true }),
    "_tables/documents.jsonl": jsonLine({ name: "posts" }),
    "_storage/documents.jsonl": new Uint8Array(),
    "convexpress_siteIdentity/documents.jsonl": jsonLine(identity),
    "convexpress_siteIdentity/generated_schema.jsonl": jsonLine({ schema: true }),
    "posts/documents.jsonl": jsonLine({ _id: `post-${input.marker}`, title: input.marker }),
    "posts/generated_schema.jsonl": jsonLine({ schema: true }),
    "extension_events/generated_schema.jsonl": jsonLine({ schema: true }),
    "extension_events/documents.jsonl": jsonLine({_id:`event-${input.marker}`,startsAt:1000,endsAt:2000,calendarBucket:"stale-imported-key",title:input.marker}),
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

describe("target-bound snapshot preparation", () => {
  test("copies content, preserves target authorities, and resets target sessions", async () => {
    const source = snapshot({
      instanceKey: "northstar-staging",
      environmentKind: "staging",
      marker: "source",
    });
    let target = snapshot({
      instanceKey: "northstar-live",
      environmentKind: "live",
      marker: "target",
    });
    const targetFiles=unzipSync(target);
    targetFiles["commerce_review_ratings/documents.jsonl"]=jsonLine({_id:"stale",productId:"old",phase:"ready",counts:[0,0,0,0,999]});
    targetFiles["commerce_review_ratings/generated_schema.jsonl"]=jsonLine({schema:true});
    for(const table of ["commerce_product_sales","commerce_product_discovery"]){
      targetFiles[`${table}/documents.jsonl`]=jsonLine({_id:"stale-index",productId:"old-product"});
      targetFiles[`${table}/generated_schema.jsonl`]=jsonLine({schema:true});
    }
    target=zipSync(targetFiles);
    const result = await prepareTargetBoundSnapshot({
      sourceBytes: source,
      sourceChecksumSha256: checksum(source),
      sourceSnapshotId: "snapshot-source",
      sourceIdentity: {
        websiteKey: "website-northstar",
        instanceKey: "northstar-staging",
        environmentKind: "staging",
      },
      targetPreBackupBytes: target,
      targetPreBackupChecksumSha256: checksum(target),
      targetPreBackupSnapshotId: "snapshot-target-prebackup",
      targetIdentity: {
        websiteKey: "website-northstar",
        instanceKey: "northstar-live",
        environmentKind: "live",
      },
    });
    const files = unzipSync(result.bytes);
    expect(files["commerce_review_ratings/documents.jsonl"]).toBeDefined();
    expect(files["commerce_review_ratings/documents.jsonl"]?.length).toBe(0);
    expect(files["commerce_review_ratings/generated_schema.jsonl"]).toEqual(targetFiles["commerce_review_ratings/generated_schema.jsonl"]);
    for(const table of ["commerce_product_sales","commerce_product_discovery"]){
      expect(files[`${table}/documents.jsonl`]).toBeDefined();expect(files[`${table}/documents.jsonl`]?.length).toBe(0);
      expect(files[`${table}/generated_schema.jsonl`]).toEqual(targetFiles[`${table}/generated_schema.jsonl`]);
    }
    expect(JSON.parse(new TextDecoder().decode(files["extension_events/documents.jsonl"]))).toEqual({_id:"event-source",startsAt:1000,endsAt:2000,title:"source"});

    expect(new TextDecoder().decode(files["posts/documents.jsonl"])).toContain(
      "source",
    );
    for (const table of [
      "convexpress_siteIdentity",
      "convexpress_managementAuthorities",
      "media_epoch_import_receipts",
    ]) {
      expect(
        new TextDecoder().decode(files[`${table}/documents.jsonl`]),
      ).toContain("target");
    }
    const bindings = JSON.parse(
      new TextDecoder()
        .decode(files["convexpress_managementBindings/documents.jsonl"])
        .trim(),
    );
    expect(bindings.userId).toBeUndefined();
    expect(bindings.syntheticOperatorId).toBe(
      "controller:controller-target:key-target",
    );
    expect(
      new TextDecoder().decode(
        files["convexpress_managementBindings/documents.jsonl"],
      ),
    ).toContain('"capabilityRevision":1.0');
    expect(
      files["convexpress_managementSessions/documents.jsonl"],
    ).toHaveLength(0);
    expect(
      files["convexpress_managementNonces/documents.jsonl"],
    ).toHaveLength(0);
    expect(files["media_epoch_claim/documents.jsonl"]).toHaveLength(0);
    expect(result.checksumSha256).toBe(checksum(result.bytes));
    expect(result.preservedTables).toEqual([
      ...MANAGEMENT_TABLES_PRESERVED_ON_IMPORT,
    ]);
  });

  test("rejects either artifact when its immutable checksum changed", async () => {
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
    await expect(
      prepareTargetBoundSnapshot({
        sourceBytes: source,
        sourceChecksumSha256: "0".repeat(64),
        sourceSnapshotId: "snapshot-source",
        sourceIdentity: {
          websiteKey: "website-northstar",
          instanceKey: "northstar-staging",
          environmentKind: "staging",
        },
        targetPreBackupBytes: target,
        targetPreBackupChecksumSha256: checksum(target),
        targetPreBackupSnapshotId: "snapshot-target-prebackup",
        targetIdentity: {
          websiteKey: "website-northstar",
          instanceKey: "northstar-live",
          environmentKind: "live",
        },
      }),
    ).rejects.toThrow("checksum");
  });
});

test('same-environment restore retains RSVP entries, capacity, retry receipts and rate state together',async()=>{
 const identity={websiteKey:'website-northstar',instanceKey:'northstar-live',environmentKind:'live' as const};
 const files=unzipSync(snapshot({instanceKey:identity.instanceKey,environmentKind:'live',marker:'rsvp-backup'}));
 const rows={
  event_rsvp_entries:{_id:'entry-at-backup',eventId:'event-rsvp-backup',actorHash:'bound-actor',name:'Backup guest',email:'backup@example.invalid',status:'confirmed',revision:3,createdAt:1,updatedAt:3},
  event_rsvp_totals:{_id:'total-at-backup',eventId:'event-rsvp-backup',confirmed:1,updatedAt:3},
  event_rsvp_operations:{_id:'operation-at-backup',eventId:'event-rsvp-backup',actorHash:'bound-actor',requestKey:'request-at-backup',fingerprint:'bound-payload',receipt:{status:'confirmed',revision:3},createdAt:3},
  event_rsvp_rate_limits:{_id:'rate-at-backup',eventId:'event-rsvp-backup',windowStart:1,accepted:2,updatedAt:3},
 };
 for(const [table,row] of Object.entries(rows)){files[`${table}/documents.jsonl`]=jsonLine(row);files[`${table}/generated_schema.jsonl`]=jsonLine({schema:true});}
 const source=zipSync(files),preBackup=snapshot({instanceKey:identity.instanceKey,environmentKind:'live',marker:'current-target'});
 const restored=await prepareTargetBoundSnapshot({sourceBytes:source,sourceChecksumSha256:checksum(source),sourceSnapshotId:'rsvp-backup',sourceIdentity:identity,targetPreBackupBytes:preBackup,targetPreBackupChecksumSha256:checksum(preBackup),targetPreBackupSnapshotId:'before-rsvp-restore',targetIdentity:identity});
 const unpacked=unzipSync(restored.bytes);
 for(const [table,row] of Object.entries(rows))expect(JSON.parse(new TextDecoder().decode(unpacked[`${table}/documents.jsonl`]))).toEqual(row);
 const event=JSON.parse(new TextDecoder().decode(unpacked['extension_events/documents.jsonl']));expect(event._id).toBe(rows.event_rsvp_entries.eventId);expect(event.calendarBucket).toBeUndefined();
});
