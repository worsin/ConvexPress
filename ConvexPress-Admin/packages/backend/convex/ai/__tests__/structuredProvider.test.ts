import { expect, test } from "bun:test";
import { requestStructuredProposal } from "../structuredProvider";

const args = { provider: "openrouter" as const, apiKey: "synthetic-test-key", model: "fixture-model", schema: { type: "object", properties: { title: { type: "string" } } }, system: "Return a proposal", prompt: "Build a page" };
const value = { title: "Proposal", blocks: [] };
const response = (argumentsText = JSON.stringify(value)) => ({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "propose_document", arguments: argumentsText } }] } }] });
const fetcher = (handler: (url: string, options: RequestInit) => Response | Promise<Response>) => (async (url: string | URL | Request, options?: RequestInit) => handler(String(url), options!)) as typeof fetch;

test("tool guidance follows page and custom-composition schemas without contradicting either envelope", async () => {
  for (const keys of [["title", "blocks"], ["composition"]]) {
    for (const provider of ["openrouter", "openai", "anthropic"] as const) {
      const schema = { type: "object", properties: Object.fromEntries(keys.map(key => [key, { type: "object" }])) };
      await requestStructuredProposal({ ...args, provider, schema }, fetcher((_url, options) => {
        const body = JSON.parse(String(options.body));
        const tool = provider === "anthropic" ? body.tools[0] : body.tools[0].function;
        expect(tool.description).toContain(`top-level keys: ${keys.join(", ")}.`);
        expect(tool.description).not.toContain("{title:");
        return Response.json(provider === "anthropic" ? { stop_reason: "tool_use", content: [{ type: "tool_use", name: "propose_document", input: value }] } : response());
      }));
    }
  }
});

test("OpenRouter and OpenAI force one named tool and return only its structured arguments", async () => {
  for (const provider of ["openrouter", "openai"] as const) {
    let calls = 0;
    const result = await requestStructuredProposal({ ...args, provider }, fetcher((url, options) => {
      calls++;
      expect(url).toBe(provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions");
      expect(options.redirect).toBe("error"); expect(options.signal).toBeInstanceOf(AbortSignal);
      const body = JSON.parse(String(options.body));
      expect(body.tool_choice).toEqual({ type: "function", function: { name: "propose_document" } });
      expect(body.tools[0].function.parameters).toEqual(args.schema);
      if (provider === "openrouter") expect(body).not.toHaveProperty("parallel_tool_calls");
      else expect(body.parallel_tool_calls).toBe(false);
      if (provider === "openrouter") expect(body.provider.require_parameters).toBe(true);
      return Response.json(response());
    }));
    expect(JSON.parse(result)).toEqual(value); expect(calls).toBe(1);
  }
});

test("Anthropic uses input_schema and refuses incomplete or multiple tool calls", async () => {
  const tool = { type: "tool_use", name: "propose_document", input: value };
  const result = await requestStructuredProposal({ ...args, provider: "anthropic" }, fetcher((url, options) => {
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(options.body)); expect(body.tools[0].input_schema).toEqual(args.schema);
    expect(body.tool_choice).toEqual({ type: "tool", name: "propose_document", disable_parallel_tool_use: true });
    return Response.json({ stop_reason: "tool_use", content: [{ type: "text", text: "A proposal" }, tool] });
  }));
  expect(JSON.parse(result)).toEqual(value);
  for (const payload of [{ stop_reason: "max_tokens", content: [tool] }, { stop_reason: "tool_use", content: [tool, tool] }, { stop_reason: "tool_use", content: [{ ...tool, name: "delete_document" }] }])
    await expect(requestStructuredProposal({ ...args, provider: "anthropic" }, fetcher(() => Response.json(payload)))).rejects.toThrow("one complete structured proposal");
});

test("plain text, wrong tools, truncation, network details and provider errors cannot become a proposal or expose secrets", async () => {
  for (const payload of ["```json\n{}\n```", { choices: [{ finish_reason: "length", message: response().choices[0].message }] }, { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }, { choices: [...response().choices, ...response().choices] }, { choices: [{ finish_reason: "tool_calls", message: { tool_calls: [...response().choices[0].message.tool_calls, ...response().choices[0].message.tool_calls] } }] }])
    await expect(requestStructuredProposal(args, fetcher(() => Response.json(payload)))).rejects.toThrow("one complete structured proposal");
  for (const make of [() => new Response("synthetic-test-key private provider failure", { status: 401 }), () => { throw Error("synthetic-test-key private network failure"); }]) {
    try { await requestStructuredProposal(args, fetcher(make)); throw Error("Expected refusal"); }
    catch (error) { expect(String(error)).not.toContain("synthetic-test-key"); expect(String(error)).not.toContain("private"); }
  }
  await expect(requestStructuredProposal(args, fetcher(() => new Response("x".repeat(1024 * 1024 + 1))))).rejects.toThrow("size limit");
});
