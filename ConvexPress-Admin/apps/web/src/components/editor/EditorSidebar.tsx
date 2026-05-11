/**
 * EditorSidebar - Right sidebar with Document/Block tabs
 *
 * In the WordPress Gutenberg editor, the right sidebar has two tabs:
 * "Document" (post settings) and "Block" (selected block settings).
 *
 * In ConvexPress, the Document tab content is rendered by the existing
 * metabox components in EditorLayout. This sidebar would be used if
 * a tabbed sidebar layout is implemented in the future.
 *
 * For now, this component provides the tab container structure that can
 * wrap the existing metabox sidebar or be used as a standalone panel.
 */

import { useState, type ReactNode } from "react";

interface EditorSidebarProps {
  documentContent: ReactNode;
  blockContent: ReactNode;
  hasSelectedBlock: boolean;
}

export function EditorSidebar({
  documentContent,
  blockContent,
  hasSelectedBlock,
}: EditorSidebarProps) {
  const [activeTab, setActiveTab] = useState<"document" | "block">("document");

  // Auto-switch to Block tab when a block is selected
  // (But allow user to switch back to Document)

  return (
    <div className="border border-border bg-card">
      {/* Tab header */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("document")}
          className={`
            flex-1 px-3 py-2 text-xs font-medium transition-colors
            ${
              activeTab === "document"
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }
          `}
        >
          Document
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("block")}
          disabled={!hasSelectedBlock}
          className={`
            flex-1 px-3 py-2 text-xs font-medium transition-colors
            ${
              activeTab === "block"
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }
            ${!hasSelectedBlock ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          Block
        </button>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "document" ? (
          <div className="space-y-3">{documentContent}</div>
        ) : (
          <div className="p-3">{blockContent}</div>
        )}
      </div>
    </div>
  );
}
