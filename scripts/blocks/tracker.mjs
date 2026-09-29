import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import {validateRendererEvidence} from "./verification-evidence.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
export const TRACKER = Object.freeze({ baseId: "p5771rm40m4pjw4q4t4x9kdbb18dnm0b", tableId: "q97ft31dnn52vbeha9fdd3zfg98dv4sq" });
const run = promisify(execFile);
export function parseTrackerRows(value) {
  if (!Array.isArray(value)) throw new Error("Tracker export must be a complete flat array of named records");
  const names = new Set();
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.Name !== "string" || !/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(row.Name)) throw new Error("Tracker row has a missing or invalid Name");
    if (names.has(row.Name)) throw new Error(`Duplicate tracker block ${row.Name}`);
    names.add(row.Name);
    if (!["Planned", "Spec written", "In progress", "Built", "Verified"].includes(row.Status) || typeof row["Spec Path"] !== "string" || !row["Spec Path"].endsWith("/block.json")) throw new Error(`Tracker metadata is incomplete for ${row.Name}`);
  }
  return value;
}
export async function readTrackerFile(file) {
  const text = await readFile(file, "utf8");
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error("Tracker export exceeds 8 MiB");
  return parseTrackerRows(JSON.parse(text));
}
export async function collectTracker(readPage) {
  const records = [], rowIds = new Set();
  let matched, fields;
  for (let page = 0; page < 100; page++) {
    const response = await readPage(records.length);
    if (response?.context?.base?.id !== TRACKER.baseId || response?.context?.table?.id !== TRACKER.tableId) throw new Error("Tracker response belongs to a different base or table");
    const summary = response.summary;
    if (!summary || !Array.isArray(response.records) || !Number.isInteger(summary.matched) || summary.matched < 0 || summary.matched > 2000 || summary.offset !== records.length || summary.returned !== response.records.length || !Number.isInteger(summary.limit) || summary.limit < summary.returned || summary.scanned < summary.matched) throw new Error("Invalid or incomplete tracker pagination metadata");
    if (matched !== undefined && matched !== summary.matched) throw new Error("Tracker inventory changed during pagination; retry the check");
    matched = summary.matched;
    for (const record of response.records) {
      if (typeof record.id !== "string" || rowIds.has(record.id)) throw new Error("Tracker pagination returned a duplicate or invalid row ID");
      rowIds.add(record.id);
      const selected = ["Name", "Status", "Spec Path"].map(name => record.fieldIds?.[name]);
      if (selected.some(value => typeof value !== "string" || !value) || new Set(selected).size !== 3) throw new Error("Tracker required field metadata is missing");
      if (fields && JSON.stringify(fields) !== JSON.stringify(selected)) throw new Error("Tracker schema changed during pagination");
      fields = selected;
      records.push({ ...record.values, rowId: record.id });
    }
    if (records.length === matched) return parseTrackerRows(records);
    if (!response.records.length || records.length > matched) throw new Error("Tracker inventory was truncated");
  }
  throw new Error("Tracker pagination exceeded its bounded page budget");
}
export async function pullTracker() {
  return await collectTracker(async offset => {
    const { stdout } = await run("mt", ["table", "records", TRACKER.tableId, "--fields", "Name,Status,Spec Path", "--sort", "Name:asc", "--limit", "100", "--offset", String(offset), "--format", "compact"], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout);
  });
}
async function localTests(folder) {
  let entries;
  try { entries = await readdir(folder, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const tests = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("Verification evidence must not be a symlink");
    const file = path.join(folder, entry.name);
    if (entry.isFile() && /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) && (await lstat(file)).size > 0) tests.push(file);
    if (entry.isDirectory() && ["tests", "__tests__"].includes(entry.name)) tests.push(...await localTests(file));
  }
  return tests;
}
export async function reconcileTracker({ root, discovered, rows, rendererEvidence }) {
  if (rendererEvidence !== undefined) await validateRendererEvidence({root, discovered, evidence: rendererEvidence});
  const indexed = new Map(parseTrackerRows(rows).map(row => [row.Name, row]));
  const specs = new Map(discovered.blocks.map(block => [block.spec.name, block]));
  for (const block of discovered.blocks) {
    const row = indexed.get(block.spec.name);
    if (!row) throw new Error(`Repository block ${block.spec.name} is missing from the Standalone tracker`);
    if (row["Spec Path"] !== block.source) throw new Error(`Tracker Spec Path differs for ${block.spec.name}: ${row["Spec Path"]}`);
  }
  for (const row of rows.filter(row => row.Status === "Verified")) {
    const block = specs.get(row.Name);
    if (!block) throw new Error(`Verified tracker block ${row.Name} has no discovered specification`);
    if (rendererEvidence === undefined && !(await localTests(path.dirname(path.join(root, block.source)))).length) throw new Error(`Verified tracker block ${row.Name} lacks tests in its block folder`);
    if (!discovered.packs.length) throw new Error(`Cannot verify screenshot coverage without discovered packs`);
    for (const pack of discovered.packs) {
      const screenshot = path.join(root, "ConvexPress-Admin/output/playwright/blocks", pack.id, `${row.Name}.png`);
      let image;
      try {
        if ((await lstat(screenshot)).isSymbolicLink()) throw new Error("Screenshot evidence must not be a symlink");
        image = await readFile(screenshot);
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (!image || image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Verified tracker block ${row.Name} lacks a PNG screenshot under ${pack.id}`);
    }
  }
  return { inventory: rows.length, specifications: discovered.blocks.length, verified: rows.filter(row => row.Status === "Verified").length };
}
