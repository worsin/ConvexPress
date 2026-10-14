import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findUntypedTableIdentities } from "../typing/check-table-identities";

// A minimal Convex directory: a data model with three tables and one module
// exercising every rule next to its typed (accepted) counterpart.
const convexDir = realpathSync(mkdtempSync(join(tmpdir(), "table-identities-")));
afterAll(() => rmSync(convexDir, { recursive: true, force: true }));
mkdirSync(join(convexDir, "_generated"));
writeFileSync(join(convexDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ESNext", module: "ESNext", moduleResolution: "Bundler" }, include: ["./**/*"] }));
writeFileSync(join(convexDir, "_generated", "dataModel.d.ts"), 'export type TableNames = "posts" | "revisions" | "users";\n');
const lines = [
  'import type { TableNames } from "./_generated/dataModel";',
  'export function owns(table: string) { return table === "posts"; }', // 2: comparison
  'export function ownsTyped(table: TableNames) { return table === "posts"; }',
  'export function kind(value: "posts" | "pages") { return value === "posts"; }', // a closed union of kinds
  'export function pick(table: string) { switch (table) { case "users": return 1; } return 0; }', // 5: case
  'export function take(table: string) { return table; }',
  'export function takeTyped<T extends TableNames>(table: T) { return table; }',
  'export function label(name: string) { return name; }',
  'take("posts"); takeTyped("posts"); label("posts");', // 9: argument (only `take`)
  'export const write: { table: string } = { table: "users" };', // 10: property
  'export const typedWrite: { table: TableNames } = { table: "users" };',
  'export const counts = { posts: 1, users: 2 };', // 12: keys, no contextual type
  'export const record: Record<string, number> = { posts: 1, users: 2 };', // 13: keys, string index
  'export const keyed = { posts: 1, users: 2 } satisfies Partial<Record<TableNames, number>>;',
  'export const mixed = { posts: 1, other: 2 };',
];
writeFileSync(join(convexDir, "module.ts"), `${lines.join("\n")}\n`);
writeFileSync(join(convexDir, "module.test.ts"), 'export function ignored(table: string) { return table === "posts"; }\n');

test("reports every untyped table position and accepts typed ones", () => {
  const { tables, findings } = findUntypedTableIdentities(convexDir);
  expect(tables).toBe(3);
  expect(findings.map(({ file, line, literal, rule, subject }) => ({ file, line, literal, rule, subject }))).toEqual([
    { file: "module.ts", line: 2, literal: "posts", rule: "comparison", subject: "table" },
    { file: "module.ts", line: 5, literal: "users", rule: "comparison", subject: "table" },
    { file: "module.ts", line: 9, literal: "posts", rule: "argument", subject: "table" },
    { file: "module.ts", line: 10, literal: "users", rule: "property", subject: "table" },
    { file: "module.ts", line: 12, literal: "posts", rule: "key", subject: "posts" },
    { file: "module.ts", line: 12, literal: "users", rule: "key", subject: "users" },
    { file: "module.ts", line: 13, literal: "posts", rule: "key", subject: "posts" },
    { file: "module.ts", line: 13, literal: "users", rule: "key", subject: "users" },
  ]);
});
