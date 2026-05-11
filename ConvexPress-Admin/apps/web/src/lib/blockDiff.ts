/**
 * Block Diff - Block-level diffing for structured editor content
 *
 * The block editor stores content as serialized JSON (array of block objects).
 * For meaningful diffs, we need to:
 *   1. Parse JSON into block arrays
 *   2. Diff at block level first (align blocks by ID)
 *   3. For modified blocks: diff inner text at word level
 *   4. Provide data for rendering block-level changes in a two-pane view
 *
 * Gracefully falls back to plain text diff if content is not valid JSON.
 */

import { computeDiff, type DiffResult } from "./diff";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single block from the editor's serialized JSON content. */
export interface EditorBlock {
  /** Unique block ID (if available). */
  id?: string;
  /** Block type (e.g., "paragraph", "heading", "image"). */
  type?: string;
  /** Text content of the block. */
  text?: string;
  /** Nested content (TipTap format). */
  content?: Array<{ type?: string; text?: string; content?: EditorBlock[] }>;
  /** Arbitrary block attributes. */
  attrs?: Record<string, unknown>;
}

/** A diff result for a single block. */
export interface BlockDiffResult {
  /** How the block changed. */
  status: "added" | "removed" | "modified" | "unchanged";
  /** Block from the left (older) revision, if present. */
  leftBlock?: EditorBlock;
  /** Block from the right (newer) revision, if present. */
  rightBlock?: EditorBlock;
  /** Text diff within the block (only for "modified" status). */
  textDiff?: DiffResult[];
  /** Extracted plain text from the left block. */
  leftText?: string;
  /** Extracted plain text from the right block. */
  rightText?: string;
}

// ─── Block Text Extraction ───────────────────────────────────────────────────

/**
 * Extract plain text from a TipTap/ProseMirror block structure.
 * Recursively traverses content arrays to pull out text nodes.
 */
export function extractBlockText(block: EditorBlock): string {
  if (block.text) return block.text;

  if (block.content && Array.isArray(block.content)) {
    return block.content
      .map((child) => {
        if (child.text) return child.text;
        if (child.content) {
          return child.content.map(extractBlockText).join("");
        }
        return "";
      })
      .join("");
  }

  return "";
}

// ─── JSON Parsing ────────────────────────────────────────────────────────────

/**
 * Attempt to parse content as block editor JSON.
 * Returns null if content is not valid JSON or not a block structure.
 */
export function parseBlocks(content: string): EditorBlock[] | null {
  if (!content || (!content.trim().startsWith("{") && !content.trim().startsWith("["))) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);

    // TipTap stores as { type: "doc", content: [...blocks] }
    if (parsed && parsed.type === "doc" && Array.isArray(parsed.content)) {
      return parsed.content;
    }

    // Direct array of blocks
    if (Array.isArray(parsed)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Block-Level Diff ────────────────────────────────────────────────────────

/**
 * Compute a block-level diff between two content strings.
 *
 * If both sides are valid block editor JSON, performs block-level alignment
 * and per-block text diffing. Otherwise, falls back to plain text diff.
 *
 * @param oldContent - The older content string
 * @param newContent - The newer content string
 * @returns Array of block diff results, or null if falling back to text diff
 */
export function computeBlockDiff(
  oldContent: string,
  newContent: string,
): BlockDiffResult[] | null {
  const oldBlocks = parseBlocks(oldContent);
  const newBlocks = parseBlocks(newContent);

  // Both must be block structures for block-level diff
  if (!oldBlocks || !newBlocks) {
    return null;
  }

  return diffBlockArrays(oldBlocks, newBlocks);
}

/**
 * Diff two arrays of blocks using a simple linear comparison.
 *
 * Strategy:
 *   - If blocks have IDs, match by ID
 *   - Otherwise, match by position + type
 *   - Unmatched old blocks are "removed", unmatched new blocks are "added"
 *   - Matched blocks with different text are "modified"
 */
function diffBlockArrays(
  oldBlocks: EditorBlock[],
  newBlocks: EditorBlock[],
): BlockDiffResult[] {
  const results: BlockDiffResult[] = [];

  // Try to match blocks by ID first
  const oldById = new Map<string, { block: EditorBlock; index: number }>();
  const newById = new Map<string, { block: EditorBlock; index: number }>();
  const oldNoId: EditorBlock[] = [];
  const newNoId: EditorBlock[] = [];

  for (let i = 0; i < oldBlocks.length; i++) {
    const block = oldBlocks[i];
    if (block.id || block.attrs?.id) {
      const id = (block.id ?? block.attrs?.id) as string;
      oldById.set(id, { block, index: i });
    } else {
      oldNoId.push(block);
    }
  }

  for (let i = 0; i < newBlocks.length; i++) {
    const block = newBlocks[i];
    if (block.id || block.attrs?.id) {
      const id = (block.id ?? block.attrs?.id) as string;
      newById.set(id, { block, index: i });
    } else {
      newNoId.push(block);
    }
  }

  // If no blocks have IDs, fall back to positional comparison
  if (oldById.size === 0 && newById.size === 0) {
    return diffByPosition(oldBlocks, newBlocks);
  }

  // Track processed IDs
  const processedIds = new Set<string>();

  // Process all blocks in order of the new content
  for (const block of newBlocks) {
    const id = (block.id ?? block.attrs?.id) as string | undefined;

    if (id && oldById.has(id)) {
      processedIds.add(id);
      const oldEntry = oldById.get(id)!;
      const oldText = extractBlockText(oldEntry.block);
      const newText = extractBlockText(block);

      if (oldText === newText) {
        results.push({
          status: "unchanged",
          leftBlock: oldEntry.block,
          rightBlock: block,
          leftText: oldText,
          rightText: newText,
        });
      } else {
        results.push({
          status: "modified",
          leftBlock: oldEntry.block,
          rightBlock: block,
          textDiff: computeDiff(oldText, newText),
          leftText: oldText,
          rightText: newText,
        });
      }
    } else {
      results.push({
        status: "added",
        rightBlock: block,
        rightText: extractBlockText(block),
      });
    }
  }

  // Old blocks that weren't in the new content are removed
  for (const [id, entry] of oldById) {
    if (!processedIds.has(id)) {
      results.push({
        status: "removed",
        leftBlock: entry.block,
        leftText: extractBlockText(entry.block),
      });
    }
  }

  return results;
}

/**
 * Positional diff: compare blocks by their index position.
 */
function diffByPosition(
  oldBlocks: EditorBlock[],
  newBlocks: EditorBlock[],
): BlockDiffResult[] {
  const results: BlockDiffResult[] = [];
  const maxLen = Math.max(oldBlocks.length, newBlocks.length);

  for (let i = 0; i < maxLen; i++) {
    const oldBlock = i < oldBlocks.length ? oldBlocks[i] : undefined;
    const newBlock = i < newBlocks.length ? newBlocks[i] : undefined;

    if (oldBlock && newBlock) {
      const oldText = extractBlockText(oldBlock);
      const newText = extractBlockText(newBlock);

      if (oldText === newText) {
        results.push({
          status: "unchanged",
          leftBlock: oldBlock,
          rightBlock: newBlock,
          leftText: oldText,
          rightText: newText,
        });
      } else {
        results.push({
          status: "modified",
          leftBlock: oldBlock,
          rightBlock: newBlock,
          textDiff: computeDiff(oldText, newText),
          leftText: oldText,
          rightText: newText,
        });
      }
    } else if (oldBlock) {
      results.push({
        status: "removed",
        leftBlock: oldBlock,
        leftText: extractBlockText(oldBlock),
      });
    } else if (newBlock) {
      results.push({
        status: "added",
        rightBlock: newBlock,
        rightText: extractBlockText(newBlock),
      });
    }
  }

  return results;
}
