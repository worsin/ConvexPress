/**
 * ConvexPress Forms — Calculation & Pricing core: barrel
 *
 * CANONICAL SOURCE (authored once, mirrored byte-identically). See grammar.ts.
 * MIRRORS:
 *   - Admin FE: apps/web/src/components/forms/calc/index.ts
 *   - Website:  ConvexPress-Website/apps/web/src/lib/forms/calc/index.ts
 *
 * Single import surface for the formula engine. Hosts import from "./calc"
 * (server) / the mirrored path (clients) and never reach into the submodules.
 */

export {
  CalcError,
  BIN_PRECEDENCE,
  RIGHT_ASSOC,
  FN_ARITY,
  AGGREGATE_FNS,
  MAX_NODES,
  MAX_DEPTH,
  MAX_FORMULA_LENGTH,
  type Node,
  type BinOp,
  type FnName,
} from "./grammar";

export { parse, collectRefs } from "./parse";

export {
  evalAst,
  toNumber,
  applyBinOp,
  roundHalfUp,
  type Scope,
  type RepeaterRow,
} from "./evaluate";

export { formatNumber, type NumberFormat } from "./format";

export {
  buildDependencyGraph,
  findCycles,
  collectUnknownRefs,
  collectFormulaErrors,
  formatCycle,
  isComputedField,
  formulasOf,
  fieldRefsOf,
  COMPUTED_TYPES,
  type CalcFieldDef,
  type DependencyGraph,
} from "./graph";

export {
  recomputeForm,
  recomputeAuthoritative,
  type PricingResult,
  type RecurringLine,
  type PricingLineItem,
  type ProductLine,
  type RecomputeResult,
  type AuthoritativeResult,
  type AuthoritativeValue,
  type Interval,
  type PriceKind,
} from "./recompute";
