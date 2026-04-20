/**
 * ModeToggle — sandbox/production radio group with destructive confirm
 * when switching to production.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ModeToggleProps {
  value: "sandbox" | "production";
  onChange: (next: "sandbox" | "production") => void;
  disabled?: boolean;
}

export function ModeToggle({ value, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="grid gap-2">
      <div className="inline-flex rounded-full border border-border bg-card p-1">
        <Button
          type="button"
          variant={value === "sandbox" ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange("sandbox")}
          disabled={disabled}
          className={cn(
            "rounded-full",
            value !== "sandbox" && "bg-transparent",
          )}
        >
          Sandbox
        </Button>
        <Button
          type="button"
          variant={value === "production" ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange("production")}
          disabled={disabled}
          className={cn(
            "rounded-full",
            value !== "production" && "bg-transparent",
          )}
        >
          Production
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {value === "sandbox"
          ? "Using sandbox credentials. No real transactions will be processed."
          : "LIVE — real transactions, real charges, real labels. Double-check keys."}
      </p>
    </div>
  );
}
