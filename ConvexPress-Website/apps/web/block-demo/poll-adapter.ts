import { parsePollDefinition, pollDefinitionVersion } from "../src/templates/sdk/block-data/portable/pollContracts";
import { validateCanonicalTree } from "../src/templates/sdk/block-data/portable/generated/instances";
import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
/** Explicitly synthetic ballots. Never used by a production page or endpoint. */
export function resolvePollDemo(tree: unknown, scope: DataScope, policy: ResolverPolicy) {
  return resolveCanonicalData(tree, scope, policy, async () => null, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, async args => {
    const node = validateCanonicalTree(tree).find(node => node.id === args.blockId);
    if (!node || node.name !== "core/poll") return { ...args, poll: null, asOf: 1, nextChangeAt: null };
    const attrs = parsePollDefinition(node.attrs);
    const counts = attrs.options.map((_, index) => 12 * (attrs.options.length - index));
    return { ...args, asOf: 1, nextChangeAt: null, poll: {
      postId: "synthetic-poll", ...args, definitionVersion: pollDefinitionVersion(attrs), question: attrs.question,
      options: attrs.options.map((option, index) => ({ ...option, count: attrs.showResults ? counts[index] : null })),
      total: attrs.showResults ? counts.reduce((a, b) => a + b, 0) : null, responsePolicy: attrs.responsePolicy,
      canVote: attrs.responsePolicy === "visitor", votedKey: null, asOf: 1, nextChangeAt: null,
    } };
  });
}
