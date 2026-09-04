import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";

export interface SideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Right-hand sheet for narrow screens, built on the Base UI dialog so focus
 * management and escape handling match the rest of the site.
 */
export function SideSheet({ open, onOpenChange, title, description, children, className }: SideSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/40 duration-150 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-background shadow-2xl outline-hidden ring-1 ring-foreground/5 duration-200 data-closed:animate-out data-closed:slide-out-to-right data-open:animate-in data-open:slide-in-from-right",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>}
          <div className="p-4">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
