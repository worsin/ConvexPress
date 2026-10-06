import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import type { HeaderConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

export function ThemeToggle({ variant = "icon", customize }: { variant?: HeaderConfig["darkModeToggle"]["variant"]; customize?: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      data-customize={customize}
      onClick={toggle}
      role={variant === "switch" ? "switch" : undefined}
      aria-checked={variant === "switch" ? isDark : undefined}
      className={cn("flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", variant === "switch" ? "h-8 w-12 rounded-full border border-border bg-muted p-1" : "size-8")}
      aria-label={variant === "switch" ? "Dark mode" : isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {variant === "switch" ? (
        <span aria-hidden="true" className={cn("flex size-5 items-center justify-center rounded-full bg-foreground text-background transition-transform", isDark ? "translate-x-2" : "-translate-x-2")}>
          {isDark ? <Moon className="size-3" /> : <Sun className="size-3" />}
        </span>
      ) : isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
