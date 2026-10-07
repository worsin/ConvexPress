import { ConvexError, v } from 'convex/values';
import { mutation } from '../../_generated/server';
import { api } from '../../_generated/api';
import { assistantScope } from './scope';
import { resolveThread } from './history';
import { getSettingsDoc, mergeWithDefaults } from '../../settings/helpers';

/** Only the shopper UI calls this mutation. Provider tools can prepare actions,
 * but cannot call it. The stored proposal fixes the product/quantity; its receipt
 * commits in the same transaction as the normal cart write, including retries. */
export const confirm = mutation({
  args: { sessionToken: v.string(), messageId: v.id('commerce_assistant_messages'), proposalId: v.string() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const message = await ctx.db.get('commerce_assistant_messages', args.messageId);
    const origin = message ? await ctx.db.get('commerce_assistant_sessions', message.sessionId) : null;
    const resolved = origin ? await resolveThread(ctx, origin) : null;
    if (!message || message.role !== 'assistant' || !origin || !scope.session || resolved?.session._id !== scope.session._id
      || (message.adoptedAt ?? message.createdAt) <= (origin.clearedBefore ?? 0)
      || Math.max(message.adoptedAt ?? message.createdAt, resolved.adoptedAt) <= (resolved.session.clearedBefore ?? 0)) {
      throw new ConvexError({ code: 'ACTION_UNAVAILABLE', message: 'This cart action is no longer available.' });
    }
    const index = message.blocks.findIndex((block: any) => block.type === 'cart_proposal' && block.id === args.proposalId);
    if (index < 0) throw new ConvexError({ code: 'ACTION_UNAVAILABLE', message: 'This cart action is no longer available.' });
    const proposal = message.blocks[index];
    if (proposal.added) return null;
    const settings = await getSettingsDoc(ctx, 'commerce.assistant');
    if (mergeWithDefaults('commerce.assistant', settings?.values ?? null).enabled === false) {
      throw new ConvexError({ code: 'DISABLED', message: 'The shop assistant is turned off.' });
    }
    if (!Number.isSafeInteger(proposal.quantity) || proposal.quantity < 1 || proposal.quantity > 20) {
      throw new ConvexError({ code: 'INVALID_ACTION', message: 'Please request this item again.' });
    }
    await ctx.runMutation((api as any).commerce.cart.addItem, {
      sessionToken: scope.session.sessionToken, productId: proposal.productId,
      ...(proposal.variantId ? { variantId: proposal.variantId } : {}), quantity: proposal.quantity,
    });
    const blocks = [...message.blocks];
    blocks[index] = { ...proposal, added: true };
    await ctx.db.patch('commerce_assistant_messages', message._id, { blocks });
    return null;
  },
});
