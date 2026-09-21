import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture, create, save, get, text, withdraw } from "./fixture.test-support";
const list = ref<"query">("syncedBlocks/queries:list"), versions = ref<"query">("syncedBlocks/queries:revisions"),
  version = ref<"query">("syncedBlocks/queries:revision"), options = ref<"query">("syncedBlocks/queries:publishedOptions"),
  restore = ref<"mutation">("syncedBlocks/content:restore");
const paginationOpts = { numItems: 2, cursor: null };

test("library pagination uses exact scope and author authority, without exposing other drafts", async () => {
  const { t, operator, customer, ids } = await fixture();
  const own = await operator.mutation(create, { title: "Own", blocks: text });
  const other = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "other@example.invalid", emailVerified: true, status: "active", roleId: ids.role, createdAt: 1, updatedAt: 1 });
    const clone = (await ctx.db.get("syncedBlocks", own.id))!;
    const { _id, _creationTime, ...fields } = clone;
    for (let n = 0; n < 4; n++) await ctx.db.insert("syncedBlocks", { ...fields, createdBy: user, title: `Other ${n}`, updatedAt: 10+n });
    for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) await ctx.db.insert("syncedBlocks", { ...fields, [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign", title: "Foreign", updatedAt: 20 });
    return user;
  });
  expect((await operator.query(list, { paginationOpts })).page.map((item: { title: string }) => item.title)).toEqual(["Own"]);
  for (const actor of [t, customer]) await expect(actor.query(list, { paginationOpts })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch("roles", ids.role, { level: 80 }));
  let cursor: string | null = null;const found: string[] = [];
  do {
    const result = await operator.query(list, { paginationOpts: { numItems: 2, cursor } });
    expect(result.page.length).toBeLessThanOrEqual(2);found.push(...result.page.map((item: { title: string }) => item.title));
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  expect(found.sort()).toEqual(["Other 0", "Other 1", "Other 2", "Other 3", "Own"]);
  expect(other).not.toBe(ids.user);
});

test("history pages are bounded summaries; a selected revision retains full validated content", async () => {
  const { operator, customer } = await fixture();
  const { id } = await operator.mutation(create, { title: "Revision 1", blocks: text });
  for (let n=2;n<=5;n++) await operator.mutation(save, { id, expectedGeneration: n-1, title: `Revision ${n}`, blocks: text });
  const seen: number[]=[];let cursor:string|null=null;
  do {
    const result=await operator.query(versions,{id,paginationOpts:{numItems:2,cursor}});
    expect(result.page.length).toBeLessThanOrEqual(2);
    for(const item of result.page){seen.push(item.revision);expect(item).not.toHaveProperty("blocks");}
    cursor=result.isDone?null:result.continueCursor;
  }while(cursor);
  expect(seen).toEqual([5,4,3,2,1]);
  const selected=await operator.query(version,{id,revision:2});expect(selected.title).toBe("Revision 2");expect(selected.blocks[0].name).toBe("core/paragraph");
  await expect(customer.query(versions,{id,paginationOpts})).rejects.toThrow();
  await expect(operator.query(versions,{id,paginationOpts:{numItems:500,cursor:null}})).rejects.toThrow();
  await expect(operator.query(version,{id,revision:99})).rejects.toThrow();
});

test("published picker uses published titles and revisions, never draft labels or withdrawn sources", async () => {
  const { operator, t, ids, release, customer } = await fixture();
  const a=await operator.mutation(create,{title:"Published label",blocks:text});await release(a.id,1,1);
  await operator.mutation(save,{id:a.id,expectedGeneration:2,title:"Secret draft rename",blocks:text});
  await operator.mutation(create,{title:"Unpublished draft",blocks:text});
  const b=await operator.mutation(create,{title:"Withdrawn",blocks:text});await release(b.id,1,1);await operator.mutation(withdraw,{id:b.id,expectedGeneration:2});
  await t.run(async ctx=>{const author=await ctx.db.insert("users",{authSource:"local",email:"other@example.invalid",emailVerified:true,status:"active",roleId:ids.role,createdAt:1,updatedAt:1});await ctx.db.patch("syncedBlocks",a.id,{createdBy:author});});
  const result=await operator.query(options,{paginationOpts});
  expect(result.page).toHaveLength(1);expect(result.page[0]).toMatchObject({id:a.id,title:"Published label",revision:1});
  await expect(customer.query(options,{paginationOpts})).rejects.toThrow();
});

test("restore appends a reviewed draft revision, preserves history and the live pointer, and refuses stale or changed input", async () => {
  const { t, operator, release, ids, customer }=await fixture();
  await t.run(ctx=>ctx.db.patch("roles",ids.role,{capabilities:["post.create","post.read","post.update","post.restore","post.publish","post.unpublish"]}));
  const {id}=await operator.mutation(create,{title:"Original",blocks:text});await release(id,1,1);
  await operator.mutation(save,{id,expectedGeneration:2,title:"Changed",blocks:text});await release(id,3,2);
  const selected=await operator.query(version,{id,revision:1});
  const request={id,revision:1,expectedGeneration:4,expectedDigest:selected.digest};
  await expect(customer.mutation(restore,request)).rejects.toThrow();
  await expect(operator.mutation(restore,{...request,expectedDigest:"a".repeat(64)})).rejects.toThrow();
  const restored=await operator.mutation(restore,request);expect(restored).toMatchObject({revision:3,generation:5,changed:true,digest:selected.digest});
  const current=await operator.query(get,{id});expect(current.title).toBe("Original");expect(current.publishedRevision).toBe(2);
  expect((await operator.query(version,{id,revision:2})).title).toBe("Changed");
  await expect(operator.mutation(restore,request)).rejects.toThrow();
  expect((await operator.mutation(restore,{...request,expectedGeneration:5})).changed).toBe(false);
  await t.run(ctx=>ctx.db.patch("roles",ids.role,{capabilities:["post.read","post.update"]}));
  await expect(operator.mutation(restore,{...request,expectedGeneration:5})).rejects.toThrow();
});

test("a damaged current revision cannot masquerade as an unchanged restore through its stored digest", async () => {
  const { t, operator, ids }=await fixture();
  await t.run(ctx=>ctx.db.patch("roles",ids.role,{capabilities:["post.create","post.read","post.update","post.restore"]}));
  const first=await operator.mutation(create,{title:"Good revision",blocks:text});
  await operator.mutation(save,{id:first.id,expectedGeneration:1,title:"Damaged revision",blocks:text});
  await t.run(async ctx=>{const row=await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision",q=>q.eq("syncedBlockId",first.id).eq("revision",2)).unique();await ctx.db.patch("syncedBlockRevisions",row!._id,{digest:first.digest});});
  await expect(operator.query(get,{id:first.id})).rejects.toThrow();
  expect((await operator.query(ref<"query">("syncedBlocks/queries:head"),{id:first.id})).revision).toBe(2);
  expect((await operator.query(version,{id:first.id,revision:2})).state).toBe("unavailable");
  expect((await operator.query(version,{id:first.id,revision:1})).state).toBe("ready");
  const repaired=await operator.mutation(restore,{id:first.id,revision:1,expectedGeneration:2,expectedDigest:first.digest});
  expect(repaired.changed).toBe(true);expect(repaired.revision).toBe(3);
  expect((await operator.query(get,{id:first.id})).title).toBe("Good revision");
});
