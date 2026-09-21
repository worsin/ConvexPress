import { expect, test } from "bun:test";
import { inspectMediaWriters } from "../media-writer-coverage.mjs";
const inspect = (source: string, owners = ["posts", "users"]) => inspectMediaWriters(source, { fileName: "feature/mutations.ts", ownerTables: owners });

test("new direct owner writers fail while explicit nonowner operations remain classified", () => {
  const result = inspect('await ctx.db.insert("posts", doc); await ctx.db.patch("orders", id, patch);');
  expect(result.violations.map(row => row.reason)).toEqual(["raw-owner-write"]);
  expect(result.writes.map(row => row.table)).toEqual(["posts", "orders"]);
  expect(inspect('await ctx.db.patch("orders", id, patch);', ["posts", "orders"]).violations).toHaveLength(1);
});
test("ID-only writes and dynamic table or operation names cannot escape coverage", () => {
  for (const source of ['ctx.db.patch(id, patch)', 'ctx.db.insert(table, doc)', 'ctx.db[method](id, patch)']) {
    expect(inspect(source).violations).toHaveLength(1);
  }
});
test("database aliases, destructuring and bracket access remain tracked", () => {
  for (const source of [
    'const database = ctx.db; database.delete(id)',
    'const { db: database } = ctx; database.patch("posts", id, patch)',
    'const database = (ctx.db as Writer); database["replace"]("posts", id, value)',
    'ctx["db"]["insert"]("posts", value)',
  ]) expect(inspect(source).violations).toHaveLength(1);
});
test("captured database methods are refused; unrelated collection and string operations are not writers", () => {
  expect(inspect('const save = ctx.db.patch; save(id, value);').violations.some(row => row.reason === "captured-database-method")).toBe(true);
  expect(inspect('const { patch: save } = ctx.db; save(id, value);').violations.some(row => row.reason === "captured-database-method")).toBe(true);
  expect(inspect('set.delete(key); text.replace("old", "new"); ctx.storage.delete(blob);').writes).toEqual([]);
});
test("trust is limited to exact named hook functions, with surrounding writes still rejected", () => {
  const result = inspectMediaWriters('function guarded(ctx) { ctx.db.patch(id, value); } function bypass(ctx) { ctx.db.patch(id, value); }', { fileName: "media/attachmentGuard.ts", ownerTables: ["posts"], trustedFunctions: ["guarded"] });
  expect(result.writes).toHaveLength(2);
  expect(result.violations).toHaveLength(1);
  expect(result.violations[0].functionName).toBe("bypass");
});

test("assignment aliases and escaped database capabilities cannot create an unchecked writer", () => {
  expect(inspect('let database; database = ctx.db; database.patch("posts", id, patch);').violations.some(row => row.reason === "raw-owner-write")).toBe(true);
  expect(inspect('untrackedHelper(ctx.db);').violations.some(row => row.reason === "escaped-database-object")).toBe(true);
  expect(inspect('function exported(ctx) { return ctx.db; }').violations.some(row => row.reason === "escaped-database-object")).toBe(true);
});
test("local insert result declarations do not hide the enclosing trusted function", () => {
  const result = inspectMediaWriters('async function guarded(ctx) { const id = await ctx.db.insert(table, value); return id; }', { fileName: "media/attachmentGuard.ts", ownerTables: ["posts"], trustedFunctions: ["guarded"] });
  expect(result.violations).toEqual([]); expect(result.writes[0].functionName).toBe("guarded");
});
