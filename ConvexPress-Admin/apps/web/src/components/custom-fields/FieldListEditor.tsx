/**
 * FieldListEditor — the fields of one field group: add, edit in place,
 * reorder by dragging, delete.
 *
 * Shared by the custom-fields group builder and the form editor, which shows
 * only this (a form's backing group has no location rules or placement worth
 * editing). Each field saves from its own panel; adding, reordering and
 * deleting save at once. A new field is named after its type and opens for
 * editing. Deleting asks first, because a field's saved values (a form's
 * submitted answers) go with it.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SortableFieldRow } from "@/components/custom-fields/SortableFieldRow";
import { FIELD_TYPE_LABELS, FieldTypeSelector } from "@/components/custom-fields/FieldTypeSelector";
import { getErrorMessage } from "@/lib/utils";

export type FieldDoc = NonNullable<FunctionReturnType<typeof api.customFields.queries.getFieldsByGroup>>[number];

interface FieldListEditorProps {
  groupId: Id<"fieldGroups">;
  fields: FieldDoc[];
  /** What deleting a field also deletes, in the reader's terms. */
  deleteWarning?: string;
  emptyText?: string;
}

export function FieldListEditor({
  groupId,
  fields,
  deleteWarning = "Values saved for this field are deleted with it.",
  emptyText = "No fields yet. Choose “Add field” to start.",
}: FieldListEditorProps) {
  const createField = useMutation(api.customFields.mutations.createField);
  const deleteField = useMutation(api.customFields.mutations.deleteField);
  const reorderFields = useMutation(api.customFields.mutations.reorderFields);

  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FieldDoc | null>(null);
  const [isDeleting, startDelete] = useTransition();

  // Top-level fields only (sub-fields are edited inside their parent).
  const topLevelFields = useMemo(() => fields.filter((field) => !field.parentFieldId), [fields]);
  const sortableFieldIds = useMemo(() => topLevelFields.map((field) => field._id), [topLevelFields]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = topLevelFields.findIndex((field) => field._id === active.id);
      const newIndex = topLevelFields.findIndex((field) => field._id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const fieldOrder = arrayMove(topLevelFields, oldIndex, newIndex).map((field, index) => ({
        fieldId: field._id,
        menuOrder: index,
      }));
      reorderFields({ groupId, fieldOrder }).catch(() => toast.error("Couldn't reorder the fields."));
    },
    [topLevelFields, groupId, reorderFields],
  );

  const handleAddField = useCallback(
    async (type: string) => {
      try {
        const fieldId = await createField({
          groupId,
          label: FIELD_TYPE_LABELS[type] ?? "New field",
          type,
          menuOrder: topLevelFields.length,
        });
        setShowTypeSelector(false);
        // Open the new field so it can be named and set up right away.
        setExpandedFieldId(fieldId);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Couldn't add the field."));
      }
    },
    [createField, groupId, topLevelFields.length],
  );

  const confirmDelete = () => {
    const field = pendingDelete;
    if (!field) return;
    startDelete(async () => {
      try {
        await deleteField({ fieldId: field._id, deleteValues: true });
        if (expandedFieldId === field._id) setExpandedFieldId(null);
        setPendingDelete(null);
        toast.success(`"${field.label}" deleted.`);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Couldn't delete the field."));
      }
    });
  };

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">Fields</h2>
        <Button size="xs" variant="outline" onClick={() => setShowTypeSelector(!showTypeSelector)}>
          <PlusIcon className="size-3" />
          Add field
        </Button>
      </div>

      {showTypeSelector ? (
        <div className="border-b border-border p-4">
          <FieldTypeSelector onSelect={(type) => void handleAddField(type)} onClose={() => setShowTypeSelector(false)} />
        </div>
      ) : null}

      {topLevelFields.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableFieldIds} strategy={verticalListSortingStrategy}>
            <div>
              {topLevelFields.map((field) => (
                <SortableFieldRow
                  key={field._id}
                  field={field}
                  allFields={fields}
                  isExpanded={expandedFieldId === field._id}
                  onToggle={() => setExpandedFieldId(expandedFieldId === field._id ? null : field._id)}
                  onDelete={() => setPendingDelete(field)}
                  groupId={groupId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => {
          if (!isDeleting) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete this field?"
        message={`Delete "${pendingDelete?.label ?? "this field"}"? ${deleteWarning}`}
        confirmLabel="Delete field"
        destructive
        isExecuting={isDeleting}
      />
    </div>
  );
}
