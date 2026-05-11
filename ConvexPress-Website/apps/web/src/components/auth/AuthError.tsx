import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface AuthErrorProps {
  message: string;
  id?: string;
  className?: string;
}

export function AuthError({ message, id, className }: AuthErrorProps) {
  if (!message) return null;

  return (
    <div
      data-slot="auth-error"
      role="alert"
      id={id}
      className={cn(
        "flex items-start gap-2 rounded-none border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
