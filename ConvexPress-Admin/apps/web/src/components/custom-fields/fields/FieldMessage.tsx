import DOMPurify from "isomorphic-dompurify";
import { useMemo } from "react";
import type { FieldRendererProps } from "./index";

export function FieldMessage({ field }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const message = settings.message ?? field.instructions ?? "";
  const escapedHtml = settings.escapedHtml ?? false;

  const sanitizedMessage = useMemo(
    () => DOMPurify.sanitize(message, {
      ALLOWED_TAGS: ["b", "i", "strong", "em", "a", "code", "pre", "br", "p", "ul", "ol", "li"]
    }),
    [message]
  );

  return (
    <div className="py-2">
      {escapedHtml ? (
        <div className="text-xs text-foreground prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizedMessage }} />
      ) : (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
