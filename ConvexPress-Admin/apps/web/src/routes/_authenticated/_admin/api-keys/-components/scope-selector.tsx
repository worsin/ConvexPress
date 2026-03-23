/**
 * Scope Selector Component
 *
 * Checkbox groups organized by resource category.
 * Supports Select All / Deselect All.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { SCOPE_GROUPS, ALL_SCOPES } from "@/lib/api/constants";
import type { ApiKeyScope } from "@/lib/api/types";

interface ScopeSelectorProps {
  selected: ApiKeyScope[];
  onChange: (scopes: ApiKeyScope[]) => void;
}

export function ScopeSelector({ selected, onChange }: ScopeSelectorProps) {
  const allSelected = ALL_SCOPES.every((s) => selected.includes(s));
  const noneSelected = selected.length === 0;

  const handleToggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...ALL_SCOPES]);
    }
  };

  const handleToggleScope = (scope: ApiKeyScope, checked: boolean) => {
    if (checked) {
      onChange([...selected, scope]);
    } else {
      onChange(selected.filter((s) => s !== scope));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Permissions</span>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={handleToggleAll}
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>

      {SCOPE_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            {group.label}
          </span>
          <div className="space-y-1.5 pl-1">
            {group.scopes.map(({ scope, label }) => (
              <label
                key={scope}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(scope)}
                  onCheckedChange={(checked) =>
                    handleToggleScope(scope, !!checked)
                  }
                />
                <span className="text-xs text-foreground">
                  <code className="text-[10px] font-mono bg-muted px-1 py-0.5 mr-1.5">
                    {scope}
                  </code>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {noneSelected && (
        <p className="text-xs text-destructive">
          At least one scope is required.
        </p>
      )}
    </div>
  );
}
