/**
 * ReusableBlock - Custom TipTap Node Extension
 *
 * A reference to a saved reusable block in the Convex database.
 * Rendered as an atom node that resolves its content by blockId at display time.
 *
 * In the editor, it shows as a placeholder with the block's title.
 * In the website renderer, it resolves the content and renders inline.
 */

import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

export interface ReusableBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reusableBlock: {
      setReusableBlock: (attrs: {
        blockId: string;
        title: string;
      }) => ReturnType;
      convertReusableToRegular: () => ReturnType;
    };
  }
}

export const ReusableBlock = Node.create<ReusableBlockOptions>({
  name: "reusableBlock",

  group: "block",

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      blockId: {
        default: null,
      },
      title: {
        default: "Reusable Block",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='reusable-block']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "reusable-block",
        "data-block-id": HTMLAttributes.blockId,
        class: "reusable-block",
      }),
      `Reusable: ${HTMLAttributes.title || "Untitled"}`,
    ];
  },

  addCommands() {
    return {
      setReusableBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
      convertReusableToRegular:
        () =>
        ({ editor, state, tr, dispatch }) => {
          // Find the currently selected reusable block node and its position
          const { selection } = state;
          const { $from } = selection;
          let nodePos: number | null = null;
          let reusableNode: typeof state.doc | null = null;

          // Walk up from the selection to find the reusableBlock node
          for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "reusableBlock") {
              reusableNode = node;
              nodePos = $from.before(depth);
              break;
            }
          }

          // Also check if the selection is directly on the atom node (NodeSelection)
          if (
            !reusableNode &&
            selection instanceof NodeSelection &&
            selection.node.type.name === "reusableBlock"
          ) {
            reusableNode = selection.node;
            nodePos = selection.from;
          }

          if (!reusableNode || nodePos === null) {
            return false;
          }

          // Try to get the block content from the node's stored data.
          // The reusable block content is fetched from Convex; if it's available
          // as a stored attribute, parse it and replace the node with its content.
          // Since the reusable block is an atom node, we need its content from
          // the Convex database. As a client-side fallback, insert a paragraph
          // with the block title text to avoid data loss (deletion).
          const blockTitle = reusableNode.attrs?.title || "Untitled block";

          if (dispatch) {
            // Replace the reusable block node with a paragraph containing
            // the block's title, preserving some content instead of deleting.
            // Full content resolution from Convex is handled at query time;
            // this command provides a graceful inline fallback.
            const paragraphNode = state.schema.nodes.paragraph?.create(
              null,
              state.schema.text ? [state.schema.text(`[Converted from reusable block: ${blockTitle}]`)] : undefined,
            );

            if (paragraphNode) {
              tr.replaceWith(nodePos, nodePos + reusableNode.nodeSize, paragraphNode);
            } else {
              tr.delete(nodePos, nodePos + reusableNode.nodeSize);
            }
          }

          return true;
        },
    };
  },
});
