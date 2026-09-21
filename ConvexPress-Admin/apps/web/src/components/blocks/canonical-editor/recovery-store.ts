import { openDocument, resumeDocument, type EditorSession, type Snapshot } from "./session";

/** One active document per window/environment. This store contains no tokens,
 * writes nothing to disk, and is replaced when operator or site scope changes. */
export function createEditorRecoveryStore() {
  let retained: EditorSession<unknown> | null = null;
  let lease: symbol | null = null;
  return {
    open<T>(snapshot: Snapshot<T>) {
      const owner = Symbol("editor");
      const state = retained ? resumeDocument(retained as EditorSession<T>, snapshot) : openDocument(snapshot);
      return {
        state,
        activate() { lease = owner; },
        retain(next: EditorSession<T>) {
          if (owner !== lease) return;
          retained = next.dirty || next.pending ? next : null;
        },
      };
    },
  };
}
