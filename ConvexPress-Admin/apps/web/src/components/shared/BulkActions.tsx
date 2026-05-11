import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BulkAction } from "@/types/list-table";

interface BulkActionsProps {
  /** Available bulk actions. */
  actions: BulkAction[];
  /** Number of selected items. */
  selectedCount: number;
  /** Handler called with the action key when Apply is clicked. */
  onApply: (actionKey: string) => void;
  /** Whether a bulk action is currently executing. */
  isExecuting?: boolean;
  /** Current user capabilities (to filter visible actions). */
  userCapabilities?: string[];
  /** Currently active status tab (for visibleOnStatus filtering). */
  currentStatus?: string;
}

/**
 * Bulk action dropdown + "Apply" button for performing actions on selected rows.
 * Disabled when no rows are selected. Uses a Base UI Select dropdown
 * matching WordPress's bulk actions pattern.
 *
 * Rendering: [Bulk Actions v] [Apply]
 */
export function BulkActions({
  actions,
  selectedCount,
  onApply,
  isExecuting = false,
  userCapabilities,
  currentStatus,
}: BulkActionsProps) {
  const [selectedAction, setSelectedAction] = useState("");

  // Filter actions by user capabilities and visible status tabs
  const visibleActions = actions.filter((action) => {
    // Capability check
    if (action.capability && userCapabilities && !userCapabilities.includes(action.capability)) {
      return false;
    }
    // Status visibility check
    if (action.visibleOnStatus && action.visibleOnStatus.length > 0) {
      const status = currentStatus || "all";
      if (!action.visibleOnStatus.includes(status)) {
        return false;
      }
    }
    return true;
  });

  const handleApply = useCallback(() => {
    if (selectedAction && selectedCount > 0) {
      onApply(selectedAction);
      setSelectedAction("");
    }
  }, [selectedAction, selectedCount, onApply]);

  const isDisabled =
    !selectedAction || selectedCount === 0 || isExecuting;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedAction}
        onValueChange={(val) => setSelectedAction(val as string)}
      >
        <SelectTrigger
          size="sm"
          aria-label="Bulk actions"
          className="h-8 min-w-[140px] rounded-none border border-input bg-transparent px-2 text-xs text-foreground"
        >
          <SelectValue placeholder="Bulk Actions" />
        </SelectTrigger>
        <SelectContent className="rounded-none">
          <SelectItem value="">Bulk Actions</SelectItem>
          {visibleActions.map((action) => (
            <SelectItem key={action.key} value={action.key}>
              {action.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleApply}
        disabled={isDisabled}
      >
        {isExecuting ? "Applying..." : "Apply"}
      </Button>
    </div>
  );
}
