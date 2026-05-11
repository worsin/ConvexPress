import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { cn } from "@/lib/utils";

export function FieldTab({ field }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const placement = settings.placement ?? "top"; // top, left

  return (
    <div className="py-1">
      <div className={cn("border-b-2 border-primary pb-1 mb-2", placement === "left" && "border-b-0 border-l-2 pl-2")}>
        <span className="text-xs font-medium text-foreground">{field.label}</span>
      </div>
      {field.instructions && (
        <p className="text-[10px] text-muted-foreground">{field.instructions}</p>
      )}
      {/* Tab content (sub-fields) rendered by parent component */}
    </div>
  );
}
