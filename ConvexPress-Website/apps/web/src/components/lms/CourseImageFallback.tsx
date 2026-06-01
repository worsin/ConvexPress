import { BookOpen, GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

interface CourseImageFallbackProps {
  title: string;
  subtitle?: string | null;
  className?: string;
}

export function CourseImageFallback({
  title,
  subtitle,
  className,
}: CourseImageFallbackProps) {
  return (
    <div
      role="img"
      aria-label={`${title} course image`}
      className={cn(
        "relative flex h-full w-full overflow-hidden bg-muted text-muted-foreground",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-border" aria-hidden="true" />
      <div className="absolute inset-y-0 left-0 w-px bg-border" aria-hidden="true" />
      <div
        className="absolute right-5 top-5 rounded-full border border-border bg-background/80 p-2 text-primary shadow-sm"
        aria-hidden="true"
      >
        <GraduationCap className="size-5" />
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center text-primary/10"
        aria-hidden="true"
      >
        <GraduationCap className="size-32 sm:size-40" />
      </div>
      <div
        className="absolute left-5 top-5 hidden w-36 gap-2 sm:grid"
        aria-hidden="true"
      >
        <span className="h-2 w-full bg-background/60" />
        <span className="h-2 w-3/4 bg-background/50" />
        <span className="h-2 w-5/6 bg-background/40" />
      </div>

      <div className="relative flex h-full w-full flex-col justify-end gap-4 p-5 sm:p-6">
        <div
          className="flex size-14 items-center justify-center border border-border bg-background/80 text-primary shadow-sm"
          aria-hidden="true"
        >
          <BookOpen className="size-7" />
        </div>
        <div className="max-w-[18rem]">
          {subtitle ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
          <p className="line-clamp-2 text-lg font-semibold leading-tight text-foreground">
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}
