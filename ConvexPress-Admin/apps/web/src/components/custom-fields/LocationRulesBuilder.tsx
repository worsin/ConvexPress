/**
 * LocationRulesBuilder - AND/OR rule builder for field group location
 *
 * Builds an array of rule groups (OR logic between groups, AND logic within).
 * Each condition has param, operator, and value.
 */

import { useCallback } from "react";
import { PlusIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface LocationCondition {
  param: string;
  operator: "==" | "!=";
  value: string;
}

interface LocationRulesBuilderProps {
  rules: LocationCondition[][];
  onChange: (rules: LocationCondition[][]) => void;
}

/** Available location rule parameters */
const LOCATION_PARAMS = [
  { value: "post_type", label: "Post Type" },
  { value: "post_template", label: "Post Template" },
  { value: "post_status", label: "Post Status" },
  { value: "post_category", label: "Post Category" },
  { value: "page_template", label: "Page Template" },
  { value: "page_type", label: "Page Type" },
  { value: "page_parent", label: "Page Parent" },
  { value: "current_user_role", label: "Current User Role" },
  { value: "taxonomy", label: "Taxonomy" },
];

/** Values for each parameter */
const PARAM_VALUES: Record<string, Array<{ value: string; label: string }>> = {
  post_type: [
    { value: "post", label: "Post" },
    { value: "page", label: "Page" },
  ],
  post_status: [
    { value: "draft", label: "Draft" },
    { value: "pending", label: "Pending Review" },
    { value: "publish", label: "Published" },
    { value: "future", label: "Scheduled" },
    { value: "private", label: "Private" },
  ],
  page_type: [
    { value: "front_page", label: "Front Page" },
    { value: "posts_page", label: "Posts Page" },
    { value: "top_level", label: "Top Level" },
    { value: "parent", label: "Parent" },
    { value: "child", label: "Child" },
  ],
  current_user_role: [
    { value: "administrator", label: "Administrator" },
    { value: "editor", label: "Editor" },
    { value: "author", label: "Author" },
    { value: "contributor", label: "Contributor" },
    { value: "subscriber", label: "Subscriber" },
  ],
};

export function LocationRulesBuilder({
  rules,
  onChange,
}: LocationRulesBuilderProps) {
  // --- Add a new empty rule group ---
  const addGroup = useCallback(() => {
    onChange([
      ...rules,
      [{ param: "post_type", operator: "==", value: "post" }],
    ]);
  }, [rules, onChange]);

  // --- Add a condition to a group ---
  const addCondition = useCallback(
    (groupIndex: number) => {
      const newRules = [...rules];
      newRules[groupIndex] = [
        ...newRules[groupIndex],
        { param: "post_type", operator: "==", value: "post" },
      ];
      onChange(newRules);
    },
    [rules, onChange],
  );

  // --- Remove a condition ---
  const removeCondition = useCallback(
    (groupIndex: number, conditionIndex: number) => {
      const newRules = [...rules];
      newRules[groupIndex] = newRules[groupIndex].filter(
        (_, i) => i !== conditionIndex,
      );
      // If group is now empty, remove it
      if (newRules[groupIndex].length === 0) {
        newRules.splice(groupIndex, 1);
      }
      onChange(newRules);
    },
    [rules, onChange],
  );

  // --- Remove entire group ---
  const removeGroup = useCallback(
    (groupIndex: number) => {
      const newRules = rules.filter((_, i) => i !== groupIndex);
      onChange(newRules);
    },
    [rules, onChange],
  );

  // --- Update a condition ---
  const updateCondition = useCallback(
    (
      groupIndex: number,
      conditionIndex: number,
      updates: Partial<LocationCondition>,
    ) => {
      const newRules = [...rules];
      newRules[groupIndex] = [...newRules[groupIndex]];
      newRules[groupIndex][conditionIndex] = {
        ...newRules[groupIndex][conditionIndex],
        ...updates,
      };

      // When param changes, reset value to first available option
      if (updates.param) {
        const values = PARAM_VALUES[updates.param];
        if (values && values.length > 0) {
          newRules[groupIndex][conditionIndex].value = values[0].value;
        } else {
          newRules[groupIndex][conditionIndex].value = "";
        }
      }

      onChange(newRules);
    },
    [rules, onChange],
  );

  return (
    <div className="space-y-3">
      {rules.map((group, groupIndex) => (
        <div key={groupIndex}>
          {/* OR separator between groups */}
          {groupIndex > 0 && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-2">
                or
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Rule group */}
          <div className="border border-border bg-muted/5 p-3 space-y-2">
            {group.map((condition, condIndex) => (
              <div key={condIndex} className="flex items-center gap-2">
                {/* AND label for subsequent conditions */}
                {condIndex > 0 && (
                  <span className="text-[10px] font-medium uppercase text-muted-foreground w-8 text-center shrink-0">
                    and
                  </span>
                )}
                {condIndex === 0 && <span className="w-8 shrink-0" />}

                {/* Param */}
                <select
                  value={condition.param}
                  onChange={(e) =>
                    updateCondition(groupIndex, condIndex, {
                      param: e.target.value,
                    })
                  }
                  className="h-7 rounded-none border border-border bg-background px-2 text-xs flex-1"
                >
                  {LOCATION_PARAMS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={condition.operator}
                  onChange={(e) =>
                    updateCondition(groupIndex, condIndex, {
                      operator: e.target.value as "==" | "!=",
                    })
                  }
                  className="h-7 w-24 rounded-none border border-border bg-background px-2 text-xs shrink-0"
                >
                  <option value="==">is equal to</option>
                  <option value="!=">is not equal to</option>
                </select>

                {/* Value */}
                {PARAM_VALUES[condition.param] ? (
                  <select
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(groupIndex, condIndex, {
                        value: e.target.value,
                      })
                    }
                    className="h-7 rounded-none border border-border bg-background px-2 text-xs flex-1"
                  >
                    {PARAM_VALUES[condition.param].map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(groupIndex, condIndex, {
                        value: e.target.value,
                      })
                    }
                    placeholder="Enter value"
                    className="h-7 rounded-none border border-border bg-background px-2 text-xs flex-1 focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                )}

                {/* Remove condition */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeCondition(groupIndex, condIndex)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <TrashIcon className="size-3" />
                </Button>
              </div>
            ))}

            {/* Add condition / Remove group buttons */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => addCondition(groupIndex)}
              >
                <PlusIcon className="size-3" />
                Add Rule
              </Button>
              {rules.length > 1 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => removeGroup(groupIndex)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <TrashIcon className="size-3" />
                  Remove Group
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Add rule group */}
      <Button variant="outline" size="xs" onClick={addGroup}>
        <PlusIcon className="size-3" />
        Add Rule Group
      </Button>
    </div>
  );
}
