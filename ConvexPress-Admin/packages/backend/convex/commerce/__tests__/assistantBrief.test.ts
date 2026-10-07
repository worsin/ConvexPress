import { expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import { brief } from "../assistant/actions";

function fixture() {
  const bundle: any = {
    assistant: { enabled: true, memoryEnabled: true },
    ai: { provider: "anthropic", defaultModel: "test" },
    store: { storeName: "Test shop", tagline: "", currencyCode: "USD", currencySymbol: "$" },
    cart: { itemCount: 1, subtotalAmount: 2400, lines: [{ productId: "notebook", variantId: "blue", title: "Notebook", variantTitle: "Blue", quantity: 1, unitPriceAmount: 2400 }] },
    recent: [], categories: [], related: [], memory: [], cartCards: [],
  };
  const cards: any[] = [{ productId: "notebook", title: "Notebook", summary: "Blue paper", price: { amount: 2400 }, compareAtPrice: null, inStock: true, categories: [], excerpt: "" }];
  const cache = new Map<string, any>();
  let providerRequests = 0;
  const ctx = {
    runQuery: async (fn: any, args: any) => {
      const name = getFunctionName(fn);
      if (name.endsWith(":contextBundle")) return structuredClone(bundle);
      if (name.endsWith(":getBySectionInternal")) return { provider: "anthropic", apiKey: "synthetic-only", defaultModel: bundle.ai.defaultModel };
      if (name.endsWith(":productCards")) return structuredClone(cards);
      if (name.endsWith(":relatedForProducts")) return [];
      if (name.endsWith(":getBrief")) return cache.get(args.cacheKey) ?? null;
      throw new Error(`Unexpected query ${name}`);
    },
    runMutation: async (fn: any, args: any) => {
      const name = getFunctionName(fn);
      if (name.endsWith(":storeBrief")) cache.set(args.cacheKey, args.payload);
      else if (!name.endsWith(":ensureSession")) throw new Error(`Unexpected mutation ${name}`);
      return null;
    },
  };
  const fetcher = (async () => {
    providerRequests++;
    return Response.json({ content: [{ type: "text", text: JSON.stringify({ blocks: [{ type: "text", markdown: `Brief ${providerRequests}` }] }) }] });
  }) as typeof fetch;
  const run = () => (brief as any)._handler(ctx, { sessionToken: "synthetic-session", kind: "product", productId: "notebook" });
  return { bundle, cards, cache, fetcher, run, requests: () => providerRequests };
}

for (const [label, change] of [
  ["quantity", (f: ReturnType<typeof fixture>) => { f.bundle.cart.lines[0].quantity = 2; }],
  ["variant identity", (f: ReturnType<typeof fixture>) => { f.bundle.cart.lines[0].variantId = "another-blue"; }],
  ["line price", (f: ReturnType<typeof fixture>) => { f.bundle.cart.lines[0].unitPriceAmount = 2600; }],
  ["catalog availability", (f: ReturnType<typeof fixture>) => { f.cards.splice(0); }],
  ["catalog price", (f: ReturnType<typeof fixture>) => { f.cards[0].price.amount = 2600; }],
  ["store rules", (f: ReturnType<typeof fixture>) => { f.bundle.store.hardRules = ["Use metric dimensions"]; }],
  ["model", (f: ReturnType<typeof fixture>) => { f.bundle.ai.defaultModel = "other-model"; }],
  ["memory setting with no saved facts", (f: ReturnType<typeof fixture>) => { f.bundle.assistant.memoryEnabled = false; }],
] as const) {
  test(`brief regenerates after a change to ${label} and reuses unchanged grounding`, async () => {
    const f = fixture();
    const original = globalThis.fetch;
    globalThis.fetch = f.fetcher;
    try {
      const first = await f.run();
      expect(first.cached).toBe(false);
      expect((await f.run()).cached).toBe(true);
      expect(f.requests()).toBe(1);
      change(f);
      const next = await f.run();
      expect(next.cached).toBe(false);
      expect(next.cacheKey).not.toBe(first.cacheKey);
      expect(f.requests()).toBe(2);
    } finally { globalThis.fetch = original; }
  });
}

test("disabled assistant refuses a brief even when a previous result is cached", async () => {
  const f = fixture();
  const original = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  try {
    await f.run();
    f.bundle.assistant.enabled = false;
    await expect(f.run()).rejects.toThrow("turned off");
    expect(f.requests()).toBe(1);
  } finally { globalThis.fetch = original; }
});
