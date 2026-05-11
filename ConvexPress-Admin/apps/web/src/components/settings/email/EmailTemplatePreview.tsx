/**
 * EmailTemplatePreview - Renders a template with sample data.
 *
 * Replaces {variable_name} placeholders with sample values
 * and renders the result in a sandboxed iframe for safe HTML preview.
 */

import { useMemo, useRef, useEffect } from "react";

import { getSampleVariables } from "@/lib/email/sampleData";

interface EmailTemplatePreviewProps {
  /** The HTML body template */
  bodyHtml: string;
  /** The subject line template */
  subjectTemplate: string;
  /** Template slug for loading sample variables */
  templateSlug: string;
}

/**
 * Replace all {variable_name} placeholders in a string
 * with values from the provided variables map.
 *
 * Uses single-brace syntax to match the backend renderTemplate().
 */
function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, varName) => {
    return variables[varName] ?? match;
  });
}

export function EmailTemplatePreview({
  bodyHtml,
  subjectTemplate,
  templateSlug,
}: EmailTemplatePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sampleVars = useMemo(
    () => getSampleVariables(templateSlug, bodyHtml, subjectTemplate),
    [templateSlug, bodyHtml, subjectTemplate],
  );

  const renderedSubject = useMemo(
    () => renderTemplate(subjectTemplate, sampleVars),
    [subjectTemplate, sampleVars],
  );

  const renderedBody = useMemo(
    () => renderTemplate(bodyHtml, sampleVars),
    [bodyHtml, sampleVars],
  );

  // Write the rendered HTML into the iframe for sandboxed rendering
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(renderedBody);
    doc.close();

    // Auto-resize iframe to content height
    const resizeObserver = new ResizeObserver(() => {
      const body = doc.body;
      if (body) {
        iframe.style.height = `${Math.max(body.scrollHeight + 20, 400)}px`;
      }
    });

    if (doc.body) {
      resizeObserver.observe(doc.body);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderedBody]);

  return (
    <div className="flex flex-col gap-3">
      {/* Subject preview */}
      <div className="flex flex-col gap-1 border border-border p-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Subject
        </span>
        <span className="text-sm font-medium text-foreground">
          {renderedSubject}
        </span>
      </div>

      {/* Body preview iframe */}
      <div className="border border-border">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-1.5">
          <div className="flex gap-1">
            <span className="size-2 rounded-full bg-red-500/40" />
            <span className="size-2 rounded-full bg-yellow-500/40" />
            <span className="size-2 rounded-full bg-green-500/40" />
          </div>
          <span className="text-[10px] text-muted-foreground ml-2">
            Email Preview
          </span>
        </div>
        <iframe
          ref={iframeRef}
          title="Email preview"
          className="w-full min-h-[400px] bg-white"
          sandbox="allow-same-origin"
        />
      </div>

      {/* Sample data notice */}
      <p className="text-[10px] text-muted-foreground">
        Preview rendered with sample data. Actual emails will contain real user
        and system values.
      </p>
    </div>
  );
}
