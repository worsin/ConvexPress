import { useMemo } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { getBlockDefinition } from "@/lib/blocks/registry";
import type { ConvexPressBlock } from "@/lib/blocks/types";
import { validateBlockInstance } from "@/lib/blocks/validation";

interface BlockListRendererProps {
  blocks: ConvexPressBlock[];
  /**
   * Override the disabled-block list from settings (mostly for tests/storybook).
   * Production code should rely on the SettingsContext.
   */
  disabledBlockNames?: string[];
}

/**
 * Renders a sequence of blocks as the page content.
 *
 * Presentation (tone, padding, container width, alignment, typography, color,
 * spacing) is intentionally NOT controlled by the block data. Each block's
 * Renderer + the active skill / theme own those decisions. The block list
 * here is a flat semantic outline; the skill makes it beautiful.
 *
 * Two runtime concerns this component handles:
 *   1. Disabled blocks — admins can switch blocks off in Pages -> Blocks.
 *      Disabled blocks remain renderable for existing content; disabling only
 *      hides them from new insertion and AI generation.
 *   2. Nested blocks — a block's `innerBlocks` array is passed through to its
 *      Renderer via the `children` prop so blocks that compose children
 *      (columns, accordion, tabs, etc.) can render them without each one
 *      re-implementing recursion.
 */
export function BlockListRenderer({
  blocks,
  disabledBlockNames: disabledOverride,
}: BlockListRendererProps) {
  const settings = useSettings();
  const disabledSet = useMemo(() => {
    if (disabledOverride) return new Set(disabledOverride);
    const fromSettings = settings?.blocksConfig?.disabledBlockNames ?? [];
    return new Set(fromSettings);
  }, [disabledOverride, settings]);

  if (!blocks.length) return null;

  return (
    <div data-slot="block-list-renderer" className="flex flex-col gap-6 md:gap-8">
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} disabledSet={disabledSet} />
      ))}
    </div>
  );
}

function BlockRenderer({
  block,
  disabledSet,
}: {
  block: ConvexPressBlock;
  disabledSet: Set<string>;
}) {
  const definition = getBlockDefinition(block.name);
  const validation = validateBlockInstance(block);
  const isDisabled = disabledSet.has(block.name);

  if (!definition) {
    return <UnknownBlock name={block.name} />;
  }

  if (!validation.ok) {
    return <InvalidBlock message={validation.message} />;
  }

  const Renderer = definition.Renderer;

  // If the block has inner blocks, render them and pass through as children
  // so block renderers can drop them into their layout without each one
  // re-implementing the disabled-filter / validation logic.
  const innerBlocks = validation.block.innerBlocks;
  const children = innerBlocks && innerBlocks.length ? (
    <BlockListRenderer
      blocks={innerBlocks}
      // We've already filtered at this depth via filterDisabled, but pass
      // through so any sub-tree freshly mounted with settings change still
      // honors the latest disabled list.
      disabledBlockNames={[...disabledSet]}
    />
  ) : null;

  return (
    <section
      data-slot={`block-${block.name.replace("/", "-")}`}
      data-block-disabled={isDisabled ? "true" : undefined}
    >
      <Renderer
        block={validation.block}
        attrs={validation.block.attrs}
        children={children}
      />
    </section>
  );
}

function UnknownBlock({ name }: { name: string }) {
  if (import.meta.env.PROD) return null;
  return (
    <div className="border border-dashed border-border bg-muted p-4 text-sm text-muted-foreground">
      Unknown block: {name}
    </div>
  );
}

function InvalidBlock({ message }: { message: string }) {
  if (import.meta.env.PROD) return null;
  return (
    <div className="border border-dashed border-destructive bg-destructive/10 p-4 text-sm text-destructive">
      Invalid block: {message}
    </div>
  );
}
