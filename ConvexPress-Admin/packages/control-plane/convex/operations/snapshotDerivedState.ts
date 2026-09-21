/** Older snapshots must explicitly clear newer target rating summaries. */
const reusableDerivedTables = ["syncedBlockConsumers", "syncedBlockConsumerIndex", "syncedBlockConsumerDirty", "syncedBlockRefreshJobs", "syncedBlockRefreshFailures"] as const;
export const DERIVED_EMPTY_ON_MISSING_SOURCE = ["commerce_review_ratings", "commerce_product_sales", "commerce_product_discovery", "syncedBlocks", "syncedBlockRevisions", ...reusableDerivedTables] as const;
type SnapshotScope = { websiteKey: string; instanceKey: string; deploymentOrigin: string };
export type SnapshotRebinding = { source: SnapshotScope; target: SnapshotScope };
/** Call only with identities from checksum-verified, inspected archives. */
export function snapshotScope(row: Record<string, unknown>): SnapshotScope {
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"])
    if (typeof row[key] !== "string" || !row[key]) throw new Error("Snapshot reusable scope is invalid");
  return { websiteKey: row.websiteKey as string, instanceKey: row.instanceKey as string, deploymentOrigin: row.deploymentOrigin as string };
}
/** These values are rebuilt from authored source rows by target-local recovery.
 * Keep the policy shared by buffered fixtures and the production stream path. */
const fields: Record<string, readonly string[]> = {
  extension_events: ["calendarBucket"],
  termRelationships: ["discoveryReady", "discoveryEligible", "discoveryPublishedAt", "discoveryAuthorId"],
  terms: ["countReady", "countState"],
  users: ["postCount", "postCountReady"],
  authorPostCounts: [],
  forms: ["submissionCountReady"],
  formSubmissionCounts: [],
  commerce_review_ratings: [],
  commerce_product_sales: [],
  commerce_product_discovery: [],
  commerce_products: ["saleIndexVersion", "collectionIndexVersion"],
  form_poll_rate_limits: [],
  membership_enrollment_repairs: [],
  syncedBlocks: [],
  ...Object.fromEntries(reusableDerivedTables.map(table => [table, []])),
};
export function derivedSnapshotTable(path: string): string | null {
  const match = /^([^/]+)\/documents\.jsonl$/.exec(path);
  return match && Object.prototype.hasOwnProperty.call(fields, match[1]!) ? match[1]! : null;
}
export function resetDerivedSnapshotRow(table: string, row: Record<string, unknown>, rebinding?: SnapshotRebinding): Record<string, unknown> | null {
  if (reusableDerivedTables.some(name => name === table)) return null;
  if (table === "syncedBlocks") {
    if (!rebinding) throw new Error("Snapshot reusable scope rebinding is required");
    for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const)
      if (row[key] !== rebinding.source[key]) throw new Error("Reusable source does not belong to the snapshot identity");
    // Immutable revisions and their IDs stay untouched. Old captured publisher
    // authority/cursors are discarded; target-local recovery rebuilds discovery.
    const { refreshJobId: _job, ...authored } = row;
    return { ...authored, ...rebinding.target };
  }
  if (table === "commerce_product_sales" || table === "commerce_product_discovery") return null;
  if (table === "authorPostCounts" || table === "formSubmissionCounts" || table === "form_poll_rate_limits") return null;
  if (table === "commerce_review_ratings") {
    return { _id:row._id,...(row._creationTime!==undefined?{_creationTime:row._creationTime}:{}),productId:row.productId,
      phase:"pending",generation:typeof row.generation==="number"?row.generation+1:0,counts:[0,0,0,0,0],updatedAt:0,
      frontierTime:null,frontierId:null,horizonTime:null,horizonId:null };
  }
  // Keep durable work, discard the previous target's cursor and generation.
  if (table === "membership_enrollment_repairs") {
    const { lastError: _error, ...saved } = row;
    return { ...saved, version: typeof row.version === "number" ? row.version + 1 : 0,
      afterTime: null, afterId: null, horizonTime: null, horizonId: null, restart: true, attempts: 0, nextRetryAt: 0 };
  }
  const omitted = fields[table] ?? [];
  return Object.fromEntries(Object.entries(row).filter(([key]) => !omitted.includes(key)));
}
/** Convex snapshot numeric literals are floats; int64/special floats have tags. */
export function convexSnapshotJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return Object.is(value, -0) ? "-0.0" : Number.isInteger(value) ? `${value}.0` : String(value);
  if (Array.isArray(value)) return `[${value.map(convexSnapshotJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}:${convexSnapshotJson(item)}`).join(",")}}`;
  throw new Error("Snapshot row contains an unsupported value");
}
/** One bounded JSON row is retained, even when a table exceeds metadata limits. */
export async function* resetDerivedSnapshotStream(table: string, source: AsyncIterable<Uint8Array>, rebinding?: SnapshotRebinding): AsyncGenerator<Uint8Array> {
  const decoder = new TextDecoder("utf-8", {fatal:true}), encoder = new TextEncoder();
  const maximum = 1024 * 1024;
  let pending = "";
  function transform(line: string): Uint8Array | null {
    if (encoder.encode(line).byteLength > maximum) throw new Error("Snapshot derived-state row exceeds 1 MiB");
    if (!line.trim()) return null;
    const row: unknown = JSON.parse(line);
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Snapshot contains an invalid derived-state row");
    const result = resetDerivedSnapshotRow(table, row as Record<string, unknown>, rebinding);
    return result ? encoder.encode(`${convexSnapshotJson(result)}\n`) : null;
  }
  for await (const chunk of source) {
    pending += decoder.decode(chunk, {stream:true});
    let boundary: number;
    while ((boundary = pending.indexOf("\n")) !== -1) {
      const output = transform(pending.slice(0,boundary));
      pending = pending.slice(boundary+1);
      if (output) yield output;
    }
    if (pending.length > maximum) throw new Error("Snapshot derived-state row exceeds 1 MiB");
  }
  pending += decoder.decode();
  const output = transform(pending);
  if (output) yield output;
}
