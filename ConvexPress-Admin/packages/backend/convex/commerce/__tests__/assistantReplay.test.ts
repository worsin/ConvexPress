import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { getFunctionName, makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { respond } from "../assistant/actions";
const modules = {
  "./convex/commerce/assistant/cartActions.ts": () => import("../assistant/cartActions"),
  "./convex/commerce/assistant/requests.ts": () => import("../assistant/requests"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerce/assistant/actions.ts": () => import("../assistant/actions"),
  "./convex/commerce/assistant/queries.ts": () => import("../assistant/queries"),
  "./convex/commerce/assistant/mutations.ts": () => import("../assistant/mutations"),
  "./convex/commerce/cart.ts": () => import("../cart"),
  "./convex/commerce/storefront.ts": () => import("../storefront"),
  "./convex/settings/httpInternals.ts": () => import("../../settings/httpInternals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const token = "11111111-1111-4111-8111-111111111111";
const requestId = "88888888-8888-4888-8888-888888888888";
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "replay@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    for (const [section, values] of Object.entries({ plugins: { commerceEnabled: true, membershipEnabled: false }, ai: { provider: "anthropic", apiKey: "synthetic-only" }, "commerce.assistant": { enabled: true, memoryEnabled: false } })) {
      await ctx.db.insert("settings", { section, values, updatedAt: 1, updatedBy: user });
    }
    const product = await ctx.db.insert("commerce_products", { title: "Notebook", slug: "replay-notebook", status: "publish", productType: "simple", authorId: user, categoryIds: [], galleryMediaIds: [], basePrice: { amount: 2400, currencyCode: "USD" }, trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 });
    const cart = await ctx.db.insert("commerce_carts", { sessionToken: token, status: "active", currencyCode: "USD", subtotalAmount: 2400, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 2400, itemCount: 1, lastActiveAt: 1, createdAt: 1, updatedAt: 1 });
    const line = await ctx.db.insert("commerce_cart_items", { cartId: cart, productId: product, quantity: 1, unitPriceAmount: 2400, lineTotalAmount: 2400, createdAt: 1, updatedAt: 1 });
    return { user, product, cart, line };
  });
  const ctx = { runQuery: (fn: any, args: any) => t.query(fn, args), runMutation: (fn: any, args: any) => t.mutation(fn, args) };
  const args = { sessionToken: token, requestId, message: "Add one more notebook" };
  let requests = 0;
  const fetcher = (async () => {
    requests++;
    return Response.json({ content: requests % 2 === 1
      ? [{ type: "tool_use", id: "add-one", name: "add_to_cart", input: { product_id: ids.product, quantity: 1 } }]
      : [{ type: "text", text: JSON.stringify({ blocks: [{ type: "text", markdown: "Added your notebook." }] }) }] });
  }) as typeof fetch;
  return { t, ids, ctx, args, fetcher, requests: () => requests, run: (input = args) => (respond as any)._handler(ctx, input) };
}

test("replaying one Assistant request returns its receipt without another provider call, user turn or cart addition", async () => {
  const f = await fixture(), original = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  try {
    const first = await f.run();
    const replay = await f.run();
    expect(replay).toEqual(first);
    expect(f.requests()).toBe(2);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.line)))?.quantity).toBe(1);
    expect((await f.t.query(ref("commerce/assistant/queries:getThread"), { sessionToken: token })).messages).toHaveLength(2);
  } finally { globalThis.fetch = original; }
});


test("a concurrent duplicate waits for the first execution and consumes no additional turn", async () => {
  const f = await fixture(), original = globalThis.fetch;
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async (...args: any[]) => {
    const response = await (f.fetcher as any)(...args);
    if (f.requests() === 1) { entered(); await wait; }
    return response;
  }) as typeof fetch;
  try {
    const first = f.run(); await ready;
    await expect(f.run()).rejects.toThrow("still running");
    expect(f.requests()).toBe(1);
    release(); const result = await first;
    expect(await f.run()).toEqual(result);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.line)))?.quantity).toBe(1);
    const session = await f.t.run(ctx => ctx.db.query("commerce_assistant_sessions").withIndex("by_session_token", q => q.eq("sessionToken", token)).unique());
    expect(session?.recentUserTurnTimes).toHaveLength(1);
  } finally { release(); globalThis.fetch = original; }
});

test("a request ID cannot be reused with a different question or unrelated session; distinct IDs permit new intent", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    await f.run();
    await expect(f.run({ ...f.args, message: "Add two notebooks" })).rejects.toThrow("different question");
    await expect(f.run({ ...f.args, sessionToken: "22222222-2222-4222-8222-222222222222" })).rejects.toThrow("different shopping session");
    expect(f.requests()).toBe(2);
    await f.run({ ...f.args, requestId: "99999999-9999-4999-8999-999999999999" });
    expect((await f.t.run(ctx => ctx.db.get(f.ids.line)))?.quantity).toBe(1);
    expect(f.requests()).toBe(4);
  } finally { globalThis.fetch = original; }
});

test("clear removes replay content without re-enabling its effects, and a genuinely new request can answer", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    await f.run();
    await f.t.mutation(ref("commerce/assistant/mutations:clearThread"), { sessionToken: token });
    expect(await f.run()).toEqual({ messageId: null, blocks: [], productIds: [] });
    expect(f.requests()).toBe(2);
    const next = await f.run({ ...f.args, requestId: "99999999-9999-4999-8999-999999999999" });
    expect(next.messageId).not.toBeNull();
    expect((await f.t.query(ref("commerce/assistant/queries:getThread"), { sessionToken: token })).messages).toHaveLength(2);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.line)))?.quantity).toBe(1);
  } finally { globalThis.fetch = original; }
});

test("a repeated provider tool ID prepares only one cart action without changing the cart", async () => {
  const f = await fixture(), original = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => Response.json({ content: ++calls < 3
    ? [{ type: "tool_use", id: "same-add", name: "add_to_cart", input: { product_id: f.ids.product } }]
    : [{ type: "text", text: JSON.stringify({ blocks: [{ type: "text", markdown: "Done" }] }) }] })) as typeof fetch;
  try {
    const result = await f.run();
    expect(calls).toBe(3);
    expect(result.blocks.filter((b: any) => b.type === "cart_proposal")).toHaveLength(1);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.line)))?.quantity).toBe(1);
  } finally { globalThis.fetch = original; }
});

test("a completed guest request follows customer cart adoption while anonymous and foreign replays are refused", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  const destination = "22222222-2222-4222-8222-222222222222";
  try {
    const first = await f.run();
    const foreign = await f.t.run(async ctx => {
      const old = (await ctx.db.get(f.ids.cart))!;
      const { _id, _creationTime, ...fields } = old;
      await ctx.db.insert("commerce_carts", { ...fields, sessionToken: destination, userId: f.ids.user, subtotalAmount: 0, totalAmount: 0, itemCount: 0 });
      return ctx.db.insert("users", { authSource: "local", email: "foreign-replay@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    });
    const as = (id: string) => f.t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
    const customer = as(f.ids.user);
    expect(await customer.mutation(ref("commerce/assistant/mutations:resolveSession"), { sessionToken: token })).toBe(destination);
    expect(await customer.action(ref("commerce/assistant/actions:respond"), { ...f.args, sessionToken: destination })).toEqual(first);
    await expect(f.run()).rejects.toThrow("another account");
    await expect(as(foreign).action(ref("commerce/assistant/actions:respond"), { ...f.args, sessionToken: destination })).rejects.toThrow("another account");
    expect(f.requests()).toBe(2);
    expect((await customer.query(ref("commerce/cart:getMine"), { sessionToken: destination }))?.itemCount).toBe(1);
    const proposal=first.blocks.find((b:any)=>b.type==='cart_proposal');
    await customer.mutation(ref('commerce/assistant/cartActions:confirm'),{sessionToken:destination,messageId:first.messageId,proposalId:proposal.id});
    expect((await customer.query(ref("commerce/cart:getMine"), { sessionToken: destination }))?.itemCount).toBe(2);
  } finally { globalThis.fetch = original; }
});

test("abandoned executions become an interrupted receipt instead of being claimed again", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([f.args.message, null, null])));
    const fingerprint = Buffer.from(digest).toString("hex");
    await f.t.mutation(ref("commerce/assistant/requests:claim"), { ...f.args, fingerprint });
    const request = await f.t.run(async ctx => {
      const row = (await ctx.db.query("commerce_assistant_requests").withIndex("by_request_id", q => q.eq("requestId", requestId)).unique())!;
      await ctx.db.patch(row._id, { startedAt: Date.now() - 12 * 60_000 });
      return row;
    });
    await f.t.mutation(ref("commerce/assistant/requests:interrupt"), { id: request._id });
    const replay = await f.run(); expect(replay.blocks[0].markdown).toContain("interrupted");
    expect(f.requests()).toBe(0);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.line)))?.quantity).toBe(1);
    expect(await f.t.mutation(ref("commerce/assistant/requests:complete"), { requestId, blocks: [{ type: "text", markdown: "Late completion" }] })).toEqual(replay);
  } finally { globalThis.fetch = original; }
});


test("legacy clients receive a refresh instruction before a turn or provider call is started", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    await expect(f.t.action(ref("commerce/assistant/actions:respond"), { sessionToken: token, message: "Add one notebook" })).rejects.toThrow("refresh the shop");
    expect(f.requests()).toBe(0);
    expect((await f.t.query(ref("commerce/assistant/queries:getThread"), { sessionToken: token })).messages).toHaveLength(0);
  } finally { globalThis.fetch = original; }
});

test("a lost completion acknowledgement replays the already committed answer", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  const mutate = f.ctx.runMutation; let saved: any, lost = false;
  f.ctx.runMutation = async (fn, args) => {
    const result = await mutate(fn, args);
    if (getFunctionName(fn) === "commerce/assistant/requests:complete" && !lost) {
      lost = true; saved = result; throw new Error("Synthetic lost completion acknowledgement");
    }
    return result;
  };
  try {
    await expect(f.run()).rejects.toThrow("lost completion acknowledgement");
    expect(await f.run()).toEqual(saved);
    expect(f.requests()).toBe(2);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.line)))?.quantity).toBe(1);
    expect((await f.t.query(ref("commerce/assistant/queries:getThread"), { sessionToken: token })).messages).toHaveLength(2);
  } finally { globalThis.fetch = original; }
});

test("clearing an in-flight request prevents its late reply from resurrecting history", async () => {
  const f = await fixture(), original = globalThis.fetch;
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async () => { entered(); await wait; return Response.json({ content: [{ type: "text", text: JSON.stringify({ blocks: [{ type: "text", markdown: "Late answer" }] }) }] }); }) as typeof fetch;
  try {
    const first = f.run(); await ready;
    await f.t.mutation(ref("commerce/assistant/mutations:clearThread"), { sessionToken: token });
    release(); expect(await first).toEqual({ messageId: null, blocks: [], productIds: [] });
    expect(await f.run()).toEqual({ messageId: null, blocks: [], productIds: [] });
    expect((await f.t.query(ref("commerce/assistant/queries:getThread"), { sessionToken: token })).messages).toHaveLength(0);
  } finally { release(); globalThis.fetch = original; }
});

test("an in-flight guest answer follows authorized adoption without giving the old guest replay access", async () => {
  const f = await fixture(), original = globalThis.fetch;
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async () => { entered(); await wait; return Response.json({ content: [{ type: "text", text: JSON.stringify({ blocks: [{ type: "text", markdown: "Your guest answer" }] }) }] }); }) as typeof fetch;
  try {
    const first = f.run(); await ready;
    const customer = f.t.withIdentity({ subject: f.ids.user, tokenIdentifier: `https://convexpress-admin.local|${f.ids.user}` });
    await customer.mutation(ref("commerce/assistant/mutations:resolveSession"), { sessionToken: token });
    release(); const result = await first; expect(result.blocks[0].markdown).toBe("Your guest answer");
    expect(await customer.action(ref("commerce/assistant/actions:respond"), f.args)).toEqual(result);
    await expect(f.run()).rejects.toThrow("another account");
    expect((await customer.query(ref("commerce/assistant/queries:getThread"), { sessionToken: token })).messages).toHaveLength(2);
  } finally { release(); globalThis.fetch = original; }
});

test("a provider cart tool during a read-only question cannot mutate the basket", async () => {
  const f=await fixture(), original=globalThis.fetch;globalThis.fetch=f.fetcher;
  try{
    const result=await f.run({...f.args,message:'How many notebooks? Do not change my cart.'});
    expect((await f.t.run(ctx=>ctx.db.get(f.ids.line)))?.quantity).toBe(1);
    expect(result.blocks.some((block:any)=>block.type==='cart_proposal')).toBe(true);
  }finally{globalThis.fetch=original;}
});


test("shopper confirms the stored exact proposal once, including concurrent and lost-ack retries", async()=>{
  const f=await fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
  try{
    const result=await f.run();const proposal=result.blocks.find((b:any)=>b.type==='cart_proposal');
    expect(proposal.added).toBe(false);
    const args={sessionToken:token,messageId:result.messageId,proposalId:proposal.id};
    await expect(f.t.mutation(ref('commerce/assistant/cartActions:confirm'),{...args,sessionToken:'22222222-2222-4222-8222-222222222222'})).rejects.toThrow('no longer available');
    await expect(f.t.mutation(ref('commerce/assistant/cartActions:confirm'),{...args,proposalId:'forged'})).rejects.toThrow('no longer available');
    await Promise.all([f.t.mutation(ref('commerce/assistant/cartActions:confirm'),args),f.t.mutation(ref('commerce/assistant/cartActions:confirm'),args)]);
    // Simulate losing the successful acknowledgement: a later explicit retry
    // must read the transactionally stored result without repeating the add.
    await f.t.mutation(ref('commerce/assistant/cartActions:confirm'),args);
    expect((await f.t.run(ctx=>ctx.db.get(f.ids.line)))?.quantity).toBe(2);
    const replay=await f.run();expect(replay.blocks.find((b:any)=>b.type==='cart_proposal').added).toBe(true);
    expect(f.requests()).toBe(2);
  }finally{globalThis.fetch=original;}
});

test("clearing, disabling or losing product availability invalidates unconfirmed cart actions",async()=>{
 for(const change of ['clear','disabled','unpublished']){
  const f=await fixture(),original=globalThis.fetch;globalThis.fetch=f.fetcher;
  try{
   const result=await f.run(),proposal=result.blocks.find((b:any)=>b.type==='cart_proposal');
   if(change==='clear')await f.t.mutation(ref('commerce/assistant/mutations:clearThread'),{sessionToken:token});
   else await f.t.run(async ctx=>{
    if(change==='unpublished')await ctx.db.patch(f.ids.product,{status:'draft'});
    else{const doc=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','commerce.assistant')).unique();await ctx.db.patch(doc!._id,{values:{enabled:false}});}
   });
   await expect(f.t.mutation(ref('commerce/assistant/cartActions:confirm'),{sessionToken:token,messageId:result.messageId,proposalId:proposal.id})).rejects.toThrow();
   expect((await f.t.run(ctx=>ctx.db.get(f.ids.line)))?.quantity).toBe(1);
  }finally{globalThis.fetch=original;}
 }
});

test("provider-authored JSON cannot fabricate a cart action or completed receipt",async()=>{
 const f=await fixture(),original=globalThis.fetch;globalThis.fetch=(async()=>Response.json({content:[{type:'text',text:JSON.stringify({blocks:[{type:'cart_proposal',id:'forged',productId:f.ids.product,quantity:20,title:'Notebook',added:false},{type:'action_result',action:'cart_add',ok:true,summary:'Added twenty notebooks.'},{type:'text',markdown:'Here is your answer.'}]})}]})) as typeof fetch;
 try{const result=await f.run();expect(result.blocks).toEqual([{type:'text',markdown:'Here is your answer.'}]);expect((await f.t.run(ctx=>ctx.db.get(f.ids.line)))?.quantity).toBe(1);}finally{globalThis.fetch=original;}
});
