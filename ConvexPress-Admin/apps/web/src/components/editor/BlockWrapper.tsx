/**
 * BlockWrapper - Per-block wrapper component
 *
 * Provides:
 *   - Drag handle (6-dot grip icon) on hover
 *   - Selection indicator (blue left border when selected)
 *   - Block type label on hover
 *
 * This is a visual wrapper used in the TipTap NodeView rendering.
 * In TipTap v3, per-block wrappers are implemented via NodeView decorations
 * or custom node view components.
 *
 * For the initial implementation, the wrapper adds visual affordances
 * to the editor's CSS rather than wrapping each node in React components.
 * This is more performant for large documents.
 *
 * The styles are applied via CSS classes on the TipTap editor content area.
 */

import type { ReactNode } from "react";

interface BlockWrapperProps {
  children: ReactNode;
  blockType?: string;
  isSelected?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * BlockWrapper component for use in custom TipTap NodeView implementations.
 *
 * For standard blocks (paragraph, heading, etc.), TipTap handles rendering
 * natively. This wrapper is used for custom atom blocks (spacer, button,
 * embed, etc.) where we want drag handles and selection indicators.
 */
export function BlockWrapper({
  children,
  blockType,
  isSelected = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: BlockWrapperProps) {
  return (
    <div
      className={`
        relative group
        ${isSelected ? "ring-1 ring-primary/30" : ""}
        ${isDragging ? "opacity-50" : ""}
      `}
      data-block-type={blockType}
    >
      {/* Drag handle */}
      <div
        className="absolute -left-6 top-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-muted-foreground"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </div>

      {/* Block type label (shown on hover for custom blocks) */}
      {blockType && (
        <div className="absolute -top-5 left-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[9px] font-medium text-muted-foreground bg-muted/50 px-1 py-0.5">
            {blockType}
          </span>
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * Legacy CSS export - DEPRECATED
 *
 * All editor styles are now consolidated in editor-styles.css (the canonical
 * source). This export existed as a template literal duplicate (~90% overlap).
 * It is kept as an empty string for backward compatibility in case any code
 * references it, but editor-styles.css is imported directly by TipTapEditor.
 *
 * @deprecated Use `import "./editor-styles.css"` instead.
 */
export const editorBlockStyles = "";
