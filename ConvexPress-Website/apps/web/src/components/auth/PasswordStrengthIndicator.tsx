import { cn } from "@/lib/utils";
import { usePasswordStrength } from "@/hooks/usePasswordStrength";

interface PasswordStrengthIndicatorProps {
  password: string;
  showSuggestions?: boolean;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  showSuggestions = true,
  className,
}: PasswordStrengthIndicatorProps) {
  const { score, label, suggestions } = usePasswordStrength(password);

  if (!password) return null;

  // Color classes based on score using CSS variables only
  const scoreColors: Record<number, { bar: string; text: string }> = {
    0: { bar: "bg-destructive/40", text: "text-destructive" },
    1: { bar: "bg-destructive/30", text: "text-destructive" },
    2: { bar: "bg-primary/30", text: "text-muted-foreground" },
    3: { bar: "bg-primary/50", text: "text-primary" },
    4: { bar: "bg-primary", text: "text-primary" },
  };

  const colors = scoreColors[score] ?? scoreColors[0];

  return (
    <div
      data-slot="password-strength-indicator"
      className={cn("flex flex-col gap-1.5", className)}
    >
      {/* Strength bar segments */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((segment) => (
          <div
            key={segment}
            className={cn(
              "h-1 flex-1 rounded-none transition-colors",
              segment <= score - 1 ? colors.bar : "bg-muted",
            )}
          />
        ))}
      </div>

      {/* Strength label */}
      <span className={cn("text-xs", colors.text)}>{label}</span>

      {/* Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <ul
          data-slot="password-suggestions"
          className="flex flex-col gap-0.5 text-xs text-muted-foreground"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
