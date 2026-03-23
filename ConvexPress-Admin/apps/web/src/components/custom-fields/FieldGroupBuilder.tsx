/**
 * FieldGroupBuilder - Visual field group editor
 *
 * Full-page builder for creating and editing field groups.
 * Includes title/key inputs, fields list with drag-drop,
 * settings panel with location rules, and save button.
 *
 * Uses React 19 patterns:
 * - key-based remounting instead of sync-from-props useEffect
 * - useTransition for non-blocking save/add/delete operations
 * - useRef for stable keyboard shortcut callback
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  PlusIcon,
  SaveIcon,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { SortableFieldRow } from "@/components/custom-fields/SortableFieldRow";
import { FieldTypeSelector } from "@/components/custom-fields/FieldTypeSelector";
import { LocationRulesBuilder } from "@/components/custom-fields/LocationRulesBuilder";
import { cn, getErrorMessage } from "@/lib/utils";

interface FieldGroupData {
  _id: string;
  title: string;
  key: string;
  description?: string;
  locationRules: Array<
    Array<{ param: string; operator: "==" | "!="; value: string }>
  >;
  position: "normal" | "side" | "after_title";
  style: "default" | "seamless";
  labelPlacement: "top" | "left";
  instructionPlacement: "label" | "field";
  isActive: boolean;
  menuOrder: number;
}

interface FieldData {
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
}

interface FieldGroupBuilderProps {
  group: FieldGroupData;
  fields: FieldData[];
}

/**
 * Wrapper component that uses key={group._id} to remount the form
 * when navigating between groups. This eliminates the need for
 * sync-from-props useEffect entirely -- useState initializers
 * run fresh on each mount with the correct server values.
 */
export function FieldGroupBuilder({ group, fields }: FieldGroupBuilderProps) {
  return (
    <FieldGroupBuilderForm
      key={group._id}
      group={group}
      fields={fields}
    />
  );
}

/**
 * Inner form component. Mounts fresh for each group._id via the key prop above.
 * All useState calls initialize directly from props -- no sync useEffect needed.
 */
function FieldGroupBuilderForm({ group, fields }: FieldGroupBuilderProps) {
  const navigate = useNavigate();

  // --- Mutations ---
  const updateGroup = useMutation(api.customFields.mutations.updateGroup);
  const createField = useMutation(api.customFields.mutations.createField);
  const deleteField = useMutation(api.customFields.mutations.deleteField);
  const reorderFields = useMutation(api.customFields.mutations.reorderFields);

  // --- Local form state (initialized from props, no sync needed) ---
  const [title, setTitle] = useState(group.title);
  const [description, setDescription] = useState(group.description ?? "");
  const [locationRules, setLocationRules] = useState(group.locationRules);
  const [position, setPosition] = useState(group.position);
  const [style, setStyle] = useState(group.style);
  const [labelPlacement, setLabelPlacement] = useState(group.labelPlacement);
  const [instructionPlacement, setInstructionPlacement] = useState(
    group.instructionPlacement,
  );
  const [isActive, setIsActive] = useState(group.isActive);
  const [menuOrder, setMenuOrder] = useState(group.menuOrder);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  // --- useTransition for save/add/delete operations ---
  const [isSaving, startSaveTransition] = useTransition();

  // Top-level fields only (not sub-fields)
  const topLevelFields = useMemo(
    () => fields.filter((f) => !f.parentFieldId),
    [fields],
  );

  // Sortable IDs for @dnd-kit
  const sortableFieldIds = useMemo(
    () => topLevelFields.map((f) => f._id),
    [topLevelFields],
  );

  // @dnd-kit sensors: pointer with 8px activation distance, keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  // --- Drag end handler for field reordering ---
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = topLevelFields.findIndex((f) => f._id === active.id);
      const newIndex = topLevelFields.findIndex((f) => f._id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(topLevelFields, oldIndex, newIndex);

      // Build field order array and persist via mutation
      const fieldOrder = reordered.map((f, i) => ({
        fieldId: f._id as Id<"fieldDefinitions">,
        menuOrder: i,
      }));

      reorderFields({
        groupId: group._id as Id<"fieldGroups">,
        fieldOrder,
      }).catch(() => {
        toast.error("Failed to reorder fields");
      });
    },
    [topLevelFields, group._id, reorderFields],
  );

  // --- Save handler ---
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    try {
      await updateGroup({
        groupId: group._id as Id<"fieldGroups">,
        title: title.trim(),
        description: description.trim() || undefined,
        locationRules,
        position,
        style,
        labelPlacement,
        instructionPlacement,
        isActive,
        menuOrder,
      });
      toast.success("Field group saved");
    } catch (error: unknown) {
      toast.error((error as { data?: { message?: string }; message?: string })?.data?.message ?? "Failed to save field group");
    }
  }, [
    title,
    description,
    locationRules,
    position,
    style,
    labelPlacement,
    instructionPlacement,
    isActive,
    menuOrder,
    group._id,
    updateGroup,
  ]);

  // --- Stable ref for keyboard shortcut to always call latest handleSave ---
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // --- Keyboard shortcut: Ctrl+S ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        startSaveTransition(() => {
          handleSaveRef.current();
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // Stable: no deps needed thanks to ref

  // --- Add field handler ---
  const handleAddField = useCallback(
    async (type: string) => {
      try {
        await createField({
          groupId: group._id as Id<"fieldGroups">,
          label: "New Field",
          type,
          menuOrder: topLevelFields.length,
        });
        setShowTypeSelector(false);
        toast.success("Field added");
      } catch (error: unknown) {
        toast.error((error as { data?: { message?: string }; message?: string })?.data?.message ?? "Failed to add field");
      }
    },
    [createField, group._id, topLevelFields.length],
  );

  // --- Delete field handler ---
  const handleDeleteField = useCallback(
    async (fieldId: string) => {
      try {
        await deleteField({
          fieldId: fieldId as Id<"fieldDefinitions">,
          deleteValues: true,
        });
        if (expandedFieldId === fieldId) {
          setExpandedFieldId(null);
        }
        toast.success("Field deleted");
      } catch (error: unknown) {
      console.error("Failed to delete field:", error);
      toast.error("Failed to delete field");
      }
    },
    [deleteField, expandedFieldId],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/custom-fields"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">
            Edit Field Group
          </h1>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 text-xs font-medium",
              isActive
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              startSaveTransition(async () => {
                await handleSave();
                navigate({ to: "/custom-fields" });
              });
            }}
            disabled={isSaving}
          >
            Save & Close
          </Button>
          <Button
            size="sm"
            onClick={() => startSaveTransition(() => { handleSave(); })}
            disabled={isSaving}
          >
            <SaveIcon className="size-3.5" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Title & Key */}
      <div className="border border-border bg-card p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Field Group Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Hero Section Fields"
            className="w-full h-9 rounded-none border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Key:</span>
          <code className="px-1 py-0.5 bg-muted text-foreground">
            {group.key}
          </code>
          <span className="text-muted-foreground/50">(immutable after creation)</span>
        </div>
      </div>

      {/* Fields Section */}
      <div className="border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-foreground">Fields</h2>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowTypeSelector(!showTypeSelector)}
          >
            <PlusIcon className="size-3" />
            Add Field
          </Button>
        </div>

        {/* Type selector dropdown */}
        {showTypeSelector && (
          <div className="border-b border-border p-4">
            <FieldTypeSelector
              onSelect={handleAddField}
              onClose={() => setShowTypeSelector(false)}
            />
          </div>
        )}

        {/* Field rows with drag-drop reordering */}
        {topLevelFields.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No fields yet. Click "Add Field" to get started.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableFieldIds}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {topLevelFields.map((field) => (
                  <SortableFieldRow
                    key={field._id}
                    field={field}
                    allFields={fields}
                    isExpanded={expandedFieldId === field._id}
                    onToggle={() =>
                      setExpandedFieldId(
                        expandedFieldId === field._id ? null : field._id,
                      )
                    }
                    onDelete={() => handleDeleteField(field._id)}
                    groupId={group._id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Settings Section */}
      <div className="border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-medium text-foreground mb-3">Settings</h2>

        {/* Location Rules */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-2">
            Location Rules
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Define where this field group should appear. Rules within a group use
            AND logic. Multiple groups use OR logic.
          </p>
          <LocationRulesBuilder
            rules={locationRules}
            onChange={setLocationRules}
          />
        </div>

        {/* Presentation Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          {/* Position */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Position
            </label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as "normal" | "side" | "after_title")}
              className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="normal">Normal (below editor)</option>
              <option value="side">Side (sidebar)</option>
              <option value="after_title">After Title</option>
            </select>
          </div>

          {/* Style */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Style
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as "default" | "seamless")}
              className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="default">Default (standard metabox)</option>
              <option value="seamless">Seamless (no border)</option>
            </select>
          </div>

          {/* Label Placement */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Label Placement
            </label>
            <select
              value={labelPlacement}
              onChange={(e) => setLabelPlacement(e.target.value as "top" | "left")}
              className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="top">Top (above input)</option>
              <option value="left">Left (beside input)</option>
            </select>
          </div>

          {/* Instruction Placement */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Instruction Placement
            </label>
            <select
              value={instructionPlacement}
              onChange={(e) => setInstructionPlacement(e.target.value as "label" | "field")}
              className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="label">Below Label</option>
              <option value="field">Below Field</option>
            </select>
          </div>

          {/* Menu Order */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Order
            </label>
            <input
              type="number"
              value={menuOrder}
              onChange={(e) => setMenuOrder(parseInt(e.target.value) || 0)}
              min={0}
              className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
            />
          </div>

          {/* Active Toggle */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Active
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-3.5"
              />
              <span className="text-xs text-muted-foreground">
                {isActive
                  ? "This field group is active and will appear in editors"
                  : "This field group is inactive and will not appear in editors"}
              </span>
            </label>
          </div>
        </div>

        {/* Description */}
        <div className="pt-4 border-t border-border">
          <label className="block text-xs font-medium text-foreground mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional description of this field group..."
            className="w-full rounded-none border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring resize-y"
          />
        </div>
      </div>
    </div>
  );
}
