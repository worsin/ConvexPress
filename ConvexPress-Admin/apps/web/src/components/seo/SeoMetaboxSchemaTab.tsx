/**
 * SeoMetaboxSchemaTab - Schema.org configuration tab in the metabox.
 *
 * Page type dropdown (9 options), article type dropdown (5 options).
 */

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SCHEMA_ARTICLE_TYPES, SCHEMA_PAGE_TYPES } from "@/lib/seo/constants";

interface SeoMetaboxSchemaTabProps {
  contentType: "post" | "page";
  schemaType: string;
  onSchemaTypeChange: (v: string) => void;
  schemaArticleType: string;
  onSchemaArticleTypeChange: (v: string) => void;
  onSave: () => Promise<void>;
}

export function SeoMetaboxSchemaTab({
  contentType,
  schemaType,
  onSchemaTypeChange,
  schemaArticleType,
  onSchemaArticleTypeChange,
  onSave,
}: SeoMetaboxSchemaTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Override the default Schema.org type for this {contentType}. Leave as default to use global settings.
      </p>

      {/* Page type */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Page Type</Label>
        <select
          value={schemaType}
          onChange={(e) => onSchemaTypeChange(e.target.value)}
          className="w-full h-7 border border-border bg-transparent px-2 text-xs rounded-none outline-hidden focus:border-ring focus:ring-1 focus:ring-ring/50"
        >
          <option value="">Default (from global settings)</option>
          {SCHEMA_PAGE_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Article type - only for posts */}
      {contentType === "post" && (
        <div className="space-y-1">
          <Label className="text-xs font-medium">Article Type</Label>
          <select
            value={schemaArticleType}
            onChange={(e) => onSchemaArticleTypeChange(e.target.value)}
            className="w-full h-7 border border-border bg-transparent px-2 text-xs rounded-none outline-hidden focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            <option value="">Default (from global settings)</option>
            {SCHEMA_ARTICLE_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onSave}
        className="text-xs h-7"
      >
        Save Schema Settings
      </Button>
    </div>
  );
}
