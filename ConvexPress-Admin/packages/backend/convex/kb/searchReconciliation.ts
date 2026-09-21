"use node";
import { makeFunctionReference as ref, type RegisteredAction } from "convex/server";
import { v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { searchJobStatusValidator, type SearchJobStatus } from "./searchJobs";
import { decryptSettingSecret } from "../helpers/settingsSecret";
import { fetchSearchProvider, readSearchProviderJson } from "./searchProviderHttp";
import { findReceiptTask, provesIndexedDocument } from "./searchReconciliationProof";
type Job = Doc<"kb_search_jobs"> & { encryptedKey: string };
type Result = { jobId: Id<"kb_search_jobs">; generation: number; lease: number; phase: Job["phase"]; cursor?: number; taskUid?: number; documentObserved?: boolean; next?: number };
export const reconcile: RegisteredAction<"public", { jobId: Id<"kb_search_jobs"> }, SearchJobStatus | null> = action({
  args: { jobId: v.id("kb_search_jobs") }, returns: v.union(v.null(), searchJobStatusValidator),
  handler: async (ctx: ActionCtx, args: { jobId: Id<"kb_search_jobs"> }) => {
    const job = await ctx.runMutation(ref<"mutation", typeof args, Job | null>("kb/searchJobs:prepareReconciliation"), args);
    if (job) {
      const key = await decryptSettingSecret(job.encryptedKey);
      const headers = { Authorization: `Bearer ${key}` };
      const base = job.providerUrl.replace(/\/$/, "");
      const result: Result = { jobId: job._id, generation: job.generation, lease: job.lease, phase: job.phase, cursor: job.reconciliationCursor };
      if (job.phase === "documentSubmitting" && job.operation === "sync") {
        const response = await fetchSearchProvider(`${base}/indexes/${job.indexName}/documents/${encodeURIComponent(job.articleId)}`, { headers });
        if (response.ok) result.documentObserved = provesIndexedDocument(job, await readSearchProviderJson(response));
        else { await response.body?.cancel(); if (response.status !== 404) throw new Error("The provider receipt could not be read. The operation remains held."); }
      } else {
        const params = new URLSearchParams({ indexUids: job.indexName, types: job.phase === "settingsSubmitting" ? "settingsUpdate" : "documentDeletion", limit: "50" });
        if (job.reconciliationCursor !== undefined) params.set("from", String(job.reconciliationCursor));
        const response = await fetchSearchProvider(`${base}/tasks?${params}`, { headers });
        if (!response.ok) { await response.body?.cancel(); throw new Error("Provider task history is unavailable. The operation remains held."); }
        const found = findReceiptTask(job, await readSearchProviderJson(response));
        result.taskUid = found.taskUid; result.next = found.next ?? undefined;
      }
      await ctx.runMutation(ref<"mutation", Result, null>("kb/searchJobs:finishReconciliation"), result);
    }
    return ctx.runQuery(ref<"query", typeof args, SearchJobStatus | null>("kb/searchJobs:status"), args);
  },
});
