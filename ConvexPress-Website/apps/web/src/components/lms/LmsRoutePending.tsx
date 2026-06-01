import { GraduationCap } from "lucide-react";

interface LmsRoutePendingProps {
  label?: string;
}

export function LmsRoutePending({
  label = "Loading learning area",
}: LmsRoutePendingProps) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 py-12" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span className="flex size-9 items-center justify-center border border-border bg-card text-primary">
          <GraduationCap className="size-5" aria-hidden="true" />
        </span>
        {label}
      </div>
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="h-72 animate-pulse border border-border bg-muted/50" />
        <div className="grid gap-3 border border-border bg-card p-6">
          <div className="h-3 w-24 animate-pulse bg-muted" />
          <div className="h-8 w-3/4 animate-pulse bg-muted" />
          <div className="h-4 w-full animate-pulse bg-muted" />
          <div className="h-4 w-2/3 animate-pulse bg-muted" />
          <div className="mt-4 h-10 w-full animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  );
}
