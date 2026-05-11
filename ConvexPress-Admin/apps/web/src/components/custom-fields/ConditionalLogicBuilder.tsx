/**
 * ConditionalLogicBuilder - Per-field conditional logic rules
 *
 * Allows configuring show/hide rules based on sibling field values.
 * Rules use AND/OR logic.
 */

import { useCallback, useMemo } from "react";
import { PlusIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ConditionalRule {
  field: string;
  operator: "==" | "!=" | ">" | "<" | "contains" | "empty" | "not_empty";
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
}

const OPERATORS = [
  { value: "==", label: "is equal to" },
  { value: "!=", label: "is not equal to" },
  { value: ">", label: "is greater than" },
  { value: "<", label: "is less than" },
  { value: "contains", label: "contains" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
];

export function ConditionalLogicBuilder({
  value,
  onChange,
  siblingFields,
}: ConditionalLogicBuilderProps) {
  const parsed: ConditionalLogicData = useMemo(() => {
    if (!value) {
      return {
        action: "show",
        logic: "and",
        rules: [],
      };
    }
    try {
      return JSON.parse(value);
    } catch {
      return {
        action: "show",
        logic: "and",
        rules: [],
      };
    }
  }, [value]);

  const update = useCallback(
    (data: ConditionalLogicData) => {
      if (data.rules.length === 0) {
        onChange(undefined);
      } else {
        onChange(JSON.stringify(data));
      }
    },
    [onChange],
  );

  const addRule = useCallback(() => {
    const defaultField = siblingFields[0]?.key ?? "";
    update({
      ...parsed,
      rules: [
        ...parsed.rules,
        { field: defaultField, operator: "==", value: "" },
      ],
    });
  }, [parsed, siblingFields, update]);

  const removeRule = useCallback(
    (index: number) => {
      update({
        ...parsed,
        rules: parsed.rules.filter((_, i) => i !== index),
      });
    },
    [parsed, update],
  );

  const updateRule = useCallback(
    (index: number, updates: Partial<ConditionalRule>) => {
      const newRules = [...parsed.rules];
      newRules[index] = { ...newRules[index], ...updates };
      update({ ...parsed, rules: newRules });
    },
    [parsed, update],
  );

  const isValueless = (op: string) => op === "empty" || op === "not_empty";

  return (
    <div className="space-y-3">
      {/* Action and Logic selectors */}
      <div className="flex items-center gap-2 text-xs">
        <select
          value={parsed.action}
          onChange={(e) =>
            update({ ...parsed, action: e.target.value as "show" | "hide" })
          }
          className="h-7 rounded-none border border-border bg-background px-2 text-xs"
        >
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </select>
        <span className="text-muted-foreground">this field when</span>
        <select
          value={parsed.logic}
          onChange={(e) =>
            update({ ...parsed, logic: e.target.value as "and" | "or" })
          }
          className="h-7 rounded-none border border-border bg-background px-2 text-xs"
        >
          <option value="and">all</option>
          <option value="or">any</option>
        </select>
        <span className="text-muted-foreground">rules match:</span>
      </div>

      {/* Rules */}
      {parsed.rules.map((rule, index) => (
        <div key={`rule-${rule.field}-${rule.operator}-${index}`} className="flex items-center gap-2">
          {/* Field selector */}
          <select
            value={rule.field}
            onChange={(e) => updateRule(index, { field: e.target.value })}
            className="h-7 rounded-none border border-border bg-background px-2 text-xs flex-1"
          >
            {siblingFields.length === 0 ? (
              <option value="">No sibling fields</option>
            ) : (
              siblingFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))
            )}
          </select>

          {/* Operator */}
          <select
            value={rule.operator}
            onChange={(e) =>
              updateRule(index, { operator: e.target.value as ConditionalRule["operator"] })
            }
            className="h-7 w-32 rounded-none border border-border bg-background px-2 text-xs shrink-0"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>

          {/* Value (hidden for empty/not_empty operators) */}
          {!isValueless(rule.operator) && (
            <input
              type="text"
              value={rule.value}
              onChange={(e) => updateRule(index, { value: e.target.value })}
              placeholder="Value"
              className="h-7 rounded-none border border-border bg-background px-2 text-xs flex-1 focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          )}

          {/* Remove */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => removeRule(index)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <TrashIcon className="size-3" />
          </Button>
        </div>
      ))}

      {/* Add rule */}
      <Button variant="ghost" size="xs" onClick={addRule}>
        <PlusIcon className="size-3" />
        Add Rule
      </Button>
    </div>
  );
}
