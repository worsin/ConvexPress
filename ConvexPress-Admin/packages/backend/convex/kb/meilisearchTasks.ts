import { ConvexError } from "convex/values";
import { fetchSearchProvider, readSearchProviderJson } from "./searchProviderHttp";

export type MeilisearchConnection = { url: string; apiKey: string; indexName: string };
type Task = { uid: number; status: "enqueued" | "processing" | "succeeded" | "failed" | "canceled" };
function invalid(): never {
  throw new ConvexError({ code: "INVALID_SEARCH_PROVIDER_RESPONSE", message: "Meilisearch returned an invalid task response." });
}
export function parseMeilisearchTask(raw: unknown, indexName: string, expectedUid?: number): Task {
  if (!raw || typeof raw !== "object") return invalid();
  const value = raw as Record<string, unknown>;
  const uid = expectedUid === undefined ? value.taskUid : value.uid;
  if (typeof uid !== "number" || !Number.isSafeInteger(uid) || uid < 0 || (expectedUid !== undefined && uid !== expectedUid) || value.indexUid !== indexName) return invalid();
  if (!["enqueued", "processing", "succeeded", "failed", "canceled"].includes(String(value.status))) return invalid();
  return { uid, status: value.status as Task["status"] };
}

/** Observe the acknowledged task; never submit another write because observation
 * takes too long. A pending response must not set the article's synced flag. */
export async function confirmMeilisearchTask(connection: MeilisearchConnection, response: Response, authorize: () => Promise<unknown>, options: { deadlineMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<number> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ConvexError({ code: "SYNC_ERROR", message: `Meilisearch rejected the request (${response.status}).` });
  }
  let task = parseMeilisearchTask(await readSearchProviderJson(response), connection.indexName);
  const deadline = Date.now() + (options.deadlineMs ?? 30_000);
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  // Always inspect the full task, even if a malformed acknowledgement claims success.
  while (true) {
    await authorize();
    const result = await fetchSearchProvider(`${connection.url.replace(/\/$/, "")}/tasks/${task.uid}`, { headers: { Authorization: `Bearer ${connection.apiKey}` } });
    if (!result.ok) {
      await result.body?.cancel();
      throw new ConvexError({ code: "SYNC_STATUS_UNAVAILABLE", taskUid: task.uid, message: `Meilisearch task status could not be read (${result.status}). Completion is unconfirmed.` });
    }
    task = parseMeilisearchTask(await readSearchProviderJson(result), connection.indexName, task.uid);
    if (task.status === "succeeded") return task.uid;
    if (task.status === "failed" || task.status === "canceled") throw new ConvexError({ code: "SYNC_ERROR", taskUid: task.uid, message: `Meilisearch task ${task.status}. The article has not been marked synced.` });
    if (Date.now() >= deadline) throw new ConvexError({ code: "SYNC_PENDING", taskUid: task.uid, message: "Meilisearch is still processing this task. Completion is unconfirmed; the request was not resubmitted." });
    await sleep(Math.min(500, Math.max(0, deadline - Date.now())));
  }
}

/** Settings updates create a missing index. Confirm their task before sending
 * documents, so a freshly provisioned site can use status/category filters. */
export async function ensureMeilisearchFilters(connection: MeilisearchConnection, authorize: () => Promise<unknown>) {
  await authorize();
  const endpoint = `${connection.url.replace(/\/$/, "")}/indexes/${connection.indexName}/settings/filterable-attributes`;
  const headers = { Authorization: `Bearer ${connection.apiKey}`, "Content-Type": "application/json" };
  const response = await fetchSearchProvider(endpoint, { headers });
  let attributes: string[] = [];
  if (response.ok) {
    const raw = await readSearchProviderJson(response);
    if (!Array.isArray(raw) || raw.some(value => typeof value !== "string")) return invalid();
    attributes = raw;
  } else if (response.status === 404) await response.body?.cancel();
  else {
    await response.body?.cancel();
    throw new ConvexError({ code: "SYNC_ERROR", message: `Meilisearch index settings could not be read (${response.status}).` });
  }
  if (["status", "categorySlug"].every(name => attributes.includes(name))) return;
  await authorize();
  await confirmMeilisearchTask(connection, await fetchSearchProvider(endpoint, {
    method: "PUT", headers, body: JSON.stringify([...new Set([...attributes, "status", "categorySlug"])]),
  }), authorize);
}
