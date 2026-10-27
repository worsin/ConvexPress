import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { socialProviders } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";

interface AuthDividerProps {
  text?: string;
  className?: string;
}

/** Separates the social sign-in buttons from the form; nothing when the site offers none. */
export function AuthDivider({ text = "or", className }: AuthDividerProps) {
  if (socialProviders(useAuthCapabilities()).length === 0) return null;
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
