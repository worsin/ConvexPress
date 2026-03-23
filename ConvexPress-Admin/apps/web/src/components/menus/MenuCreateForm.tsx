import { useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { LoaderIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Create Menu form. Shows a name input and a Create button.
 * On success, navigates to the menu editor.
 * Uses useTransition for pending state during menu creation.
 */
export function MenuCreateForm() {
  const [name, setName] = useState("");
  const [isCreating, startCreating] = useTransition();
  const createMenu = useMutation(api.menus.mutations.createMenu);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Menu name is required");
      return;
    }

    startCreating(async () => {
      try {
        const menuId = await createMenu({ name: trimmed });
        toast.success(`Menu "${trimmed}" created`);
        setName("");
        navigate({
          to: "/menus/$menuId/edit",
          params: { menuId: menuId as string },
        });
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create menu",
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex-1 max-w-sm">
        <label
          htmlFor="menu-name"
          className="block text-xs font-medium text-foreground mb-1"
        >
          Menu Name
        </label>
        <Input
          id="menu-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Main Navigation"
          disabled={isCreating}
        />
      </div>
      <Button type="submit" disabled={isCreating || !name.trim()}>
        {isCreating ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <PlusIcon className="size-3" />
        )}
        Create Menu
      </Button>
    </form>
  );
}
