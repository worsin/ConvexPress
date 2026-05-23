import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { LoaderIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MenuAddItemsPanel } from "./MenuAddItemsPanel";
import { MenuItemList } from "./MenuItemList";
import { MenuSettingsPanel } from "./MenuSettingsPanel";
import { MenuDeleteDialog } from "./MenuDeleteDialog";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { MenuData } from "./types";

interface MenuBuilderProps {
  menu: MenuData;
}

/**
 * Editable menu name field with save functionality.
 * Uses key={initialName} from parent to reset when server name changes,
 * eliminating the need for a sync-from-props useEffect.
 */
function MenuNameEditor({
  menuId,
  initialName,
}: {
  menuId: Id<"menus">;
  initialName: string;
}) {
  const updateMenu = useMutation(api.menus.mutations.updateMenu);
  const [menuName, setMenuName] = useState(initialName);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmedName = useMemo(() => menuName.trim(), [menuName]);
  const persistName = useCallback(
    async (name: string) => {
      setSaveStatus("saving");
      try {
        await updateMenu({ menuId, name });
        setSaveStatus("saved");
      } catch (error: unknown) {
        setSaveStatus("error");
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update menu name",
        );
      }
    },
    [menuId, updateMenu],
  );

  useEffect(() => {
    if (trimmedName === initialName) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveStatus === "pending" || saveStatus === "saving") {
        setSaveStatus("idle");
      }
      return;
    }

    if (!trimmedName) {
      setSaveStatus("error");
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveStatus("pending");
    const nextName = trimmedName;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistName(nextName);
    }, 500);
  }, [initialName, persistName, saveStatus, trimmedName]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex items-end gap-3 mb-4">
      <div className="flex-1">
        <label
          htmlFor="menu-name-edit"
          className="block text-xs font-medium text-foreground mb-1"
        >
          Menu Name
        </label>
        <Input
          id="menu-name-edit"
          value={menuName}
          onChange={(e) => setMenuName(e.target.value)}
          onBlur={() => {
            if (saveTimerRef.current) {
              clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }
            if (trimmedName && trimmedName !== initialName) {
              void persistName(trimmedName);
            }
          }}
        />
      </div>
      <div
        className="inline-flex h-8 items-center text-xs text-muted-foreground"
        aria-live="polite"
      >
        {saveStatus === "saving" && (
          <LoaderIcon className="size-3 animate-spin" />
        )}
        {saveStatus === "pending" && "Saving shortly..."}
        {saveStatus === "saving" && <span className="ml-1.5">Saving...</span>}
        {saveStatus === "saved" && "Saved"}
        {saveStatus === "error" && (
          <span className="text-destructive">
            {trimmedName ? "Autosave failed" : "Name is required"}
          </span>
        )}
        {(saveStatus === "idle" || !saveStatus) && "Saved"}
      </div>
    </div>
  );
}

/**
 * Main 2-column menu builder layout.
 * Left (30%): Add Items panels.
 * Right (70%): Menu name, save button, drag-and-drop item list, settings.
 */
export function MenuBuilder({ menu }: MenuBuilderProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-6 items-start xl:flex-row">
        {/* Left sidebar: Add Items (~30%) */}
        <div className="w-full shrink-0 xl:w-[30%] xl:min-w-56">
          <MenuAddItemsPanel menuId={menu._id} />
        </div>

        {/* Main area (~70%) */}
        <div className="flex-1 min-w-0">
          {/* Menu name + Save — key resets local state when server name changes */}
          <MenuNameEditor
            key={menu.name}
            menuId={menu._id}
            initialName={menu.name}
          />

          {/* Menu Structure */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-foreground mb-2">
              Menu Structure
            </h3>
            <p className="text-[10px] text-muted-foreground mb-3">
              Drag items to reorder. Use indent controls to create dropdown nesting, then expand an item to edit details.
            </p>
            <MenuItemList menuId={menu._id} items={menu.items} />
          </div>

          {/* Menu Settings */}
          <MenuSettingsPanel
            menuId={menu._id}
            autoAddPages={menu.autoAddPages ?? false}
            menuName={menu.name}
          />

          {/* Delete menu link */}
          <div className="mt-6 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(true)}
              className="text-[10px] text-destructive hover:text-destructive/80 transition-colors"
            >
              Delete Menu
            </button>
          </div>
        </div>
      </div>

      {showDeleteDialog && (
        <MenuDeleteDialog
          open={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          menuId={menu._id}
          menuName={menu.name}
        />
      )}
    </>
  );
}
