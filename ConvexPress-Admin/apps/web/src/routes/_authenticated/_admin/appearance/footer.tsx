/**
 * Appearance > Footer — dynamic footer authoring.
 *
 * Two modes:
 *   1. **Builder** (default) — v2 block-style rows/columns/cells. Most
 *      flexible: drag-drop rows, mix any cell types in any order.
 *   2. **Sections** (legacy) — fixed schema of section toggles (branding,
 *      navColumns, newsletter, contactInfo, bottomBar). Kept alive for sites
 *      that haven't migrated yet, and as a fallback render path on the
 *      Website when `rows` is empty.
 *
 * Both modes write to the same `footer` settings section, so switching tabs
 * never loses data — the legacy fields stay populated and the rows live
 * alongside them.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { FooterComposer } from "@/components/appearance/FooterComposer";
import { FooterRowsBuilder } from "@/components/appearance/FooterRowsBuilder";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/footer",
)({
  component: FooterPage,
});

type Mode = "builder" | "sections";

function FooterPage() {
  const [mode, setMode] = useState<Mode>("builder");
  return (
    <div className="flex flex-col gap-4">
      <ModeTabs mode={mode} onChange={setMode} />
      {mode === "builder" ? <FooterRowsBuilder /> : <FooterComposer />}
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      <ModeTab active={mode === "builder"} onClick={() => onChange("builder")}>
        Builder
      </ModeTab>
      <ModeTab active={mode === "sections"} onClick={() => onChange("sections")}>
        Sections (legacy)
      </ModeTab>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
