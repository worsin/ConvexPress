import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { assistantScope } from "./scope";
import { resolveThread } from "./history";
import { ensureSessionDoc, appendMessageToSession } from "./mutations";
import { productIdsInBlocks } from "./blocks";
import { assistantBlockValidator } from "../../schema/commerceAssistant";
import { patchDynamicWithMediaReferences } from "../../media/attachmentGuard";

// Convex actions have a ten-minute maximum lifetime. An interrupted execution
// is never re-claimed: a cart write may have committed before its reply was lost.
const INTERRUPTION_MS = 11 * 60_000;
const emptyResult = () => ({ messageId: null, blocks: [], productIds: [] });
const resultValidator = v.object({ messageId: v.union(v.string(), v.null()), blocks: v.array(assistantBlockValidator), productIds: v.array(v.string()) });
const interruptedBlocks = [{ type: "callout", tone: "warning", markdown: "This request was interrupted. Check your cart before sending a new request; retrying this request will not repeat its actions." }];

async function receipt(ctx: any, request: any) {
  if (!request.resultMessageId) return emptyResult();
  const message = await ctx.db.get("commerce_assistant_messages", request.resultMessageId);
  if (!message) return emptyResult();
  const origin = await ctx.db.get("commerce_assistant_sessions", message.sessionId);
  if (!origin || (message.adoptedAt ?? message.createdAt) <= (origin.clearedBefore ?? 0)) return emptyResult();
  const resolved = await resolveThread(ctx, origin);
  if (Math.max(message.adoptedAt ?? message.createdAt, resolved.adoptedAt) <= (resolved.session.clearedBefore ?? 0)) return emptyResult();
  return { messageId: String(message._id), blocks: message.blocks, productIds: productIdsInBlocks(message.blocks) };
}

async function finish(ctx: any, request: any, args: any, interrupted = false) {
  if (request.state !== "running") return receipt(ctx, request);
  const origin = await ctx.db.get("commerce_assistant_sessions", request.sessionId);
  let messageId: string | null = null;
  if (origin) {
    const resolved = await resolveThread(ctx, origin);
    // Completion belongs to this already-authorized execution. Follow sign-in
    // adoption, but do not resurrect a turn the shopper cleared while it ran.
    if (request.startedAt > (origin.clearedBefore ?? 0)
      && Math.max(request.startedAt, resolved.adoptedAt) > (resolved.session.clearedBefore ?? 0)) {
      messageId = await appendMessageToSession(ctx, resolved.session, { ...args, role: "assistant" });
    }
  }
  await ctx.db.patch("commerce_assistant_requests", request._id, {
    state: interrupted ? "interrupted" : "completed", finishedAt: Date.now(),
    ...(messageId ? { resultMessageId: messageId } : {}),
  });
  return messageId ? { messageId, blocks: args.blocks, productIds: productIdsInBlocks(args.blocks) } : emptyResult();
}

export const claim = internalMutation({
  args: { sessionToken: v.string(), requestId: v.string(), fingerprint: v.string(), message: v.string(), route: v.optional(v.string()), query: v.optional(v.string()) },
  returns: v.union(
    v.object({ state: v.literal("claimed") }),
    v.object({ state: v.literal("running") }),
    v.object({ state: v.literal("finished"), result: resultValidator }),
  ),
  handler: async (ctx: any, args: any) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.requestId)) {
      throw new ConvexError({ code: "INVALID_REQUEST", message: "Please refresh the shop before sending this request." });
    }
    const scope = await assistantScope(ctx, args.sessionToken);
    const existing = await ctx.db.query("commerce_assistant_requests").withIndex("by_request_id", (q: any) => q.eq("requestId", args.requestId)).unique();
    if (existing) {
      const origin = await ctx.db.get("commerce_assistant_sessions", existing.sessionId);
      const resolved = origin ? await resolveThread(ctx, origin) : null;
      if (!scope.session || resolved?.session._id !== scope.session._id) {
        throw new ConvexError({ code: "REQUEST_OWNER_MISMATCH", message: "This request belongs to a different shopping session." });
      }
      if (existing.fingerprint !== args.fingerprint) throw new ConvexError({ code: "REQUEST_CONFLICT", message: "This request identity was already used for a different question." });
      if (existing.state !== "running") return { state: "finished" as const, result: await receipt(ctx, existing) };
      if (Date.now() - existing.startedAt >= INTERRUPTION_MS) {
        return { state: "finished" as const, result: await finish(ctx, existing, { blocks: interruptedBlocks, error: "request_interrupted" }, true) };
      }
      return { state: "running" as const };
    }
    const session = await ensureSessionDoc(ctx, args.sessionToken);
    const userMessageId = await appendMessageToSession(ctx, session, { role: "user", text: args.message, blocks: [] });
    const userMessage = await ctx.db.get("commerce_assistant_messages", userMessageId);
    if (args.route || args.query) await patchDynamicWithMediaReferences(ctx, session._id, {
      ...(args.route ? { lastRoute: args.route } : {}),
      ...(args.query ? { lastQuery: args.query.trim().slice(0, 200) } : {}),
    });
    const id = await ctx.db.insert("commerce_assistant_requests", {
      requestId: args.requestId, sessionId: session._id, fingerprint: args.fingerprint,
      state: "running", startedAt: userMessage.createdAt,
    });
    await ctx.scheduler.runAfter(INTERRUPTION_MS, (internal as any).commerce.assistant.requests.interrupt, { id });
    return { state: "claimed" as const };
  },
});

export const complete = internalMutation({
  args: {
    requestId: v.string(), blocks: v.array(assistantBlockValidator), text: v.optional(v.string()),
    toolCalls: v.optional(v.array(v.any())), model: v.optional(v.string()), latencyMs: v.optional(v.number()),
    tokensIn: v.optional(v.number()), tokensOut: v.optional(v.number()), error: v.optional(v.string()),
  },
  returns: resultValidator,
  handler: async (ctx: any, args: any) => {
    const request = await ctx.db.query("commerce_assistant_requests").withIndex("by_request_id", (q: any) => q.eq("requestId", args.requestId)).unique();
    if (!request) throw new ConvexError({ code: "REQUEST_MISSING", message: "This request has not been started." });
    return finish(ctx, request, args, args.error === "request_interrupted");
  },
});

export const interrupt = internalMutation({
  args: { id: v.id("commerce_assistant_requests") },
  returns: v.null(),
  handler: async (ctx: any, { id }: any) => {
    const request = await ctx.db.get("commerce_assistant_requests", id);
    if (request?.state === "running" && Date.now() - request.startedAt >= INTERRUPTION_MS) {
      await finish(ctx, request, { blocks: interruptedBlocks, error: "request_interrupted" }, true);
    }
    return null;
  },
});
