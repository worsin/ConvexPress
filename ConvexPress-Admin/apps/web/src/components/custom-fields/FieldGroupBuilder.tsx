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

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, SaveIcon } from "lucide-react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { FieldListEditor, type FieldDoc } from "@/components/custom-fields/FieldListEditor";
import { LocationRulesBuilder } from "@/components/custom-fields/LocationRulesBuilder";
import { cn, getErrorMessage } from "@/lib/utils";

type FieldGroupData = NonNullable<FunctionReturnType<typeof api.customFields.queries.getGroup>>;

interface FieldGroupBuilderProps {
  group: FieldGroupData;
  fields: FieldDoc[];
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

  // --- useTransition for save/add/delete operations ---
  const [isSaving, startSaveTransition] = useTransition();

  // --- Save handler ---
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    try {
      await updateGroup({
        groupId: group._id,
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
      toast.error(getErrorMessage(error, "Failed to save field group"));
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

      {/* Fields */}
      <FieldListEditor groupId={group._id} fields={fields} />

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
              onChange={(e) => setPosition(e.target.value === "side" ? "side" : e.target.value === "after_title" ? "after_title" : "normal")}
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
              onChange={(e) => setStyle(e.target.value === "seamless" ? "seamless" : "default")}
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
              onChange={(e) => setLabelPlacement(e.target.value === "left" ? "left" : "top")}
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
              onChange={(e) => setInstructionPlacement(e.target.value === "field" ? "field" : "label")}
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
