import { useState, useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldAccordion({ field }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const openByDefault = settings.openByDefault ?? false;
  const [isOpen, setIsOpen] = useState(openByDefault);

  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted hover:bg-muted/80 transition-colors"
      >
        <span className="text-xs font-medium text-foreground">{field.label}</span>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="px-3 py-2 border-t border-border">
          {field.instructions && (
            <p className="text-[10px] text-muted-foreground">{field.instructions}</p>
          )}
          {/* Sub-fields render here via the parent component */}
          <p className="text-[10px] text-muted-foreground italic mt-1">Sub-fields render within this accordion section</p>
        </div>
      )}
    </div>
  );
}
