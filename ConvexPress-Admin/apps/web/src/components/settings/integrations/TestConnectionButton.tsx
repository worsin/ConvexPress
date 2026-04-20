/**
 * TestConnectionButton — runs a provided test action and renders its
 * success/failure state inline. Used on every integration page.
 */

import { useState } from "react";
import { CheckCircle2, Loader2, Plug, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TestConnectionButtonProps {
  /** Called when the user clicks. Return a success boolean + optional detail. */
  onTest: () => Promise<{ success: boolean; detail?: string }>;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function TestConnectionButton({
  onTest,
  label = "Test connection",
  disabled,
  className,
}: TestConnectionButtonProps) {
  const [state, setState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);

  async function run() {
    setState("testing");
    setDetail(null);
    try {
      const r = await onTest();
      setState(r.success ? "ok" : "error");
      setDetail(r.detail ?? null);
    } catch (err: any) {
      setState("error");
      setDetail(err?.data?.message ?? err?.message ?? String(err));
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        onClick={run}
        disabled={disabled || state === "testing"}
      >
        {state === "testing" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : state === "ok" ? (
          <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
        ) : state === "error" ? (
          <XCircle className="mr-2 h-4 w-4 text-destructive" />
        ) : (
          <Plug className="mr-2 h-4 w-4" />
        )}
        {state === "ok" ? "Connected" : state === "error" ? "Failed" : label}
      </Button>
      {state !== "idle" && detail && (
        <span
          className={cn(
            "text-xs",
            state === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : state === "error"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {detail}
        </span>
      )}
    </div>
  );
}
