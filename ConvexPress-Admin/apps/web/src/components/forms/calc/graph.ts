/**
 * ConvexPress Forms — Calculation & Pricing core: dependency graph
 *
 * CANONICAL SOURCE (authored once, mirrored byte-identically). See grammar.ts.
 * MIRRORS:
 *   - Admin FE: apps/web/src/components/forms/calc/graph.ts
 *   - Website:  ConvexPress-Website/apps/web/src/lib/forms/calc/graph.ts
 *
 * Builds the DAG over COMPUTED fields (type ∈ {calculation, product} OR
 * settings.computed === true). `buildDependencyGraph` returns a topological
 * evaluation order (Kahn) and, when the graph is cyclic, the named cycles
 * (DFS). `collectUnknownRefs` flags `{field_key}` references that match no field
 * `key` (a save-time error). Pure: parsing is the only work; no I/O.
 */

import { parse, collectRefs } from "./parse";
import { CalcError } from "./grammar";

// ─── Field-def shape ────────────────────────────────────────────────────────

/**
 * The subset of a `fieldDefinitions` row this graph reads. Structural (not the
 * generated Doc type) so the three mirrors share one shape. The server passes
 * real Docs; they satisfy this.
 */
export interface CalcFieldDef {
  /** Stable `key` (what formulas reference + what values are keyed by). */
  key: string;
  /** Human label used in order summaries; optional for pure test fixtures. */
  label?: string | null;
  /** Admin/internal name fallback used when a label is absent. */
  name?: string | null;
  /** Field type slug (e.g. "text", "calculation", "product"). */
  type: string;
  /** Serialized settings JSON; may carry `formula`, `unitPriceFormula`, `computed`. */
  settings?: string | null;
}

/** Result of {@link buildDependencyGraph}. */
export interface DependencyGraph {
  /** Topo order of computed field keys. Length < computed.length ⇒ a cycle. */
  order: string[];
  /** Each detected cycle's field keys; `[]` when acyclic. */
  cycles: string[][];
}

// ─── Settings helpers ───────────────────────────────────────────────────────

/** Field types that are ALWAYS computed regardless of `settings.computed`. */
export const COMPUTED_TYPES: Set<string> = new Set(["calculation", "product"]);

function parseSettings(settings: string | undefined | null): Record<string, unknown> {
  if (!settings) return {};
  try {
    const parsed = JSON.parse(settings);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Whether a field participates in the recompute pipeline (a computed node). */
export function isComputedField(def: CalcFieldDef): boolean {
  if (COMPUTED_TYPES.has(def.type)) return true;
  const settings = parseSettings(def.settings);
  return settings.computed === true;
}

/**
 * Every formula string a computed field carries. A `calculation` reads
 * `settings.formula`; a `product` may read `settings.unitPriceFormula` (when
 * priceMode === "calculated"). Both are collected so all `{refs}` feed the graph.
 */
export function formulasOf(def: CalcFieldDef): string[] {
  const settings = parseSettings(def.settings);
  const out: string[] = [];
  if (typeof settings.formula === "string" && settings.formula.trim()) {
    out.push(settings.formula);
  }
  if (
    typeof settings.unitPriceFormula === "string" &&
    settings.unitPriceFormula.trim()
  ) {
    out.push(settings.unitPriceFormula);
  }
  // A product's quantity may be driven by another field key (an edge, not a
  // formula). Surfaced here so the graph sees the dependency.
  if (
    typeof settings.quantityFieldKey === "string" &&
    settings.quantityFieldKey.trim()
  ) {
    out.push(`{${settings.quantityFieldKey}}`);
  }
  return out;
}

/**
 * Collect the `{field_key}` references a computed field reads across all of its
 * formulas. Parse errors are swallowed here (the formula validator surfaces them
 * separately) so a single bad formula can't crash graph construction.
 */
export function fieldRefsOf(def: CalcFieldDef): Set<string> {
  const refs = new Set<string>();
  for (const formula of formulasOf(def)) {
    try {
      const ast = parse(formula);
      const collected = collectRefs(ast);
      for (const r of collected.fieldRefs) refs.add(r);
    } catch {
      // Ignore — invalid formulas are reported by collectFormulaErrors.
    }
  }
  return refs;
}

// ─── Graph build ────────────────────────────────────────────────────────────

/**
 * Build the computed-field dependency graph and topologically order it (Kahn's
 * algorithm). Edges exist ONLY between computed fields — references to plain
 * input fields are sources (they contribute no in-degree). When the result is
 * shorter than the computed set, a cycle exists and {@link findCycles} names it.
 */
export function buildDependencyGraph(fields: CalcFieldDef[]): DependencyGraph {
  const computed = fields.filter(isComputedField);
  const computedKeys = new Set(computed.map((f) => f.key));

  // key -> referenced COMPUTED keys (input refs dropped as sources).
  const refsOf = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  for (const f of computed) {
    const allRefs = fieldRefsOf(f);
    const computedRefs = new Set<string>();
    for (const r of allRefs) {
      if (computedKeys.has(r) && r !== f.key) computedRefs.add(r);
      else if (r === f.key) computedRefs.add(r); // self-ref → counts (a 1-cycle)
    }
    refsOf.set(f.key, computedRefs);
    indeg.set(f.key, 0);
  }

  // In-degree = number of computed deps each field references.
  for (const [key, refs] of refsOf) {
    let degree = 0;
    for (const r of refs) {
      if (refsOf.has(r)) degree += 1;
    }
    indeg.set(key, degree);
  }

  // Kahn: repeatedly emit zero-in-degree nodes.
  const queue: string[] = [];
  for (const [k, d] of indeg) {
    if (d === 0) queue.push(k);
  }
  const order: string[] = [];
  while (queue.length) {
    const k = queue.shift()!;
    order.push(k);
    for (const [other, refs] of refsOf) {
      if (refs.has(k)) {
        const next = (indeg.get(other) ?? 0) - 1;
        indeg.set(other, next);
        if (next === 0) queue.push(other);
      }
    }
  }

  const cycles =
    order.length === computed.length ? [] : findCycles(refsOf, new Set(order));
  return { order, cycles };
}

/**
 * Find cycles among the nodes NOT emitted by the topo sort. Standard DFS
 * three-color back-edge detection over the residual subgraph; returns each
 * cycle's keys (in dependency order).
 */
export function findCycles(
  refsOf: Map<string, Set<string>>,
  resolved: Set<string>,
): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const key of refsOf.keys()) {
    color.set(key, resolved.has(key) ? BLACK : WHITE);
  }

  const cycles: string[][] = [];
  const stack: string[] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of refsOf.get(node) ?? []) {
      if (!refsOf.has(next)) continue;
      const c = color.get(next);
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        if (idx >= 0) cycles.push(stack.slice(idx));
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const key of refsOf.keys()) {
    if (color.get(key) === WHITE) dfs(key);
  }
  return cycles;
}

// ─── Unknown-ref + formula-error collection (save-time) ─────────────────────

/**
 * Collect `{field_key}` references (across all computed fields) that match no
 * field `key` among `fields`. Returns `{ fieldKey, missingRef }` pairs so the
 * builder can name the offending field + the dangling reference.
 */
export function collectUnknownRefs(
  fields: CalcFieldDef[],
): Array<{ fieldKey: string; missingRef: string }> {
  const knownKeys = new Set(fields.map((f) => f.key));
  const out: Array<{ fieldKey: string; missingRef: string }> = [];
  for (const def of fields) {
    if (!isComputedField(def)) continue;
    for (const ref of fieldRefsOf(def)) {
      if (!knownKeys.has(ref)) {
        out.push({ fieldKey: def.key, missingRef: ref });
      }
    }
  }
  return out;
}

/**
 * Collect parse errors across all computed fields' formulas. Returns
 * `{ fieldKey, message, position }` so the builder can surface a friendly,
 * position-aware error. Empty when every formula parses.
 */
export function collectFormulaErrors(
  fields: CalcFieldDef[],
): Array<{ fieldKey: string; message: string; position: number }> {
  const out: Array<{ fieldKey: string; message: string; position: number }> = [];
  for (const def of fields) {
    if (!isComputedField(def)) continue;
    for (const formula of formulasOf(def)) {
      try {
        parse(formula);
      } catch (err) {
        if (err instanceof CalcError) {
          out.push({
            fieldKey: def.key,
            message: err.message,
            position: err.position,
          });
        } else {
          out.push({
            fieldKey: def.key,
            message: "Invalid formula.",
            position: 0,
          });
        }
      }
    }
  }
  return out;
}

/** Format a single cycle's keys as a human-readable "a → b → a" string. */
export function formatCycle(cycle: string[]): string {
  if (cycle.length === 0) return "";
  return [...cycle, cycle[0]].join(" → ");
}
