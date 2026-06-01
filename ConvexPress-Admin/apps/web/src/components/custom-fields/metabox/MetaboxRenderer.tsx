/**
 * MetaboxRenderer - Renders fields within a metabox container
 *
 * Handles:
 * - Field rendering using the field type registry
 * - Conditional logic evaluation (client-side show/hide)
 * - Dirty field tracking for batch save
 * - Sub-field nesting for compound types (group, repeater, flexible_content)
 * - Metabox style (default with border, seamless without)
 */

import { useState, useCallback, useMemo, useEffect, useRef, useTransition } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { FIELD_RENDERERS } from "../fields";
import { evaluateConditionalLogic } from "../conditionalLogic";
import {
  recomputeForm,
  COMPUTED_TYPES,
  type CalcFieldDef,
  type RepeaterRow,
} from "@/components/forms/calc";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FieldDefinition {
  _id: string;
  label: string;
  name: string;
  key: string;
  type: string;
  instructions?: string;
  required: boolean;
  defaultValue?: string;
  settings: string;
  parentFieldId?: string;
  conditionalLogic?: string;
}

interface FieldGroup {
  _id: string;
  title: string;
  key: string;
  style?: string;
  labelPlacement?: string;
  instructionPlacement?: string;
}

interface MetaboxRendererProps {
  /** The field group */
  group: FieldGroup;
  /** Field definitions in this group, sorted by menuOrder */
  fields: FieldDefinition[];
  /** Entity type (e.g., "post", "page") */
  entityType: string;
  /** Entity ID (Convex document ID as string) */
  entityId: string;
}

export function MetaboxRenderer({ group, fields, entityType, entityId }: MetaboxRendererProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dirtyValues, setDirtyValues] = useState<Record<string, string>>({});
  const [isSaving, startSaveTransition] = useTransition();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRef = useRef<() => void>(() => {});

  // Fetch existing values for this entity
  const existingValues = useQuery(api.customFields.queries.getAllValues, {
    entityType,
    entityId,
  });

  // Mutation for batch saving
  const setValues = useMutation(api.customFields.mutations.setValues);

  // Build a map of current values: fieldKey -> value
  const valueMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (existingValues) {
      for (const v of existingValues) {
        map[v.fieldKey] = v.value;
      }
    }
    // Overlay dirty values
    for (const [key, val] of Object.entries(dirtyValues)) {
      map[key] = val;
    }
    return map;
  }, [existingValues, dirtyValues]);

  // Get top-level fields only (no parentFieldId)
  const topLevelFields = useMemo(() => {
    return fields.filter((f) => !f.parentFieldId);
  }, [fields]);

  // Live recompute of computed fields (Form Calculation & Pricing System, UX
  // only — the authoritative value is recomputed server-side at submit). We feed
  // the recompute the full value map + any repeater rows, then display the
  // derived value for `calculation`/`product` fields. Full recompute is fine for
  // v1 (the topo walk is cheap); profile before adding dirty-subgraph recompute.
  const computedDisplay = useMemo(() => {
    const calcDefs = fields as unknown as CalcFieldDef[];
    const repeaters: Record<string, RepeaterRow[]> = {};
    for (const f of fields) {
      if (f.type !== "repeater") continue;
      const raw = valueMap[f.key];
      if (typeof raw !== "string" || raw.trim() === "") continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          repeaters[f.key] = parsed.filter(
            (r): r is RepeaterRow => typeof r === "object" && r !== null,
          );
        }
      } catch {
        /* skip */
      }
    }
    const { computed } = recomputeForm(calcDefs, valueMap, repeaters);
    // Serialize each computed value to the string the renderer expects.
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(computed)) {
      out[key] = typeof val === "number" ? String(val) : JSON.stringify(val);
    }
    return out;
  }, [fields, valueMap]);

  // Auto-save dirty values
  const autoSave = useCallback(() => {
    const entries = Object.entries(dirtyValues);
    if (entries.length === 0) return;

    startSaveTransition(async () => {
      try {
        await setValues({
          entityType,
          entityId,
          values: entries.map(([fieldKey, value]) => ({ fieldKey, value })),
        });
        setDirtyValues({});
      } catch (err) {
        toast.error("Failed to save custom field values");
        console.error("Custom field save error:", err);
      }
    });
  }, [dirtyValues, entityType, entityId, setValues]);

  // Keep autoSaveRef always pointing to latest autoSave (avoids stale closure)
  autoSaveRef.current = autoSave;

  // Handle field value change
  const handleChange = useCallback((fieldKey: string, value: string) => {
    setDirtyValues((prev) => ({ ...prev, [fieldKey]: value }));

    // Auto-save after 2 seconds of inactivity
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      autoSaveRef.current();
    }, 2000);
  }, []);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Evaluate conditional logic for a field via the canonical shared evaluator.
  // (Fixes the prior enabled/fieldKey mismatch that silently disabled every
  // builder-authored rule — see ../conditionalLogic.ts.)
  const isFieldVisible = useCallback(
    (field: FieldDefinition): boolean =>
      evaluateConditionalLogic(field.conditionalLogic, valueMap),
    [valueMap],
  );

  const isSeamless = group.style === "seamless";
  const labelPlacement = (group.labelPlacement ?? "top") as "top" | "left";
  const instructionPlacement = (group.instructionPlacement ?? "label") as "label" | "field";
  const hasDirty = Object.keys(dirtyValues).length > 0;

  return (
    <div className={cn("mb-4", !isSeamless && "border border-border bg-card")}>
      {/* Metabox header */}
      {!isSeamless && (
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors border-b border-border"
        >
          <span className="text-xs font-semibold text-foreground">
            {group.title}
            {hasDirty && <span className="text-primary ml-1">*</span>}
            {isSaving && <span className="text-muted-foreground ml-1 text-[10px]">(saving...)</span>}
          </span>
          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
        </button>
      )}

      {/* Metabox body */}
      {!isCollapsed && (
        <div className={cn("px-3 py-2", isSeamless && "px-0")}>
          {topLevelFields.map((field) => {
            if (!isFieldVisible(field)) return null;

            const Renderer = FIELD_RENDERERS[field.type];
            if (!Renderer) {
              return (
                <div key={field._id} className="py-2 text-xs text-muted-foreground">
                  Unknown field type: {field.type}
                </div>
              );
            }

            // Computed fields display their live-recomputed value (not the
            // stored/dirty raw value), which is read-only in the UI.
            const currentValue = COMPUTED_TYPES.has(field.type)
              ? computedDisplay[field.key] ?? valueMap[field.key] ?? ""
              : valueMap[field.key] ?? field.defaultValue ?? "";

            return (
              <Renderer
                key={field._id}
                field={{
                  _id: field._id,
                  label: field.label,
                  name: field.name,
                  key: field.key,
                  type: field.type,
                  instructions: field.instructions,
                  required: field.required,
                  defaultValue: field.defaultValue,
                  settings: field.settings,
                }}
                value={currentValue}
                onChange={(val: string) => handleChange(field.key, val)}
                labelPlacement={labelPlacement}
                instructionPlacement={instructionPlacement}
              />
            );
          })}

          {topLevelFields.length === 0 && (
            <p className="text-[10px] text-muted-foreground py-2">No fields defined in this group.</p>
          )}
        </div>
      )}
    </div>
  );
}
