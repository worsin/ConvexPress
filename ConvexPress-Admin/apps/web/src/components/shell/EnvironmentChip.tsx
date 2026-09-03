import { cn } from "@/lib/utils";
import {
  environmentDisplayName,
  environmentTone,
  type EnvironmentLike,
  type EnvironmentTone,
} from "./environment-presentation";

const DOT_TONE: Record<EnvironmentTone, string> = {
  live: "bg-live",
  ok: "bg-success",
  warn: "bg-warning",
  danger: "bg-destructive",
  quiet: "bg-line-strong",
};

const CHIP_TONE: Record<EnvironmentTone, string> = {
  live: "bg-live text-live-foreground",
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  danger: "bg-live-soft text-destructive",
  quiet: "bg-surface-2 text-muted-foreground border border-border",
};

/** Small status dot. Colour alone is never the only signal; pair with text. */
export function HealthDot({
  environment,
  tone,
  className,
}: {
  environment?: EnvironmentLike;
  tone?: EnvironmentTone;
  className?: string;
}) {
  const resolved = tone ?? (environment ? environmentTone(environment) : "quiet");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full",
        DOT_TONE[resolved],
        resolved === "live" && "shadow-[0_0_0_3px_var(--live-soft)]",
        className,
      )}
    />
  );
}

/**
 * Environment chip: filled, named, and placed beside the title.
 * Live renders in oxblood with the word itself so it can never be mistaken
 * for staging.
 */
export function EnvironmentChip({
  environment,
  size = "md",
  className,
}: {
  environment: EnvironmentLike;
  size?: "sm" | "md";
  className?: string;
}) {
  const tone = environmentTone(environment);
  return (
    <span
      data-environment-kind={environment.kind}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md font-semibold uppercase tracking-[0.08em]",
        size === "md" ? "h-[26px] px-2.5 text-[11.5px]" : "h-5 px-2 text-[10.5px]",
        CHIP_TONE[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          tone === "live" ? "bg-live-foreground" : DOT_TONE[tone],
        )}
      />
      {environmentDisplayName(environment)}
    </span>
  );
}
