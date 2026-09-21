import { ConvexError } from "convex/values";
import { resolveServiceKeyAsync } from "../../helpers/serviceKeys";

export const ASSISTANT_UNAVAILABLE = "Our shopping assistant is temporarily unavailable. You can still browse the shop and manage your cart. Please try again later.";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}
export interface ChatTool {
  type: string;
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface AssistantProvider {
  kind: "openrouter" | "openai" | "anthropic";
  apiKey: string;
  model: string;
}

function unavailable(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "PROVIDER_ERROR", message: ASSISTANT_UNAVAILABLE });
}

/** Resolve the provider and credential from the same settings snapshot. */
export async function resolveAssistantProvider(settings: Record<string, unknown>, assistantModel: string): Promise<AssistantProvider> {
  const kind = settings.provider || "openrouter";
  if (kind !== "openrouter" && kind !== "openai" && kind !== "anthropic") throw unavailable();
  const env = kind === "anthropic" ? "ANTHROPIC_API_KEY" : kind === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY";
  let model = assistantModel.trim() || String(settings.defaultModel ?? "").trim();
  if (!model) model = kind === "anthropic" ? "claude-sonnet-4-6" : kind === "openai" ? "gpt-5.5" : "anthropic/claude-sonnet-4.6";
  if (kind === "anthropic") model = model.replace(/^anthropic\//, "").replace(/(\d)\.(\d)/g, "$1-$2");
  if (kind === "openai") model = model.replace(/^openai\//, "");
  return { kind, model, apiKey: (await resolveServiceKeyAsync(settings, "apiKey", env)) ?? "" };
}

type AnthropicMessage = { role: "user" | "assistant"; content: Record<string, unknown>[] };
function anthropicHistory(messages: ChatMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      if (!message.tool_call_id) throw unavailable();
      const content = { type: "tool_result", tool_use_id: message.tool_call_id, content: message.content ?? "" };
      // Parallel tool results must share the user turn immediately after tool use.
      const previous = result[result.length - 1];
      if (previous?.role === "user" && previous.content.every(block => block.type === "tool_result")) previous.content.push(content);
      else result.push({ role: "user", content: [content] });
      continue;
    }
    const content: Record<string, unknown>[] = [];
    if (message.content) content.push({ type: "text", text: message.content });
    for (const call of message.tool_calls ?? []) {
      content.push({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) });
    }
    if (content.length) result.push({ role: message.role, content });
  }
  return result;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw unavailable();
  return value;
}
function tokens(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function assistantChat(
  provider: AssistantProvider,
  messages: ChatMessage[],
  options: { tools?: ChatTool[]; allowTools?: boolean; maxTokens?: number; json?: boolean },
  request: typeof fetch = fetch,
): Promise<{ message: ChatMessage; usage: { prompt_tokens?: number; completion_tokens?: number } }> {
  try {
    const anthropic = provider.kind === "anthropic";
    const url = anthropic ? "https://api.anthropic.com/v1/messages"
      : provider.kind === "openai" ? "https://api.openai.com/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (anthropic) {
      headers["x-api-key"] = provider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.Authorization = `Bearer ${provider.apiKey}`;
      if (provider.kind === "openrouter") {
        headers["HTTP-Referer"] = "https://convexpress.com";
        headers["X-Title"] = "ConvexPress Shop Assistant";
      }
    }
    const body: Record<string, unknown> = { model: provider.model, max_tokens: options.maxTokens ?? 1400 };
    if (anthropic) {
      body.system = messages.filter(message => message.role === "system").map(message => message.content ?? "").join("\n\n")
        + (options.json ? "\nReturn only a JSON object, without Markdown fences." : "");
      body.messages = anthropicHistory(messages);
      if (options.tools?.length) body.tools = options.tools.map(tool => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters }));
      if (options.tools?.length && options.allowTools === false) body.tool_choice = { type: "none" };
    } else {
      body.messages = messages;
      if (options.tools?.length) { body.tools = options.tools; body.tool_choice = options.allowTools === false ? "none" : "auto"; }
      if (options.json) body.response_format = { type: "json_object" };
    }
    // Do not follow redirects with a credential or leave the action waiting indefinitely.
    const response = await request(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw unavailable();
    const data = record(await response.json());
    if (data.error) throw unavailable();
    const usage = data.usage ? record(data.usage) : {};
    if (anthropic) {
      if (!Array.isArray(data.content) || data.stop_reason === "max_tokens") throw unavailable();
      const text: string[] = [];
      const calls: NonNullable<ChatMessage["tool_calls"]> = [];
      for (const value of data.content) {
        const block = record(value);
        if (block.type === "text") text.push(string(block.text));
        else if (block.type === "tool_use") calls.push({ id: string(block.id), type: "function", function: { name: string(block.name), arguments: JSON.stringify(record(block.input)) } });
        else throw unavailable();
      }
      if ((!text.length && !calls.length) || (calls.length && options.allowTools === false)) throw unavailable();
      return { message: { role: "assistant", content: text.join("\n"), ...(calls.length ? { tool_calls: calls } : {}) }, usage: { prompt_tokens: tokens(usage.input_tokens), completion_tokens: tokens(usage.output_tokens) } };
    }
    if (!Array.isArray(data.choices) || !data.choices.length) throw unavailable();
    const choice = record(data.choices[0]);
    if (choice.finish_reason === "length") throw unavailable();
    const message = record(choice.message);
    if (message.role !== "assistant") throw unavailable();
    const content = message.content == null ? null : string(message.content);
    let calls: ChatMessage["tool_calls"];
    if (message.tool_calls != null) {
      if (!Array.isArray(message.tool_calls)) throw unavailable();
      calls = message.tool_calls.map(value => {
        const call = record(value), fn = record(call.function);
        if (call.type !== "function") throw unavailable();
        const args = string(fn.arguments);
        record(JSON.parse(args));
        return { id: string(call.id), type: "function", function: { name: string(fn.name), arguments: args } };
      });
    }
    if ((!content && !calls?.length) || (calls?.length && options.allowTools === false)) throw unavailable();
    return { message: { role: "assistant", content, ...(calls?.length ? { tool_calls: calls } : {}) }, usage: { prompt_tokens: tokens(usage.prompt_tokens), completion_tokens: tokens(usage.completion_tokens) } };
  } catch {
    // Provider bodies and transport exceptions can contain request details. Never expose them to shoppers.
    throw unavailable();
  }
}
