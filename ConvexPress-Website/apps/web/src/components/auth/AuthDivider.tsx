import { cn } from "@/lib/utils";

interface AuthDividerProps {
  text?: string;
  className?: string;
}

export function AuthDivider({ text = "or", className }: AuthDividerProps) {
  return (
    <div
      data-slot="auth-divider"
      className={cn("relative flex items-center gap-3", className)}
    >
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground select-none">{text}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
