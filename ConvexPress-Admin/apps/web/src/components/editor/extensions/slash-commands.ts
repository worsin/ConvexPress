/**
 * SlashCommands - Custom TipTap Extension
 *
 * Provides the slash command suggestion plugin.
 * When the user types `/` in an empty paragraph, a filtered suggestion menu
 * appears with block types that can be inserted.
 *
 * This extension uses TipTap's built-in Extension.create pattern with
 * ProseMirror plugins for the suggestion behavior.
 */

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { SlashCommandItem } from "@/types/editor";

export const slashCommandPluginKey = new PluginKey("slashCommands");

export interface SlashCommandsOptions {
  /** The list of commands available via slash */
  commands: SlashCommandItem[];
  /** Callback when the suggestion menu should be shown/updated */
  onOpen: (props: SlashMenuState) => void;
  /** Callback when the suggestion menu should be hidden */
  onClose: () => void;
}

export interface SlashMenuState {
  /** Current query text (everything after the `/`) */
  query: string;
  /** Filtered command list */
  items: SlashCommandItem[];
  /** Position in the document where the `/` was typed */
  range: { from: number; to: number };
  /** Screen coordinates for positioning the menu */
  clientRect: (() => DOMRect | null) | null;
}

/**
 * Filter commands by query. Matches against label, aliases, and description.
 */
function filterCommands(
  commands: SlashCommandItem[],
  query: string,
): SlashCommandItem[] {
  if (!query) return commands;
  const lower = query.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(lower) ||
      cmd.aliases.some((a) => a.toLowerCase().includes(lower)) ||
      cmd.description.toLowerCase().includes(lower),
  );
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return {
      commands: [],
      onOpen: () => {},
      onClose: () => {},
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;

    return [
      new Plugin({
        key: slashCommandPluginKey,

        state: {
          init(): { active: boolean; query: string; range: { from: number; to: number } | null } {
            return { active: false, query: "", range: null };
          },

          apply(tr, prev) {
            const meta = tr.getMeta(slashCommandPluginKey);
            if (meta !== undefined) return meta;

            // If the document changed and we had an active state, update
            if (tr.docChanged && prev.active && prev.range) {
              const mappedFrom = tr.mapping.map(prev.range.from);
              const mappedTo = tr.mapping.map(prev.range.to);
              return { ...prev, range: { from: mappedFrom, to: mappedTo } };
            }

            return prev;
          },
        },

        props: {
          handleKeyDown(view, event) {
            const state = slashCommandPluginKey.getState(view.state);

            // Close on Escape
            if (state?.active && event.key === "Escape") {
              view.dispatch(
                view.state.tr.setMeta(slashCommandPluginKey, {
                  active: false,
                  query: "",
                  range: null,
                }),
              );
              options.onClose();
              return true;
            }

            return false;
          },

          handleTextInput(view, from, to, text) {
            const { state } = view;
            const $from = state.doc.resolve(from);

            // Detect `/` typed at the start of an empty paragraph
            if (text === "/" && $from.parent.type.name === "paragraph") {
              const isStartOfBlock = $from.parentOffset === 0;
              const isEmpty = $from.parent.content.size === 0;

              if (isStartOfBlock && isEmpty) {
                // Schedule the state update after the text is inserted
                setTimeout(() => {
                  const newState = view.state;
                  const pos = from + 1; // Position after the `/`
                  view.dispatch(
                    newState.tr.setMeta(slashCommandPluginKey, {
                      active: true,
                      query: "",
                      range: { from, to: pos },
                    }),
                  );

                  const filtered = filterCommands(options.commands, "");
                  const coords = view.coordsAtPos(from);

                  options.onOpen({
                    query: "",
                    items: filtered,
                    range: { from, to: pos },
                    clientRect: () =>
                      new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
                  });
                }, 0);

                return false; // Let ProseMirror handle the actual text insertion
              }
            }

            // If slash menu is active, update the query
            const pluginState = slashCommandPluginKey.getState(state);
            if (pluginState?.active && pluginState.range) {
              setTimeout(() => {
                const newState = view.state;
                const newPluginState = slashCommandPluginKey.getState(newState);
                if (!newPluginState?.active || !newPluginState.range) return;

                const slashFrom = newPluginState.range.from;
                const currentPos = newState.selection.from;

                // Read the query text between the `/` and the cursor
                const query = newState.doc.textBetween(
                  slashFrom + 1,
                  currentPos,
                  "",
                );

                const filtered = filterCommands(options.commands, query);
                const coords = view.coordsAtPos(slashFrom);

                view.dispatch(
                  newState.tr.setMeta(slashCommandPluginKey, {
                    active: true,
                    query,
                    range: { from: slashFrom, to: currentPos },
                  }),
                );

                options.onOpen({
                  query,
                  items: filtered,
                  range: { from: slashFrom, to: currentPos },
                  clientRect: () =>
                    new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
                });

                // If no items match, close the menu
                if (filtered.length === 0 && query.length > 10) {
                  view.dispatch(
                    newState.tr.setMeta(slashCommandPluginKey, {
                      active: false,
                      query: "",
                      range: null,
                    }),
                  );
                  options.onClose();
                }
              }, 0);
            }

            return false;
          },
        },

        view() {
          return {
            update(view) {
              const state = slashCommandPluginKey.getState(view.state);

              // Check if selection moved away from the slash command area
              if (state?.active && state.range) {
                const { from: selFrom } = view.state.selection;
                if (selFrom < state.range.from || selFrom > state.range.to + 50) {
                  view.dispatch(
                    view.state.tr.setMeta(slashCommandPluginKey, {
                      active: false,
                      query: "",
                      range: null,
                    }),
                  );
                  options.onClose();
                }
              }
            },

            destroy() {
              options.onClose();
            },
          };
        },
      }),
    ];
  },
});

/**
 * Execute a slash command: delete the `/query` text and run the command's action.
 */
export function executeSlashCommand(
  editor: Editor,
  item: SlashCommandItem,
  range: { from: number; to: number },
): void {
  // Delete the slash command text
  editor.chain().focus().deleteRange(range).run();

  // Execute the command's action
  item.action(editor);
}
