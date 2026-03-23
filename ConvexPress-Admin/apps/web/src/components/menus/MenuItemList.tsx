import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";

import { MenuItemCard } from "./MenuItemCard";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { MenuItem } from "./types";

interface MenuItemListProps {
  menuId: Id<"menus">;
  items: MenuItem[];
}

/**
 * Drag-and-drop sortable list of menu items.
 * Uses @dnd-kit/core + @dnd-kit/sortable.
 * Sends the full tree state on dragEnd via reorderMenuItems mutation.
 */
export function MenuItemList({ menuId, items }: MenuItemListProps) {
  const reorderMenuItems = useMutation(api.menus.mutations.reorderMenuItems);
  const deleteMenuItem = useMutation(api.menus.mutations.deleteMenuItem);
  const [localItems, setLocalItems] = useState<MenuItem[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Use local items during reorder, fall back to server items
  const displayItems = localItems ?? items;

  const sortableIds = useMemo(
    () => displayItems.map((item) => item._id as string),
    [displayItems],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        setLocalItems(null);
        return;
      }

      const oldIndex = displayItems.findIndex(
        (item) => (item._id as string) === active.id,
      );
      const newIndex = displayItems.findIndex(
        (item) => (item._id as string) === over.id,
      );

      if (oldIndex === -1 || newIndex === -1) {
        setLocalItems(null);
        return;
      }

      // Reorder locally
      const reordered = [...displayItems];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      // Assign new positions
      const updated = reordered.map((item, index) => ({
        ...item,
        position: index,
      }));

      setLocalItems(updated);

      // Send to server
      try {
        await reorderMenuItems({
          menuId,
          items: updated.map((item) => ({
            itemId: item._id,
            parentItemId: item.parentItemId,
            position: item.position,
            depth: item.depth ?? 0,
          })),
        });
        setLocalItems(null);
      } catch (error: unknown) {
        toast.error("Failed to reorder menu items");
        setLocalItems(null);
      }
    },
    [displayItems, menuId, reorderMenuItems],
  );

  const handleRemove = useCallback(
    async (itemId: Id<"menuItems">) => {
      try {
        await deleteMenuItem({ itemId });
        toast.success("Menu item removed");
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove item",
        );
      }
    },
    [deleteMenuItem],
  );

  if (displayItems.length === 0) {
    return (
      <div className="border border-dashed border-border p-8 text-center">
        <p className="text-xs text-muted-foreground">
          Add menu items from the panels on the left.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortableIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1">
          {displayItems.map((item) => (
            <SortableMenuItem
              key={item._id}
              item={item}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableMenuItemProps {
  item: MenuItem;
  onRemove: (itemId: Id<"menuItems">) => void;
}

function SortableMenuItem({ item, onRemove }: SortableMenuItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item._id as string });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <MenuItemCard
        item={item}
        onRemove={onRemove}
        dragHandleProps={listeners}
        isDragging={isDragging}
      />
    </div>
  );
}
