/**
 * CalculationEditor — inspector panel for `calculation` + `product` fields.
 *
 * Form Calculation & Pricing System (the authoring surface). Edits the field's
 * `settings` JSON: formula(s), treatBlankAs, repeaterKey, priceKind / interval /
 * recurringLabel, number-format, and inline lookup tables. Live-validates the
 * formula (parse + dependency-graph) and surfaces inline cycle / unknown-ref /
 * parse warnings as the author types.
 *
 * Hard rules honored: Base UI / plain controls only (NO Radix); CSS variables
 * only (NO hardcoded color literals); full-page builder (this is an inline
 * inspector, not a modal). Persistence is handled by the parent's field-update
 * mutation — this component only mutates the in-memory `settings` object via
 * `onUpdate(key, value)`, matching the existing FieldSettingsPanel contract.
 */

import { useMemo } from "react";

import {
  parse,
  collectRefs,
  CalcError,
  buildDependencyGraph,
  collectUnknownRefs,
  formatCycle,
  type CalcFieldDef,
} from "@/components/forms/calc";

interface SiblingField {
  _id: string;
  label: string;
  name: string;
  key: string;
  type: string;
}

interface CalculationEditorProps {
  /** The field type being edited: "calculation" or "product". */
  type: string;
  /** The field's own key (excluded from its own ref suggestions). */
  fieldKey: string;
  /** Parsed `settings` object for this field. */
  settings: Record<string, any>;
  /** Update a single settings key (parent persists via the field-update mutation). */
  onUpdate: (key: string, value: unknown) => void;
  /** All sibling fields (for the `{field}` token inserter + graph validation). */
  siblingFields: SiblingField[];
}

const FN_HELP: Array<{ name: string; sig: string }> = [
  { name: "sum", sig: "sum(a, b, …) or sum({row.x})" },
  { name: "min", sig: "min(…) / max(…)" },
  { name: "count", sig: "count({row.x})" },
  { name: "average", sig: "average({row.x})" },
  { name: "round", sig: "round(x, places?)" },
  { name: "if", sig: "if(cond, a, b)" },
  { name: "lookup", sig: 'lookup({key}, "table")' },
];

export function CalculationEditor({
  type,
  fieldKey,
  settings,
  onUpdate,
  siblingFields,
}: CalculationEditorProps) {
  const isProduct = type === "product";

  // The primary formula key differs by type: `calculation` uses `formula`,
  // `product` (calculated price mode) uses `unitPriceFormula`.
  const priceMode = (settings.priceMode as string) ?? "fixed";
  const formulaKey = isProduct ? "unitPriceFormula" : "formula";
  const formula = (settings[formulaKey] as string) ?? "";

  // Live validation: parse the current formula + run the dependency graph across
  // siblings to detect cycles / unknown refs. Never throws — errors are shown.
  const validation = useMemo(() => {
    const warnings: string[] = [];
    if (formula.trim()) {
      try {
        const ast = parse(formula);
        const refs = collectRefs(ast);
        const knownKeys = new Set(siblingFields.map((f) => f.key));
        knownKeys.add(fieldKey);
        for (const ref of refs.fieldRefs) {
          if (!knownKeys.has(ref)) {
            warnings.push(`Unknown field reference: {${ref}}`);
          }
        }
      } catch (err) {
        if (err instanceof CalcError) {
          warnings.push(
            err.position > 0
              ? `${err.message} (at position ${err.position})`
              : err.message,
          );
        } else {
          warnings.push("Invalid formula.");
        }
      }
    }

    // Graph-level cycle check: model this field + siblings as computed defs.
    const calcDefs: CalcFieldDef[] = [
      ...siblingFields.map((f) => ({
        key: f.key,
        type: f.type,
        settings: undefined,
      })),
      {
        key: fieldKey,
        type,
        settings: JSON.stringify({ ...settings, [formulaKey]: formula }),
      },
    ];
    try {
      const { cycles } = buildDependencyGraph(calcDefs);
      for (const cycle of cycles) {
        if (cycle.includes(fieldKey)) {
          warnings.push(`Circular reference: ${formatCycle(cycle)}`);
        }
      }
      const unknown = collectUnknownRefs(calcDefs).filter(
        (u) => u.fieldKey === fieldKey,
      );
      for (const u of unknown) {
        const msg = `Unknown field reference: {${u.missingRef}}`;
        if (!warnings.includes(msg)) warnings.push(msg);
      }
    } catch {
      /* graph build never throws; defensive */
    }

    return warnings;
  }, [formula, formulaKey, fieldKey, type, settings, siblingFields]);

  const numberFormat = (settings.numberFormat as Record<string, any>) ?? {};

  function updateNumberFormat(key: string, value: unknown) {
    const next = { ...numberFormat };
    if (value === undefined || value === "" || value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onUpdate("numberFormat", next);
  }

  // The lookup-tables editor serializes `settings.tables` (tableName -> {key:num})
  // as a simple text format the author edits: one `tableName | key = value` line.
  const tablesText = useMemo(() => tablesToText(settings.tables), [settings.tables]);

  return (
    <div className="space-y-4">
      {/* Computed marker — these fields are always computed. */}
      <input type="hidden" value="computed" readOnly aria-hidden="true" />

      {/* Product price mode */}
      {isProduct && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Price Mode</label>
            <select
              value={priceMode}
              onChange={(e) => onUpdate("priceMode", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="fixed">Fixed price</option>
              <option value="userDefined">User-defined price</option>
              <option value="calculated">Calculated (formula)</option>
            </select>
          </div>
          {priceMode === "fixed" && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Unit Price</label>
              <input
                type="number"
                step="0.01"
                value={settings.unitPrice ?? ""}
                onChange={(e) =>
                  onUpdate("unitPrice", e.target.value ? parseFloat(e.target.value) : undefined)
                }
                className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Quantity Field Key
            </label>
            <input
              type="text"
              value={settings.quantityFieldKey ?? ""}
              onChange={(e) => onUpdate("quantityFieldKey", e.target.value || undefined)}
              placeholder="(default 1)"
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Formula textarea (calculation always; product only when calculated) */}
      {(!isProduct || priceMode === "calculated") && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {isProduct ? "Unit Price Formula" : "Formula"}
          </label>
          <textarea
            value={formula}
            onChange={(e) => onUpdate(formulaKey, e.target.value)}
            rows={3}
            placeholder="{state_fee} + {package_price} + sum({row.line_total})"
            className="w-full rounded-none border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-ring resize-y"
          />

          {/* Inline validation warnings */}
          {validation.length > 0 && (
            <ul className="mt-1 space-y-0.5" role="alert">
              {validation.map((w, i) => (
                <li key={i} className="text-[10px] text-destructive">
                  {w}
                </li>
              ))}
            </ul>
          )}

          {/* `{field}` token inserter */}
          {siblingFields.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] text-muted-foreground mr-1">Insert:</span>
              <div className="inline-flex flex-wrap gap-1">
                {siblingFields
                  .filter((f) => f.key !== fieldKey)
                  .map((f) => (
                    <button
                      key={f._id}
                      type="button"
                      onClick={() => onUpdate(formulaKey, `${formula}{${f.key}}`)}
                      title={f.label}
                      className="px-1.5 py-0.5 text-[10px] font-mono border border-border bg-muted/40 hover:bg-muted text-foreground"
                    >
                      {`{${f.key}}`}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Function helper */}
          <details className="mt-2">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
              Functions
            </summary>
            <ul className="mt-1 space-y-0.5">
              {FN_HELP.map((fn) => (
                <li key={fn.name} className="text-[10px] font-mono text-muted-foreground">
                  {fn.sig}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* treatBlankAs + repeaterKey */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Treat Blank As
          </label>
          <input
            type="number"
            value={settings.treatBlankAs ?? 0}
            onChange={(e) => onUpdate("treatBlankAs", parseFloat(e.target.value) || 0)}
            className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Repeater Key (for {"{row.*}"} aggregation)
          </label>
          <input
            type="text"
            value={settings.repeaterKey ?? ""}
            onChange={(e) => onUpdate("repeaterKey", e.target.value || undefined)}
            placeholder="(none)"
            className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Pricing semantics: priceKind + interval + recurringLabel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Price Kind</label>
          <select
            value={settings.priceKind ?? (isProduct ? "oneTime" : "none")}
            onChange={(e) => onUpdate("priceKind", e.target.value)}
            className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
          >
            {!isProduct && <option value="none">None (plain value)</option>}
            <option value="oneTime">One-time</option>
            <option value="recurring">Recurring</option>
          </select>
        </div>
        {settings.priceKind === "recurring" && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Interval</label>
              <select
                value={settings.interval ?? "month"}
                onChange={(e) => onUpdate("interval", e.target.value)}
                className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Recurring Label
              </label>
              <input
                type="text"
                value={settings.recurringLabel ?? ""}
                onChange={(e) => onUpdate("recurringLabel", e.target.value || undefined)}
                placeholder="first year, then $199/yr"
                className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              />
            </div>
          </>
        )}
      </div>

      {/* Number format */}
      <details className="border border-border rounded-none">
        <summary className="px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
          Number Format
        </summary>
        <div className="px-3 py-3 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Style</label>
            <select
              value={numberFormat.style ?? "decimal"}
              onChange={(e) => updateNumberFormat("style", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="decimal">Decimal</option>
              <option value="currency">Currency</option>
              <option value="percent">Percent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Currency</label>
            <input
              type="text"
              value={numberFormat.currency ?? "USD"}
              onChange={(e) => updateNumberFormat("currency", e.target.value || undefined)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Decimals</label>
            <input
              type="number"
              min={0}
              max={4}
              value={numberFormat.decimals ?? 2}
              onChange={(e) => updateNumberFormat("decimals", parseInt(e.target.value) || 0)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Prefix</label>
            <input
              type="text"
              value={numberFormat.prefix ?? ""}
              onChange={(e) => updateNumberFormat("prefix", e.target.value || undefined)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Suffix</label>
            <input
              type="text"
              value={numberFormat.suffix ?? ""}
              onChange={(e) => updateNumberFormat("suffix", e.target.value || undefined)}
              placeholder="/yr"
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={numberFormat.thousandsSeparator ?? true}
                onChange={(e) => updateNumberFormat("thousandsSeparator", e.target.checked)}
                className="size-3.5"
              />
              <span className="text-xs text-foreground">Thousands separator</span>
            </label>
          </div>
        </div>
      </details>

      {/* Lookup tables (inline) */}
      <details className="border border-border rounded-none">
        <summary className="px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
          Lookup Tables
        </summary>
        <div className="px-3 py-3 border-t border-border">
          <label className="block text-xs text-muted-foreground mb-1">
            One per line: <code>tableName | key = value</code>
          </label>
          <textarea
            value={tablesText}
            onChange={(e) => onUpdate("tables", textToTables(e.target.value))}
            rows={5}
            placeholder={'filingFees | New York = 200\nfilingFees | Texas = 300\npackages | Advanced = 249'}
            className="w-full rounded-none border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-ring resize-y"
          />
        </div>
      </details>
    </div>
  );
}

// ─── tables <-> text ─────────────────────────────────────────────────────────

function tablesToText(
  tables: Record<string, Record<string, number>> | undefined,
): string {
  if (!tables || typeof tables !== "object") return "";
  const lines: string[] = [];
  for (const [table, entries] of Object.entries(tables)) {
    if (!entries || typeof entries !== "object") continue;
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${table} | ${key} = ${value}`);
    }
  }
  return lines.join("\n");
}

function textToTables(
  text: string,
): Record<string, Record<string, number>> | undefined {
  const tables: Record<string, Record<string, number>> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pipe = trimmed.indexOf("|");
    const eq = trimmed.indexOf("=");
    if (pipe === -1 || eq === -1 || eq < pipe) continue;
    const table = trimmed.slice(0, pipe).trim();
    const key = trimmed.slice(pipe + 1, eq).trim();
    const value = Number(trimmed.slice(eq + 1).trim());
    if (!table || !key || !Number.isFinite(value)) continue;
    if (!tables[table]) tables[table] = {};
    tables[table][key] = value;
  }
  return Object.keys(tables).length > 0 ? tables : undefined;
}
