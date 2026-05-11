/**
 * FieldRow - Single field definition row in the builder
 *
 * Collapsed: Shows drag handle, type icon, label, name, type badge
 * Expanded: Shows FieldSettingsPanel for editing field configuration
 */

import {
  ChevronDownIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  TrashIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldSettingsPanel } from "@/components/custom-fields/FieldSettingsPanel";
import { FIELD_TYPE_LABELS } from "@/components/custom-fields/FieldTypeSelector";
import { cn } from "@/lib/utils";

interface FieldRowProps {
  field: {
    _id: string;
    groupId: string;
    label: string;
    name: string;
    key: string;
    type: string;
    instructions?: string;
    required: boolean;
    defaultValue?: string;
    settings: string;
    conditionalLogic?: string;
    wrapperWidth?: string;
    wrapperClass?: string;
    wrapperId?: string;
    menuOrder: number;
    parentFieldId?: string;
  };
  allFields: Array<{
    _id: string;
    groupId: string;
    label: string;
    name: string;
    key: string;
    type: string;
    instructions?: string;
    required: boolean;
    defaultValue?: string;
    settings: string;
    conditionalLogic?: string;
    wrapperWidth?: string;
    wrapperClass?: string;
    wrapperId?: string;
    menuOrder: number;
    parentFieldId?: string;
  }>;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  groupId: string;
}

/** Layout field types that produce no stored value */
const LAYOUT_TYPES = new Set(["message", "accordion", "tab"]);

/** Compound field types that can have sub-fields */
const COMPOUND_TYPES = new Set(["group", "repeater", "flexible_content"]);

export function FieldRow({
  field,
  allFields,
  isExpanded,
  onToggle,
  onDelete,
  groupId,
}: FieldRowProps) {
  const typeLabel = FIELD_TYPE_LABELS[field.type] ?? field.type;
  const isLayout = LAYOUT_TYPES.has(field.type);
  const isCompound = COMPOUND_TYPES.has(field.type);
  const subFields = allFields.filter((f) => f.parentFieldId === field._id);

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Collapsed header */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors",
          isExpanded && "bg-muted/10",
        )}
        onClick={onToggle}
      >
        {/* Drag handle */}
        <GripVerticalIcon className="size-3.5 text-muted-foreground/50 cursor-grab shrink-0" />

        {/* Expand/collapse icon */}
        {isExpanded ? (
          <ChevronDownIcon className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRightIcon className="size-3.5 text-muted-foreground shrink-0" />
        )}

        {/* Label */}
        <span className="text-sm font-medium text-foreground truncate">
          {field.label}
        </span>

        {/* Required indicator */}
        {field.required && (
          <span className="text-destructive text-xs">*</span>
        )}

        {/* Field name */}
        <code className="text-xs text-muted-foreground truncate">
          {field.name}
        </code>

        {/* Type badge */}
        <span
          className={cn(
            "ml-auto shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium",
            isLayout
              ? "bg-muted text-muted-foreground"
              : isCompound
                ? "bg-primary/10 text-primary"
                : "bg-muted text-foreground",
          )}
        >
          {typeLabel}
        </span>

        {/* Delete button */}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <TrashIcon className="size-3" />
        </Button>
      </div>

      {/* Expanded settings panel */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-border/50 bg-muted/5">
          <FieldSettingsPanel
            field={field}
            allFields={allFields}
            groupId={groupId}
          />

          {/* Sub-fields for compound types */}
          {isCompound && subFields.length > 0 && (
            <div className="mt-4 ml-6 border-l-2 border-border/50 pl-4">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                Sub-fields ({subFields.length})
              </h4>
              {subFields.map((sf) => (
                <div
                  key={sf._id}
                  className="flex items-center gap-2 py-1 text-xs"
                >
                  <span className="text-foreground">{sf.label}</span>
                  <code className="text-muted-foreground">{sf.name}</code>
                  <span className="ml-auto text-[10px] px-1 py-0.5 bg-muted text-muted-foreground">
                    {FIELD_TYPE_LABELS[sf.type] ?? sf.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
