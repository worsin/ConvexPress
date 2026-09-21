"use node";
import { makeFunctionReference as ref, type RegisteredAction } from "convex/server";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { JobArgs, LeaseArgs } from "./searchJobs";
import { decryptSettingSecret } from "../helpers/settingsSecret";
import { fetchSearchProvider, readSearchProviderJson } from "./searchProviderHttp";
import { indexedDocument, removalFilter, settingsReceipt } from "./searchReconciliationProof";
import { parseMeilisearchTask } from "./meilisearchTasks";

type Claimed = Doc<"kb_search_jobs"> & { encryptedKey: string };
export const advance: RegisteredAction<"internal", JobArgs, null> = internalAction({
  args: { jobId: v.id("kb_search_jobs"), generation: v.number() }, returns: v.null(),
  handler: async (ctx: ActionCtx, args: JobArgs) => {
    const job = await ctx.runMutation(ref<"mutation", JobArgs, Claimed | null>("kb/searchJobs:claim"), args);
    if (!job) return null;
    const lease: LeaseArgs = { ...args, lease: job.lease };
    const record = (result: "ready" | "pending" | "succeeded" | "failed" | "uncertain") => ctx.runMutation(ref<"mutation", LeaseArgs & { result: typeof result }, null>("kb/searchJobs:record"), { ...lease, result });
    let submitting = false;
    try {
      const key = await decryptSettingSecret(job.encryptedKey);
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      const base = job.providerUrl.replace(/\/$/, ""), index = `${base}/indexes/${job.indexName}`;
      if (job.phase === "settingsPoll" || job.phase === "documentPoll") {
        if (job.taskUid === undefined) { await record("uncertain"); return null; }
        const response = await fetchSearchProvider(`${base}/tasks/${job.taskUid}`, { headers });
        if (!response.ok) { await response.body?.cancel(); await record("pending"); return null; }
        const task = parseMeilisearchTask(await readSearchProviderJson(response), job.indexName, job.taskUid);
        await record(task.status === "succeeded" ? "succeeded" : ["failed", "canceled"].includes(task.status) ? "failed" : "pending"); return null;
      }
      let endpoint: string, method: string, body: string | undefined;
      if (job.phase === "settings") {
        endpoint = `${index}/settings/filterable-attributes`;
        const response = await fetchSearchProvider(endpoint, { headers });
        let attributes: string[] = [];
        if (response.ok) {
          const raw = await readSearchProviderJson(response);
          if (!Array.isArray(raw) || raw.some(value => typeof value !== "string")) { await record("failed"); return null; }
          attributes = raw;
        } else if (response.status === 404) await response.body?.cancel();
        else { await response.body?.cancel(); await record("pending"); return null; }
        const required = job.receiptVersion === 1 ? ["status", "categorySlug", "id"] : ["status", "categorySlug"];
        if (required.every(value => attributes.includes(value))) { await record("ready"); return null; }
        method = "PUT"; body = JSON.stringify([...new Set([...attributes, ...required, ...(job.receiptVersion === 1 ? [settingsReceipt(job)] : [])])]);
      } else if (job.phase === "document") {
        endpoint = job.operation === "sync" ? `${index}/documents` : `${index}/documents/${encodeURIComponent(job.articleId)}`;
        method = job.operation === "sync" ? "POST" : "DELETE";
        if (job.operation === "sync") { if (!job.document) { await record("failed"); return null; } body = JSON.stringify([indexedDocument(job)]); }
        else if (job.receiptVersion === 1) { endpoint = `${index}/documents/delete`; method = "POST"; body = JSON.stringify({ filter: removalFilter(job) }); }
      } else return null;
      if (!await ctx.runMutation(ref<"mutation", LeaseArgs, boolean>("kb/searchJobs:submitting"), lease)) return null;
      submitting = true;
      const response = await fetchSearchProvider(endpoint, { method, headers, body });
      if (response.status === 404 && job.operation === "remove" && job.phase === "document") { await response.body?.cancel(); await record("succeeded"); return null; }
      if (!response.ok) { await response.body?.cancel(); await record(response.status >= 500 ? "uncertain" : "failed"); return null; }
      const task = parseMeilisearchTask(await readSearchProviderJson(response), job.indexName);
      await ctx.runMutation(ref<"mutation", LeaseArgs & { taskUid: number }, null>("kb/searchJobs:acknowledge"), { ...lease, taskUid: task.uid });
    } catch {
      // Read retries preserve phase/taskUid. Unknown write results remain fenced.
      await record(submitting ? "uncertain" : "pending");
    }
    return null;
  },
});
