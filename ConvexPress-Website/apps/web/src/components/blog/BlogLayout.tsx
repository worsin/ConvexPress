import { cn } from "@/lib/utils";

interface BlogLayoutProps {
  children: React.ReactNode;
  /** Optional sidebar content */
  sidebar?: React.ReactNode;
  /** Sidebar position: left or right (default: right) */
  sidebarPosition?: "left" | "right";
  className?: string;
}

/**
 * Blog layout wrapper with optional sidebar.
 * When sidebar is provided, renders a two-column layout.
 * When no sidebar, renders full-width content.
 *
 * Knowledge doc specifies: "BlogLayout wrapper with optional sidebar".
 */
export function BlogLayout({
  children,
  sidebar,
  sidebarPosition = "right",
  className,
}: BlogLayoutProps) {
  if (!sidebar) {
    return (
      <div
        data-slot="blog-layout"
        className={cn("mx-auto max-w-5xl", className)}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      data-slot="blog-layout"
      className={cn(
        "mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_280px]",
        sidebarPosition === "left" && "lg:grid-cols-[280px_1fr]",
        className,
      )}
    >
      {sidebarPosition === "left" && (
        <aside
          data-slot="blog-sidebar"
          className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start"
        >
          {sidebar}
        </aside>
      )}

      <main data-slot="blog-main" className="min-w-0">
        {children}
      </main>

      {sidebarPosition === "right" && (
        <aside
          data-slot="blog-sidebar"
          className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start"
        >
          {sidebar}
        </aside>
      )}
    </div>
  );
}
