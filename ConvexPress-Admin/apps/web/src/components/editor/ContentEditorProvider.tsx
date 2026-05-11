/**
 * ContentEditorProvider - React context for the Content Editor
 *
 * Wraps the TipTap editor area and provides editor-level context to child
 * components (BlockToolbar, SlashCommandMenu, BlockInserter, etc.).
 *
 * This provider does NOT wrap the entire EditorLayout -- only the content
 * editing area. Metaboxes and the Publish Box access form state directly
 * via the useEditorForm hook.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { EditorContextValue } from "@/types/editor";

const EditorContext = createContext<EditorContextValue | null>(null);

interface ContentEditorProviderProps {
  children: ReactNode;
  value: EditorContextValue;
}

export function ContentEditorProvider({
  children,
  value,
}: ContentEditorProviderProps) {
  return (
    <EditorContext value={value}>{children}</EditorContext>
  );
}

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error(
      "useEditorContext must be used within a ContentEditorProvider",
    );
  }
  return ctx;
}
