import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";
import type { Doc } from "../_generated/dataModel";
import { parseMeilisearchTask } from "./meilisearchTasks";

type Job = Doc<"kb_search_jobs">;
export function receipt(job: Pick<Job, "_id" | "indexName" | "generation" | "operation">): string {
  return sha256Hex(canonicalJson({ jobId: job._id, index: job.indexName, generation: job.generation, operation: job.operation }));
}
export const receiptField = "_convexpressReceipt";
export function settingsReceipt(job: Job): string { return `_convexpress_receipt_${receipt(job)}`; }
export function removalFilter(job: Job): string {
  // The second clause preserves the exact article selection and gives this
  // request a unique, provider-retained originalFilter in the task journal.
  return `id = ${JSON.stringify(job.articleId)} AND id != ${JSON.stringify(`convexpress_receipt_${receipt(job)}`)}`;
}
export function indexedDocument(job: Job): Record<string, unknown> {
  if (!job.document) throw new Error("Missing article snapshot");
  const document: unknown = JSON.parse(job.document);
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Invalid article snapshot");
  return { ...document, ...(job.receiptVersion === 1 ? { [receiptField]: receipt(job) } : {}) };
}
export function provesIndexedDocument(job: Job, value: unknown): boolean {
  return job.receiptVersion === 1 && job.operation === "sync" && job.phase === "documentSubmitting" && !!job.document && canonicalJson(value) === canonicalJson(indexedDocument(job));
}
export function findReceiptTask(job: Job, raw: unknown): { taskUid?: number; next: number | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid task page");
  const page = raw as Record<string, unknown>;
  if (!Array.isArray(page.results) || page.results.length > 50 || !(page.next === null || (typeof page.next === "number" && Number.isSafeInteger(page.next) && page.next >= 0))) throw new Error("Invalid task page");
  if (typeof page.next === "number" && job.reconciliationCursor !== undefined && page.next >= job.reconciliationCursor) throw new Error("Task cursor did not advance");
  const matches: number[] = [];
  const seen = new Set<number>();
  for (const rawTask of page.results) {
    if (!rawTask || typeof rawTask !== "object" || Array.isArray(rawTask)) throw new Error("Invalid task");
    const task = rawTask as Record<string, unknown>;
    if (typeof task.uid !== "number") throw new Error("Invalid task UID");
    parseMeilisearchTask(task, job.indexName, task.uid);
    if (seen.has(task.uid) || (job.reconciliationCursor !== undefined && task.uid > job.reconciliationCursor)) throw new Error("Invalid task ordering");
    seen.add(task.uid);
    const details = task.details;
    if (!details || typeof details !== "object" || Array.isArray(details)) continue;
    const data = details as Record<string, unknown>;
    const settingsMatch = job.phase === "settingsSubmitting" && task.type === "settingsUpdate" && Array.isArray(data.filterableAttributes) && data.filterableAttributes.includes(settingsReceipt(job));
    const removalMatch = job.phase === "documentSubmitting" && job.operation === "remove" && task.type === "documentDeletion" && data.originalFilter === removalFilter(job);
    if (job.receiptVersion === 1 && (settingsMatch || removalMatch)) matches.push(task.uid);
  }
  if (typeof page.next === "number" && (seen.size === 0 || page.next >= Math.min(...seen))) throw new Error("Task cursor did not advance");
  if (matches.length > 1) throw new Error("Ambiguous receipt");
  return { taskUid: matches[0], next: page.next as number | null };
}
