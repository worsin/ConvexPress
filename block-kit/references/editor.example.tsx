import type { BlockEditorProps } from "../../ConvexPress-Admin/apps/web/src/lib/blocks/types";
import type { ExampleAttrs } from "./manifest.example";

export function ExampleEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<ExampleAttrs>) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Heading</span>
      <input
        value={attrs.heading}
        disabled={disabled}
        onChange={(event) => onChange({ ...attrs, heading: event.target.value })}
        className="h-9 border border-border bg-background px-2.5 text-sm text-foreground"
      />
    </label>
  );
}

