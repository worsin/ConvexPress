import { expect, test } from "bun:test";
import { commerceHarness } from "../../../commerce/__tests__/handlerHarness.test-support";
import { create, update } from "../mutations";
import { getBySlug, upcoming, list } from "../queries";
const run = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const fields = () => ({ title: "Coffee tasting", slug: "coffee-tasting", description: "Meet the roasters.", startsAt: Date.now() + 86_400_000, endsAt: Date.now() + 90_000_000, timeZone: "America/Denver", venue: "Tasting room", venueAddress: "123 Example Street" });
const harness = (enabled = true, user: string | null = "admin") => commerceHarness({ settings: [{ _id: "plugins", section: "plugins", values: { eventsEnabled: enabled } }] }, user);
test("event mutations and admin queries require authority and plugin enablement", async () => {
 await expect(run(create, harness(true, null), fields())).rejects.toBeDefined();
 await expect(run(create, harness(false), fields())).rejects.toBeDefined();
 await expect(run(list, harness(true, null), { paginationOpts: { numItems: 20, cursor: null } })).rejects.toBeDefined();
 expect(await run(getBySlug, harness(false), { slug: "coffee-tasting" })).toBeNull();
});
test("draft publication, cancellation and archive enforce public projection boundaries", async () => {
 const ctx = harness(); const input = fields(); const id = await run(create, ctx, input);
 expect(await run(getBySlug, ctx, { slug: input.slug })).toBeNull();
 const row = ctx.tables.extension_events[0];
 await run(update, ctx, { id, expectedUpdatedAt: row.updatedAt, ...input, status: "published" });
 const page = await run(upcoming, ctx, { paginationOpts: { numItems: 20, cursor: null } });
 expect(page.page).toHaveLength(1); expect(page.page[0].createdBy).toBeUndefined(); expect(page.page[0].updatedAt).toBeUndefined();
 await run(update, ctx, { id, expectedUpdatedAt: row.updatedAt, ...input, status: "cancelled" });
 expect((await run(getBySlug, ctx, { slug: input.slug })).status).toBe("cancelled");
 expect((await run(upcoming, ctx, { paginationOpts: { numItems: 20, cursor: null } })).page).toEqual([]);
 await run(update, ctx, { id, expectedUpdatedAt: row.updatedAt, ...input, status: "archived" });
 expect(await run(getBySlug, ctx, { slug: input.slug })).toBeNull(); expect(ctx.tables.extension_events).toHaveLength(1);
});
test("slug uniqueness and stale editor versions cannot overwrite existing events", async () => {
 const ctx = harness(); const input = fields(); const id = await run(create, ctx, input);
 await expect(run(create, ctx, input)).rejects.toBeDefined();
 const revision = ctx.tables.extension_events[0].updatedAt;
 await run(update, ctx, { id, expectedUpdatedAt: revision, ...input, title: "New title", status: "published" });
 await expect(run(update, ctx, { id, expectedUpdatedAt: revision, ...input, status: "draft" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "EVENT_CONFLICT" }) });
 expect(ctx.tables.extension_events[0].title).toBe("New title");
});
test("invalid schedules, zones and registration links fail before insert", async () => {
 const ctx = harness();
 for (const patch of [{ endsAt: 1 }, { timeZone: "Not/AZone" }, { registrationUrl: "javascript:alert(1)" }, {registrationUrl:"https://example.invalid/"+"x".repeat(2048)}, {startsAt:-1}, {endsAt:8_640_000_000_000_001}]) await expect(run(create, ctx, { ...fields(), ...patch })).rejects.toBeDefined();
 expect(ctx.tables.extension_events ?? []).toEqual([]);
});

test("RSVP settings survive old editors and reject capacity below confirmed attendance",async()=>{
 const ctx=harness(),input=fields(),rsvp={mode:"guests",capacity:2,closesAt:null};
 const id=await run(create,ctx,{...input,rsvp});const row=ctx.tables.extension_events[0];
 await run(update,ctx,{...input,id,expectedUpdatedAt:row.updatedAt,status:"published"});expect(row.rsvp).toEqual(rsvp);
 ctx.tables.event_rsvp_totals=[{_id:"count",eventId:id,confirmed:2,updatedAt:1}];
 await expect(run(update,ctx,{...input,id,expectedUpdatedAt:row.updatedAt,status:"published",rsvp:{...rsvp,capacity:1}})).rejects.toMatchObject({data:expect.objectContaining({code:"EVENT_RSVP_CAPACITY"})});expect(row.rsvp.capacity).toBe(2);
 await expect(run(update,ctx,{...input,id,expectedUpdatedAt:row.updatedAt,status:"published",registrationUrl:"https://tickets.example.invalid"})).rejects.toBeDefined();expect(row.registrationUrl).toBeUndefined();
});

test("RSVP settings reject invalid modes, capacities, closing time and parallel registration",async()=>{
 const ctx=harness(),input=fields();
 for(const rsvp of [{mode:"unknown",capacity:null,closesAt:null},{mode:"guests",capacity:0,closesAt:null},{mode:"guests",capacity:1.5,closesAt:null},{mode:"guests",capacity:null,closesAt:input.startsAt+1}])await expect(run(create,ctx,{...input,rsvp})).rejects.toBeDefined();
 await expect(run(create,ctx,{...input,rsvp:{mode:"guests",capacity:null,closesAt:null},registrationUrl:"https://tickets.example.invalid"})).rejects.toBeDefined();expect(ctx.tables.extension_events??[]).toEqual([]);
});
