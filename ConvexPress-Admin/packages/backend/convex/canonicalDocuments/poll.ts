import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { readPollSnapshot } from "../extensions/forms/polls";
import { parsePollDefinition, pollDefinitionVersion } from "./foundation/pollContracts";
import { pollArgsSchema, type PollArgs, type PollResult } from "./foundation/pollDataContracts";
import type { NavigationSource } from "./navigation";
import { validateCanonicalTree } from "./foundation/generated/instances";
import { createComposedRegistry, type RuntimeCanonicalTree } from "./foundation/composedRegistry";
import type { ComposedDataContext } from "./foundation/planner";

/** The document service provides the post identity. No authored reference can
 * bind another page's ballot, and unsaved previews never borrow old results. */
export async function readPoll(ctx: QueryCtx, input: PollArgs, source: NavigationSource, budget = new RequestReadLedger(), password?: string, composed?: ComposedDataContext): Promise<PollResult> {
  const args = pollArgsSchema.parse(input);
  const missing: PollResult = { blockId: args.blockId, poll: null, asOf: Date.now(), nextChangeAt: null };
  const find = (nodes: RuntimeCanonicalTree): RuntimeCanonicalTree[number] | undefined => {
    for (const node of nodes) { if (node.id === args.blockId) return node; const child = node.children && find(node.children); if (child) return child; }
  };
  const tree = composed ? createComposedRegistry(composed.definitions, composed.scope).validateTree(source.tree) : validateCanonicalTree(source.tree);
  const node = find(tree);
  if (node?.name !== "core/poll") return missing;
  let attrs;
  try { attrs = parsePollDefinition(node.attrs); } catch { return missing; }
  const poll = await readPollSnapshot(ctx, { postId: source.document._id, blockId: args.blockId, password }, budget);
  if (!poll || poll.definitionVersion !== pollDefinitionVersion(attrs) || (poll.total !== null) !== attrs.showResults) return missing;
  return { blockId: args.blockId, poll, asOf: poll.asOf, nextChangeAt: poll.nextChangeAt };
}
