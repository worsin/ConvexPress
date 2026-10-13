import { ConvexError, v } from 'convex/values';
import { mutation, internalQuery } from '../../_generated/server';
import { api } from '../../_generated/api';
import { assistantScope } from './scope';
import { resolveThread } from './history';
import { readAssistantSettings } from '../settingsInternals';
import { storedBlocks } from './blocks';
import { isPublicVariant } from '../activePrice';

/** Ids come from model tool calls as plain strings; anything that is not a live option reads as null. */
export const variantTitle = internalQuery({
  args: { productId: v.string(), variantId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const productId = ctx.db.normalizeId('commerce_products', args.productId);
    const variantId = ctx.db.normalizeId('commerce_product_variants', args.variantId);
    const product = productId ? await ctx.db.get('commerce_products', productId) : null;
    const variant = variantId ? await ctx.db.get('commerce_product_variants', variantId) : null;
    if (!product || product.status !== 'publish' || !variant || variant.productId !== productId || !isPublicVariant(variant)) return null;
    return variant.title || variant.optionSummary || null;
  },
});

/** Only the shopper UI calls this mutation. Provider tools can prepare actions,
 * but cannot call it. The stored proposal fixes the product/quantity; its receipt
 * commits in the same transaction as the normal cart write, including retries. */
export const confirm = mutation({
  args: { sessionToken: v.string(), messageId: v.id('commerce_assistant_messages'), proposalId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const message = await ctx.db.get('commerce_assistant_messages', args.messageId);
    const origin = message ? await ctx.db.get('commerce_assistant_sessions', message.sessionId) : null;
    const resolved = origin ? await resolveThread(ctx, origin) : null;
    if (!message || message.role !== 'assistant' || !origin || !scope.session || resolved?.session._id !== scope.session._id
      || (message.adoptedAt ?? message.createdAt) <= (origin.clearedBefore ?? 0)
      || Math.max(message.adoptedAt ?? message.createdAt, resolved.adoptedAt) <= (resolved.session.clearedBefore ?? 0)) {
      throw new ConvexError({ code: 'ACTION_UNAVAILABLE', message: 'This cart action is no longer available.' });
    }
    const blocks = storedBlocks(message.blocks);
    const index = blocks.findIndex((block) => block.type === 'cart_proposal' && block.id === args.proposalId);
    const proposal = blocks[index];
    if (!proposal || proposal.type !== 'cart_proposal') throw new ConvexError({ code: 'ACTION_UNAVAILABLE', message: 'This cart action is no longer available.' });
    if (proposal.added) return null;
    if ((await readAssistantSettings(ctx)).enabled === false) {
      throw new ConvexError({ code: 'DISABLED', message: 'The shop assistant is turned off.' });
    }
    if (!Number.isSafeInteger(proposal.quantity) || proposal.quantity < 1 || proposal.quantity > 20) {
      throw new ConvexError({ code: 'INVALID_ACTION', message: 'Please request this item again.' });
    }
    const productId = ctx.db.normalizeId('commerce_products', proposal.productId);
    const variantId = proposal.variantId ? ctx.db.normalizeId('commerce_product_variants', proposal.variantId) : undefined;
    if (!productId || variantId === null) throw new ConvexError({ code: 'ACTION_UNAVAILABLE', message: 'This cart action is no longer available.' });
    await ctx.runMutation(api.commerce.cart.addItem, {
      sessionToken: scope.session.sessionToken, productId,
      ...(variantId ? { variantId } : {}), quantity: proposal.quantity,
    });
    blocks[index] = { ...proposal, added: true };
    await ctx.db.patch('commerce_assistant_messages', message._id, { blocks });
    return null;
  },
});
