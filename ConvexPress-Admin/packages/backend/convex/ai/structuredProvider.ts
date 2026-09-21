import { ConvexError } from "convex/values";
import { z } from "zod";

export type StructuredProvider = "openrouter" | "openai" | "anthropic";
const TOOL = "propose_document";
const MAX_BYTES = 1024 * 1024;
function fail(code: string, message: string): never { throw new ConvexError({ code, message }); }
const compatibleResult = z.object({ choices: z.array(z.object({
  finish_reason: z.enum(["tool_calls", "stop"]),
  message: z.object({ tool_calls: z.array(z.object({ type: z.literal("function"), function: z.object({ name: z.literal(TOOL), arguments: z.string().max(MAX_BYTES) }) })).length(1) }),
})).length(1) });
const anthropicResult = z.object({ stop_reason: z.literal("tool_use"), content: z.array(z.unknown()).max(32) });

/** One bounded provider request. Tool output is untrusted until the caller's
 * authoritative catalog validation. Never log/return a provider error body. */
export async function requestStructuredProposal(args: {
  provider: StructuredProvider; apiKey: string; model: string;
  schema: Record<string, unknown>; system: string; prompt: string;
}, fetcher: typeof fetch = fetch): Promise<string> {
  const anthropic = args.provider === "anthropic";
  const endpoint = anthropic ? "https://api.anthropic.com/v1/messages"
    : args.provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
  const keys = args.schema.properties && typeof args.schema.properties === "object" && !Array.isArray(args.schema.properties) ? Object.keys(args.schema.properties).join(", ") : "the supplied schema's properties";
  const tool = { name: TOOL, description: `Propose content for review. Return the supplied schema directly with these top-level keys: ${keys}. Do not add a document, proposal or data wrapper. This does not save or publish.`, parameters: args.schema };
  const body = anthropic ? {
    model: args.model, max_tokens: 12000, system: args.system,
    messages: [{ role: "user", content: args.prompt }],
    tools: [{ name: TOOL, description: tool.description, input_schema: args.schema }],
    tool_choice: { type: "tool", name: TOOL, disable_parallel_tool_use: true },
  } : {
    model: args.model, ...(args.provider === "openai" ? { max_completion_tokens: 12000 } : { max_tokens: 12000 }),
    messages: [{ role: "system", content: args.system }, { role: "user", content: args.prompt }],
    tools: [{ type: "function", function: tool }], tool_choice: { type: "function", function: { name: TOOL } },
    // OpenRouter strict routing rejects this parameter for providers which do
    // not advertise it (including Claude). The response parser still requires
    // exactly one named tool call before any proposal reaches the catalog.
    ...(args.provider === "openai" ? { parallel_tool_calls: false } : {}),
    ...(args.provider === "openrouter" ? { provider: { require_parameters: true } } : {}),
  };
  const encoded = JSON.stringify(body);
  if (new TextEncoder().encode(encoded).length > 2 * MAX_BYTES) fail("AI_CONTEXT_LIMIT", "Generation context exceeds the provider request budget.");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetcher(endpoint, { method: "POST", redirect: "error", signal: controller.signal,
      headers: anthropic ? { "content-type": "application/json", "x-api-key": args.apiKey, "anthropic-version": "2023-06-01" }
        : { "content-type": "application/json", Authorization: `Bearer ${args.apiKey}` }, body: encoded });
    if (!response.ok) {
      await response.body?.cancel();
      fail("AI_PROVIDER_ERROR", `The configured AI provider rejected generation (HTTP ${response.status}). Check its model and tool-calling support.`);
    }
    if (!response.body) fail("AI_PROVIDER_RESULT", "The AI provider returned an empty response.");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let size = 0, text = "";
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); fail("AI_PROVIDER_RESULT", "The AI provider response exceeded its size limit."); }
        text += decoder.decode(next.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    const raw: unknown = JSON.parse(text);
    if (anthropic) {
      const result = anthropicResult.parse(raw);
      const calls = result.content.filter(item => item && typeof item === "object" && "type" in item && item.type === "tool_use");
      const call = z.array(z.object({ type: z.literal("tool_use"), name: z.literal(TOOL), input: z.record(z.string(), z.unknown()) })).length(1).parse(calls)[0];
      return JSON.stringify(call.input);
    }
    return compatibleResult.parse(raw).choices[0].message.tool_calls[0].function.arguments;
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    if (controller.signal.aborted) fail("AI_PROVIDER_TIMEOUT", "AI generation timed out. No document was changed.");
    fail("AI_PROVIDER_RESULT", "The AI provider did not return one complete structured proposal. No document was changed.");
  } finally { clearTimeout(timer); }
}
