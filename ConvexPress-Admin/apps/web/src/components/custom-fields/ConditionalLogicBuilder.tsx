/**
 * ConditionalLogicBuilder - rules on sibling field values, joined by all/any.
 *
 * Used for a field (show/hide it), and for a form's notifications,
 * confirmations and actions, which pass their own wording: "Run this action
 * when all rules match". The stored shape is `{ action, logic, rules }`;
 * removing the last rule clears the logic (onChange(undefined)).
 */

import { useCallback, useMemo } from "react";
import { PlusIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

const OPERATORS = [
  { value: "==", label: "is equal to" },
  { value: "!=", label: "is not equal to" },
  { value: ">", label: "is greater than" },
  { value: "<", label: "is less than" },
  { value: "contains", label: "contains" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
] as const;

type Operator = (typeof OPERATORS)[number]["value"];

interface ConditionalRule {
  field: string;
  operator: Operator;
  value: string;
}

interface ConditionalLogicData {
  action: "show" | "hide";
  logic: "and" | "or";
  rules: ConditionalRule[];
}

interface ConditionalLogicBuilderProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  siblingFields: Array<{
    _id: string;
    label: string;
    name: string;
    key: string;
    type: string;
  }>;
  /** What the rules decide about: "this field" (default), "this action", … */
  subject?: string;
  /** The two outcomes, as verbs: Show/Hide (default), Run/Skip, Send/Don't send. */
  verbs?: { show: string; hide: string };
}

const EMPTY: ConditionalLogicData = { action: "show", logic: "and", rules: [] };

function isOperator(value: unknown): value is Operator {
  return OPERATORS.some((operator) => operator.value === value);
}

function readRule(raw: unknown): ConditionalRule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const field: unknown = Reflect.get(raw, "field");
  const operator: unknown = Reflect.get(raw, "operator");
  const value: unknown = Reflect.get(raw, "value");
  if (typeof field !== "string" || !isOperator(operator)) return null;
  return { field, operator, value: typeof value === "string" ? value : value === undefined ? "" : String(value) };
}

/** The stored logic, read field by field; anything malformed reads as no rules. */
function readLogic(value: string | undefined): ConditionalLogicData {
  if (!value) return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return EMPTY;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY;
  const action: unknown = Reflect.get(parsed, "action");
  const logic: unknown = Reflect.get(parsed, "logic");
  const rules: unknown = Reflect.get(parsed, "rules");
  return {
    action: action === "hide" ? "hide" : "show",
    logic: logic === "or" ? "or" : "and",
    rules: Array.isArray(rules) ? rules.map(readRule).filter((rule): rule is ConditionalRule => rule !== null) : [],
  };
}

export function ConditionalLogicBuilder({
  value,
  onChange,
  siblingFields,
  subject = "this field",
  verbs = { show: "Show", hide: "Hide" },
}: ConditionalLogicBuilderProps) {
  const parsed = useMemo(() => readLogic(value), [value]);

  const update = useCallback(
    (data: ConditionalLogicData) => {
      onChange(data.rules.length === 0 ? undefined : JSON.stringify(data));
    },
    [onChange],
  );

  const addRule = useCallback(() => {
    update({
      ...parsed,
      rules: [...parsed.rules, { field: siblingFields[0]?.key ?? "", operator: "==", value: "" }],
    });
  }, [parsed, siblingFields, update]);

  const removeRule = useCallback(
    (index: number) => update({ ...parsed, rules: parsed.rules.filter((_, i) => i !== index) }),
    [parsed, update],
  );

  const updateRule = useCallback(
    (index: number, updates: Partial<ConditionalRule>) =>
      update({ ...parsed, rules: parsed.rules.map((rule, i) => (i === index ? { ...rule, ...updates } : rule)) }),
    [parsed, update],
  );

  const isValueless = (op: Operator) => op === "empty" || op === "not_empty";
  const selectClass = "h-7 rounded-none border border-border bg-background px-2 text-xs";

  return (
    <div className="space-y-3">
      {parsed.rules.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="Outcome"
            value={parsed.action}
            onChange={(e) => update({ ...parsed, action: e.target.value === "hide" ? "hide" : "show" })}
            className={selectClass}
          >
            <option value="show">{verbs.show}</option>
            <option value="hide">{verbs.hide}</option>
          </select>
          <span className="text-muted-foreground">{subject} when</span>
          <select
            aria-label="Match"
            value={parsed.logic}
            onChange={(e) => update({ ...parsed, logic: e.target.value === "or" ? "or" : "and" })}
            className={selectClass}
          >
            <option value="and">all</option>
            <option value="or">any</option>
          </select>
          <span className="text-muted-foreground">of these rules match:</span>
        </div>
      ) : null}

      {parsed.rules.map((rule, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            aria-label={`Rule ${index + 1} field`}
            value={rule.field}
            onChange={(e) => updateRule(index, { field: e.target.value })}
            className={`${selectClass} flex-1`}
          >
            {siblingFields.length === 0 ? (
              <option value="">No fields on this form</option>
            ) : (
              siblingFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label || f.name}
                </option>
              ))
            )}
          </select>

          <select
            aria-label={`Rule ${index + 1} comparison`}
            value={rule.operator}
            onChange={(e) => {
              const operator = e.target.value;
              if (isOperator(operator)) updateRule(index, { operator });
            }}
            className={`${selectClass} w-32 shrink-0`}
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>

          {!isValueless(rule.operator) && (
            <input
              type="text"
              aria-label={`Rule ${index + 1} value`}
              value={rule.value}
              onChange={(e) => updateRule(index, { value: e.target.value })}
              placeholder="Value"
              className="h-7 flex-1 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => removeRule(index)}
            aria-label={`Remove rule ${index + 1}`}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <TrashIcon className="size-3" />
          </Button>
        </div>
      ))}

      <Button variant="ghost" size="xs" onClick={addRule}>
        <PlusIcon className="size-3" />
        Add rule
      </Button>
    </div>
  );
}
