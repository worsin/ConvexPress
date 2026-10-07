import { test, expect } from "bun:test";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { respond } from "../assistant/actions";
import { assistantChat, resolveAssistantProvider, ASSISTANT_UNAVAILABLE, type AssistantProvider, type ChatMessage } from "../assistant/provider";

const tools = [{ type: "function", function: { name: "search_products", description: "Search catalog", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }];
const history: ChatMessage[] = [{ role: "system", content: "Store policy" }, { role: "user", content: "Find a notebook" }];
function transport(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const fetcher = (async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(response), { status });
  }) as typeof fetch;
  return { calls, fetcher };
}

for (const kind of ["anthropic", "openai", "openrouter"] as const) {
  test(`${kind} uses only its configured endpoint and authentication protocol`, async () => {
    const provider = await resolveAssistantProvider({ provider: kind, apiKey: "synthetic-key", defaultModel: "" }, "");
    const fixture = transport(kind === "anthropic" ? { content: [{ type: "text", text: "Found it" }], usage: { input_tokens: 9, output_tokens: 4 } } : { choices: [{ message: { role: "assistant", content: "Found it" } }], usage: { prompt_tokens: 9, completion_tokens: 4 } });
    expect(await assistantChat(provider, history, { tools }, fixture.fetcher)).toMatchObject({ message: { content: "Found it" }, usage: { prompt_tokens: 9, completion_tokens: 4 } });
    const call = fixture.calls[0]!;
    expect(new URL(call.url).hostname).toBe(kind === "anthropic" ? "api.anthropic.com" : kind === "openai" ? "api.openai.com" : "openrouter.ai");
    expect(call.init.redirect).toBe("error");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(call.init.headers);
    expect(headers.get(kind === "anthropic" ? "x-api-key" : "Authorization")).toBe(kind === "anthropic" ? "synthetic-key" : "Bearer synthetic-key");
    expect(headers.get(kind === "anthropic" ? "Authorization" : "x-api-key")).toBeNull();
    if (kind === "anthropic") {
      expect(call.body.system).toBe("Store policy");
      expect(call.body.messages[0].role).toBe("user");
      expect(call.body.tools[0].input_schema).toEqual(tools[0]!.function.parameters);
    }
  });
}

test("environment fallback never borrows another provider's key", async () => {
  const keys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"];
  const saved = keys.map(key => process.env[key]);
  try {
    keys.forEach((key, index) => { process.env[key] = `synthetic-${index}`; });
    for (const [index, provider] of ["anthropic", "openai", "openrouter"].entries()) {
      expect((await resolveAssistantProvider({ provider }, "")).apiKey).toBe(`synthetic-${index}`);
    }
    delete process.env.ANTHROPIC_API_KEY;
    expect((await resolveAssistantProvider({ provider: "anthropic" }, "")).apiKey).toBe("");
    expect((await resolveAssistantProvider({ provider: "openrouter", apiKey: "saved-synthetic" }, "")).apiKey).toBe("saved-synthetic");
  } finally {
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
  }
});

test("unsupported providers are refused and explicit model overrides survive resolution", async () => {
  await expect(resolveAssistantProvider({ provider: "unknown", apiKey: "synthetic" }, "")).rejects.toThrow(ASSISTANT_UNAVAILABLE);
  expect((await resolveAssistantProvider({ provider: "anthropic", apiKey: "synthetic" }, "anthropic/claude-sonnet-4.6")).model).toBe("claude-sonnet-4-6");
  expect((await resolveAssistantProvider({ provider: "openrouter", defaultModel: "default" }, "chosen/model")).model).toBe("chosen/model");
});

test("Anthropic parallel tools round trip with matching IDs and one adjacent result turn", async () => {
  const provider: AssistantProvider = { kind: "anthropic", apiKey: "synthetic", model: "claude-sonnet-4-6" };
  const first = transport({ stop_reason: "tool_use", content: [{ type: "text", text: "Searching" }, { type: "tool_use", id: "call1", name: "search_products", input: { query: "notebook" } }, { type: "tool_use", id: "call2", name: "search_products", input: { query: "pen" } }] });
  const reply = await assistantChat(provider, history, { tools }, first.fetcher);
  expect(reply.message.tool_calls?.map(call => call.id)).toEqual(["call1", "call2"]);
  const second = transport({ content: [{ type: "text", text: '{"blocks":[]}' }] });
  await assistantChat(provider, [...history, reply.message, { role: "tool", tool_call_id: "call1", content: '{"products":["notebook"]}' }, { role: "tool", tool_call_id: "call2", content: '{"products":["pen"]}' }], { tools, json: true }, second.fetcher);
  const messages = second.calls[0]!.body.messages;
  expect(messages).toHaveLength(3);
  expect(messages[1].content[1]).toEqual({ type: "tool_use", id: "call1", name: "search_products", input: { query: "notebook" } });
  expect(messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "call1", content: '{"products":["notebook"]}' }, { type: "tool_result", tool_use_id: "call2", content: '{"products":["pen"]}' }] });
  expect(second.calls[0]!.body.response_format).toBeUndefined();
  expect(second.calls[0]!.body.system).toContain("JSON object");
});

for (const kind of ["anthropic", "openai", "openrouter"] as const) {
  test(`${kind} refuses provider failures, empty and truncated responses without leaking details`, async () => {
    const provider = { kind, apiKey: "synthetic", model: "test" };
    for (const [body, status] of [[{ error: { message: "private-provider-details" } }, 401], [{ error: { message: "private-provider-details" } }, 200], [{}, 200], [kind === "anthropic" ? { stop_reason: "max_tokens", content: [{ type: "text", text: "partial" }] } : { choices: [{ finish_reason: "length", message: { role: "assistant", content: "partial" } }] }, 200]] as const) {
      const fixture = transport(body, status);
      try { await assistantChat(provider, history, {}, fixture.fetcher); throw new Error("should reject"); }
      catch (error) { expect((error as any).data).toEqual({ code: "PROVIDER_ERROR", message: ASSISTANT_UNAVAILABLE }); }
    }
  });
}

test("network exceptions and malformed function arguments become safe failures", async () => {
  const provider: AssistantProvider = { kind: "openai", apiKey: "synthetic", model: "test" };
  const broken = (async () => { throw new Error("private-request-details"); }) as typeof fetch;
  await expect(assistantChat(provider, history, {}, broken)).rejects.toThrow(ASSISTANT_UNAVAILABLE);
  const fixture = transport({ choices: [{ message: { role: "assistant", tool_calls: [{ type: "function", id: "bad", function: { name: "add_to_cart", arguments: "{broken" } }] } }] });
  await expect(assistantChat(provider, history, { tools }, fixture.fetcher)).rejects.toThrow(ASSISTANT_UNAVAILABLE);
});

test("provider failure after a successful cart action preserves its receipt without replaying it", async () => {
  const mutations: { name: string; args: any }[] = [];
  const bundle = {
    assistant: { enabled: true, memoryEnabled: false }, recentUserTurns: 0,
    store: { storeName: "Test shop", tagline: "", currencyCode: "USD", currencySymbol: "$" },
    cart: { itemCount: 1, subtotalAmount: 2400, lines: [{ productId: "notebook", title: "Notebook", quantity: 1, unitPriceAmount: 2400 }] },
    recent: [], categories: [], related: [], memory: [], cartCards: [],
  };
  const ctx = {
    runQuery: async (fn: any) => {
      const name = getFunctionName(fn);
      if (name.endsWith(":contextBundle")) return bundle;
      if (name.endsWith(":getBySectionInternal")) return { provider: "anthropic", apiKey: "synthetic-only" };
      if (name.endsWith(":productCards")) return [{ productId: "notebook", title: "Notebook" }];
      throw new Error(`Unexpected query ${name}`);
    },
    runMutation: async (fn: any, args: any) => { mutations.push({ name: getFunctionName(fn), args }); return "synthetic-receipt"; },
  };
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return requests === 1
      ? Response.json({ content: [{ type: "tool_use", id: "add-one", name: "add_to_cart", input: { product_id: "notebook" } }] })
      : new Response("private provider failure", { status: 503 });
  }) as typeof fetch;
  try {
    const result = await (respond as any)._handler(ctx, { sessionToken: "synthetic-session", message: "Add one more notebook" });
    expect(requests).toBe(2);
    expect(mutations.filter(call => call.name.endsWith(":addItem"))).toHaveLength(1);
    expect(result.blocks).toEqual([{ type: "action_result", action: "cart_add", ok: true, summary: "Added Notebook to your cart.", productId: "notebook" }, { type: "callout", tone: "warning", markdown: ASSISTANT_UNAVAILABLE }]);
    expect(mutations[mutations.length - 1]!.args.error).toBe("provider_unavailable");
    expect(JSON.stringify(result)).not.toContain("private provider failure");
  } finally { globalThis.fetch = original; }
});

test("tool budget exhaustion retains definitions but refuses further tool calls", async () => {
  for (const kind of ["anthropic", "openai"] as const) {
    const fixture = transport(kind === "anthropic"
      ? { content: [{ type: "tool_use", id: "one-too-many", name: "search_products", input: {} }] }
      : { choices: [{ message: { role: "assistant", tool_calls: [{ type: "function", id: "one-too-many", function: { name: "search_products", arguments: "{}" } }] } }] });
    await expect(assistantChat({ kind, apiKey: "synthetic", model: "test" }, history, { tools, allowTools: false }, fixture.fetcher)).rejects.toThrow(ASSISTANT_UNAVAILABLE);
    expect(fixture.calls[0]!.body.tools).toHaveLength(1);
    expect(fixture.calls[0]!.body.tool_choice).toEqual(kind === "anthropic" ? { type: "none" } : "none");
  }
});


test("memory switched off during a provider turn preserves the answer without saving its fact", async () => {
  const writes: string[] = [];
  const ctx = {
    runQuery: async (fn: any) => {
      const name = getFunctionName(fn);
      if (name.endsWith(":contextBundle")) return {
        assistant: { enabled: true, memoryEnabled: true },
        store: { storeName: "Test shop", tagline: "", currencyCode: "USD", currencySymbol: "$" },
        cart: { itemCount: 0, subtotalAmount: 0, lines: [] },
        recent: [], categories: [], related: [], memory: [], cartCards: [],
      };
      if (name.endsWith(":getBySectionInternal")) return { provider: "anthropic", apiKey: "synthetic-only" };
      throw new Error(`Unexpected query ${name}`);
    },
    runMutation: async (fn: any, args: any) => {
      if (getFunctionName(fn).endsWith(":rememberFactFromAssistant")) {
        throw new ConvexError({ code: "MEMORY_DISABLED", message: "Shopper memory is disabled." });
      }
      if (args.role) writes.push(args.role);
      return "synthetic-message";
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ content: [{ type: "text", text: JSON.stringify({
    blocks: [{ type: "text", markdown: "Here is the answer." }], memory: [{ fact: "Narrow cabinet" }],
  }) }] })) as typeof fetch;
  try {
    const result = await (respond as any)._handler(ctx, { sessionToken: "synthetic-session", message: "Help with a narrow cabinet" });
    expect(result.blocks).toEqual([{ type: "text", markdown: "Here is the answer." }]);
    expect(writes).toEqual(["user", "assistant"]);
  } finally { globalThis.fetch = original; }
});
