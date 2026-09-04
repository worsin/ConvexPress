/**
 * Prompt construction for the storefront assistant.
 *
 * The assistant is grounded: it only recommends products it has looked at
 * through tools, it always sees the live cart, and it says why each pick
 * fits. Store voice and rules come from settings, never from code.
 */

export interface StoreContext {
  storeName: string;
  tagline: string;
  currencyCode: string;
  currencySymbol: string;
  tone: string;
  disclosureText: string;
  brandVoice?: string;
  hardRules?: string[];
  groups: Record<string, boolean>;
  maxPicks: number;
  cardsPerGroup: number;
}

export interface CartLineContext {
  productId: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPriceAmount: number;
  attributes: unknown;
  summary: string | null;
}

export interface MemoryContext {
  kind: string;
  fact: string;
  source: string;
}

export function formatMoney(amount: number, currencyCode: string, symbol: string): string {
  const value = amount / 100;
  const formatted = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${formatted}` : `${formatted} ${currencyCode}`;
}

function compactAttributes(attributes: unknown): string {
  if (!attributes || typeof attributes !== "object") return "";
  const entries = Object.entries(attributes as Record<string, unknown>).slice(0, 14);
  return entries
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join("; ");
}

export function describeCart(lines: CartLineContext[], store: StoreContext): string {
  if (!lines.length) return "The cart is empty.";
  return lines
    .map((line) => {
      const attrs = compactAttributes(line.attributes);
      return `- [${line.productId}] ${line.title}${line.variantTitle ? ` (${line.variantTitle})` : ""} ×${line.quantity} @ ${formatMoney(line.unitPriceAmount, store.currencyCode, store.currencySymbol)}${line.summary ? ` — ${line.summary}` : ""}${attrs ? ` — ${attrs}` : ""}`;
    })
    .join("\n");
}

export function describeMemory(memory: MemoryContext[]): string {
  if (!memory.length) return "Nothing remembered yet.";
  return memory.map((entry) => `- (${entry.kind}, ${entry.source}) ${entry.fact}`).join("\n");
}

export function describeProducts(
  cards: Array<{
    productId: string;
    title: string;
    price: { amount: number };
    compareAtPrice: { amount: number } | null;
    inStock: boolean;
    categories: Array<{ name: string }>;
    summary: string | null;
    excerpt: string;
    attributes: unknown;
  }>,
  store: StoreContext,
): string {
  return cards
    .map((card) => {
      const price = formatMoney(card.price.amount, store.currencyCode, store.currencySymbol);
      const was = card.compareAtPrice
        ? ` (was ${formatMoney(card.compareAtPrice.amount, store.currencyCode, store.currencySymbol)})`
        : "";
      const attrs = compactAttributes(card.attributes);
      return `- [${card.productId}] ${card.title} — ${price}${was} — ${card.inStock ? "in stock" : "out of stock"} — ${card.categories.map((c) => c.name).join("/") || "uncategorised"}${card.summary ? ` — ${card.summary}` : card.excerpt ? ` — ${card.excerpt}` : ""}${attrs ? ` — ${attrs}` : ""}`;
    })
    .join("\n");
}

export const BLOCK_SCHEMA_DESCRIPTION = `Respond ONLY with a JSON object of this shape (no prose outside it):
{
  "blocks": [
    {"type":"text","markdown":"short answer, bold product names, ✅ for criteria that were checked"},
    {"type":"product_group","title":"Machines that fit","reason":"why this group","items":[{"productId":"<id>","rationale":"one line on why it fits THIS shopper"}],"seeMoreQuery":"optional search text"},
    {"type":"compare_table","columns":["Price","Height","Type"],"rows":[{"productId":"<id>","values":["$139","11.9 in","pump"]}]},
    {"type":"callout","tone":"tip|note|warning","markdown":"one short remark"},
    {"type":"chips","items":["follow-up question 1","follow-up question 2"]}
  ],
  "memory": [{"fact":"has a 15-inch cabinet","kind":"constraint"}],
  "suggestedPrompts": ["Which of these is easiest to clean?"]
}
Rules: productId values MUST come from products you looked at with tools in this turn or that are in the cart. Never invent products, prices, or stock. Keep text blocks under 120 words. Prefer 2 items per group. Put the cheapest adequate option first when the shopper mentioned budget. Only add to "memory" facts the shopper stated about themselves or their situation.`;

export function buildSystemPrompt(store: StoreContext, route: string | undefined, query: string | undefined): string {
  const enabledGroups = Object.entries(store.groups)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .join(", ");
  const rules = (store.hardRules ?? []).map((rule) => `- ${rule}`).join("\n");
  return [
    `You are the shopping assistant for ${store.storeName}${store.tagline ? ` — ${store.tagline}` : ""}.`,
    `Voice: ${store.tone}.${store.brandVoice ? ` Brand voice: ${store.brandVoice}.` : ""}`,
    `You always know the shopper's live cart and what they searched for. Recommend specific products from this store only, grounded in tool results, and explain in one line why each pick works with what they already have or asked for.`,
    `When the cart has items, reason about compatibility from their attributes (sizes, fittings, standards, materials) before suggesting accessories, consumables, maintenance items, or upgrades. Groups you may use: ${enabledGroups}. Show at most ${store.maxPicks} picks per answer and ${store.cardsPerGroup} per group unless asked for more.`,
    `Use tools: search_products to find candidates, get_products for details, related_products for what goes with a product, add_to_cart only when the shopper clearly asks to add something, remember only for facts the shopper states about themselves, compare_products when they ask to compare.`,
    `If the question is not about shopping here, answer briefly and steer back to the store. Never mention internal ids in prose. Prices are ${store.currencyCode}.`,
    rules ? `Store rules:\n${rules}` : "",
    route ? `The shopper is on the ${route} page.` : "",
    query ? `Their current search is: "${query}".` : "",
    `Disclosure shown to the shopper: ${store.disclosureText}`,
    BLOCK_SCHEMA_DESCRIPTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildBriefPrompt(input: {
  store: StoreContext;
  kind: "query" | "cart" | "product";
  query?: string;
  cart: CartLineContext[];
  memory: MemoryContext[];
  candidates: string;
  relatedGroups: string;
  categories: string[];
}): { system: string; user: string } {
  const { store } = input;
  const system = [
    `You write the auto-brief in the shopping assistant rail for ${store.storeName}. The shopper has NOT asked a question; you are proactively summarising what fits their search and their cart.`,
    `Voice: ${store.tone}.${store.brandVoice ? ` Brand voice: ${store.brandVoice}.` : ""} Be concrete and short. Never invent products, prices, or stock; use only the candidate list. Explain in one line per item why it fits this shopper (mention cart items or remembered constraints by name).`,
    BLOCK_SCHEMA_DESCRIPTION,
    `For this brief also include a {"type":"facets","items":[{"label":"Compact","query":"compact espresso machine"}]} block with 4–7 ways to narrow the search when the brief is for a search query, and a {"type":"chips","items":[...]} block with 4 question chips the shopper might tap next.`,
  ].join("\n\n");

  const intro =
    input.kind === "query"
      ? `The shopper just searched for: "${input.query}".`
      : input.kind === "cart"
        ? `The shopper is looking at their cart.`
        : `The shopper is viewing a product page.`;
  const user = [
    intro,
    `Cart:\n${describeCart(input.cart, store)}`,
    `Remembered about this shopper:\n${describeMemory(input.memory)}`,
    input.candidates ? `Candidate products for the search:\n${input.candidates}` : "",
    input.relatedGroups ? `What the relation graph says goes with the cart:\n${input.relatedGroups}` : "",
    input.categories.length ? `Store categories: ${input.categories.join(", ")}` : "",
    `Write the brief now. Lead with one or two sentences, then a product_group per useful group (max ${store.maxPicks} products total, ${store.cardsPerGroup} per group), then facets (search briefs only) and chips.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}
