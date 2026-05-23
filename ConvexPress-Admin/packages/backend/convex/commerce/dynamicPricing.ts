// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";

const ruleStatus = v.union(v.literal("draft"), v.literal("active"), v.literal("inactive"));
const processingMode = v.union(
  v.literal("all_applicable"),
  v.literal("first_match"),
  v.literal("best_discount"),
);
const conditionsMatch = v.union(v.literal("all"), v.literal("any"));
const conditionKind = v.union(
  v.literal("cart_subtotal"),
  v.literal("cart_item_count"),
  v.literal("matching_quantity"),
  v.literal("matching_subtotal"),
  v.literal("customer_group"),
  v.literal("user_role"),
  v.literal("specific_customer"),
  v.literal("first_order"),
  v.literal("purchase_history_orders"),
  v.literal("purchase_history_spend"),
  v.literal("shipping_country"),
  v.literal("coupon_present"),
);
const conditionOperator = v.union(
  v.literal("eq"),
  v.literal("neq"),
  v.literal("gt"),
  v.literal("gte"),
  v.literal("lt"),
  v.literal("lte"),
  v.literal("in"),
  v.literal("not_in"),
  v.literal("contains"),
  v.literal("not_contains"),
  v.literal("is_true"),
  v.literal("is_false"),
);
const dynamicCondition = v.object({
  kind: conditionKind,
  operator: conditionOperator,
  numberValue: v.optional(v.number()),
  stringValue: v.optional(v.string()),
  stringValues: v.optional(v.array(v.string())),
  booleanValue: v.optional(v.boolean()),
});
const dynamicAction = v.object({
  type: v.union(
    v.literal("percentage_discount"),
    v.literal("fixed_discount"),
    v.literal("fixed_price"),
    v.literal("percentage_markup"),
    v.literal("fixed_markup"),
    v.literal("free_shipping"),
  ),
  target: v.union(
    v.literal("matching_items"),
    v.literal("cart_subtotal"),
    v.literal("cheapest_matching_item"),
    v.literal("shipping"),
  ),
  amount: v.optional(v.number()),
  maxDiscountAmount: v.optional(v.number()),
});
const dynamicScope = v.object({
  appliesTo: v.union(
    v.literal("all_products"),
    v.literal("specific_products"),
    v.literal("specific_categories"),
  ),
  productIds: v.optional(v.array(v.id("commerce_products"))),
  categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
  excludedProductIds: v.optional(v.array(v.id("commerce_products"))),
  excludedCategoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
});

const ruleInput = {
  name: v.string(),
  description: v.optional(v.string()),
  status: ruleStatus,
  priority: v.number(),
  processingMode,
  exclusive: v.boolean(),
  stackWithCoupons: v.boolean(),
  startsAt: v.optional(v.union(v.number(), v.null())),
  endsAt: v.optional(v.union(v.number(), v.null())),
  scope: dynamicScope,
  conditionsMatch,
  conditions: v.array(dynamicCondition),
  action: dynamicAction,
  customerMessage: v.optional(v.string()),
  adminNotes: v.optional(v.string()),
};

function cleanText(value?: string) {
  const next = value?.trim();
  return next ? next : undefined;
}

function assertRule(args: any) {
  if (!args.name.trim()) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Rule name is required." });
  }
  if (args.startsAt && args.endsAt && args.startsAt > args.endsAt) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Start date must be before end date." });
  }
  if (args.action.type !== "free_shipping" && typeof args.action.amount !== "number") {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Rule action amount is required." });
  }
  if (args.action.type === "free_shipping" && args.action.target !== "shipping") {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Free shipping rules must target shipping." });
  }
  if (args.action.target === "shipping" && args.action.type !== "free_shipping") {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Shipping target only supports free shipping." });
  }
}

export const list = query({
  args: { status: v.optional(ruleStatus) },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const rows = args.status
      ? await ctx.db
          .query("commerce_dynamic_pricing_rules")
          .withIndex("by_status", (q: any) => q.eq("status", args.status))
          .collect()
      : await ctx.db
          .query("commerce_dynamic_pricing_rules")
          .withIndex("by_updatedAt")
          .order("desc")
          .collect();
    return rows.sort((a: any, b: any) => b.priority - a.priority || b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { ruleId: v.id("commerce_dynamic_pricing_rules") },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return await ctx.db.get(args.ruleId);
  },
});

export const create = mutation({
  args: ruleInput,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    assertRule(args);
    const now = Date.now();
    return await ctx.db.insert("commerce_dynamic_pricing_rules", {
      ...args,
      name: args.name.trim(),
      description: cleanText(args.description),
      startsAt: args.startsAt ?? undefined,
      endsAt: args.endsAt ?? undefined,
      customerMessage: cleanText(args.customerMessage),
      adminNotes: cleanText(args.adminNotes),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { ruleId: v.id("commerce_dynamic_pricing_rules"), patch: v.object({ ...ruleInput }) },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const existing = await ctx.db.get(args.ruleId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Dynamic pricing rule not found." });
    }
    assertRule(args.patch);
    await ctx.db.patch(args.ruleId, {
      ...args.patch,
      name: args.patch.name.trim(),
      description: cleanText(args.patch.description),
      startsAt: args.patch.startsAt ?? undefined,
      endsAt: args.patch.endsAt ?? undefined,
      customerMessage: cleanText(args.patch.customerMessage),
      adminNotes: cleanText(args.patch.adminNotes),
      updatedAt: Date.now(),
    });
    return args.ruleId;
  },
});

export const setStatus = mutation({
  args: {
    ruleId: v.id("commerce_dynamic_pricing_rules"),
    status: ruleStatus,
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    await ctx.db.patch(args.ruleId, { status: args.status, updatedAt: Date.now() });
    return args.ruleId;
  },
});

export const remove = mutation({
  args: { ruleId: v.id("commerce_dynamic_pricing_rules") },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    await ctx.db.patch(args.ruleId, { status: "inactive", updatedAt: Date.now() });
    return args.ruleId;
  },
});

export const preview = query({
  args: {
    productId: v.optional(v.string()),
    categoryIds: v.optional(v.array(v.string())),
    quantity: v.number(),
    unitPriceAmount: v.number(),
    currencyCode: v.optional(v.string()),
    customerGroupId: v.optional(v.string()),
    roleValue: v.optional(v.string()),
    email: v.optional(v.string()),
    totalOrders: v.optional(v.number()),
    totalSpentAmount: v.optional(v.number()),
    couponPresent: v.optional(v.boolean()),
    shippingCountry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    const rules = (
      await ctx.db
        .query("commerce_dynamic_pricing_rules")
        .withIndex("by_status", (q: any) => q.eq("status", "active"))
        .collect()
    )
      .filter((rule: any) => (!rule.startsAt || rule.startsAt <= now) && (!rule.endsAt || rule.endsAt >= now))
      .sort((a: any, b: any) => b.priority - a.priority || a.createdAt - b.createdAt);
    const quantity = Math.max(1, Math.floor(args.quantity || 1));
    const item = {
      _id: "preview-item",
      productId: args.productId || "preview-product",
      quantity,
      unitPriceAmount: Math.max(0, args.unitPriceAmount),
      lineTotalAmount: Math.max(0, args.unitPriceAmount) * quantity,
      product: { categoryIds: args.categoryIds ?? [] },
    };
    const result = evaluateDynamicPricingRules({
      rules,
      cart: {
        currencyCode: args.currencyCode ?? "USD",
        customerGroupId: args.customerGroupId,
        appliedDiscountCode: args.couponPresent ? "PREVIEW" : undefined,
        shippingAddress: args.shippingCountry ? { countryCode: args.shippingCountry } : undefined,
      },
      items: [item],
      customerContext: {
        userId: args.email,
        email: args.email,
        roleValues: args.roleValue ? [args.roleValue] : [],
        totalOrders: Number(args.totalOrders ?? 0),
        totalSpentAmount: Number(args.totalSpentAmount ?? 0),
      },
    });
    const adjustedItem = result.items[0];
    return {
      currencyCode: args.currencyCode ?? "USD",
      originalSubtotalAmount: item.lineTotalAmount,
      adjustedSubtotalAmount: adjustedItem.adjustedUnitPriceAmount * quantity,
      itemDiscountAmount: Number(adjustedItem.dynamicPricingAdjustmentAmount ?? 0),
      cartDiscountAmount: result.cartDiscountAmount,
      totalDiscountAmount: Number(adjustedItem.dynamicPricingAdjustmentAmount ?? 0) + result.cartDiscountAmount,
      finalSubtotalAmount: Math.max(
        0,
        adjustedItem.adjustedUnitPriceAmount * quantity - result.cartDiscountAmount,
      ),
      freeShipping: result.freeShipping,
      ruleIds: result.ruleIds.map((id: any) => String(id)),
      description: result.description,
    };
  },
});

function ids(values?: any[]) {
  return new Set((values ?? []).map((value) => String(value)));
}

function productCategoryIds(item: any) {
  return new Set((item.product?.categoryIds ?? []).map((value: any) => String(value)));
}

function scopeMatches(rule: any, item: any) {
  const scope = rule.scope ?? { appliesTo: "all_products" };
  const productId = String(item.productId);
  const itemCategoryIds = productCategoryIds(item);
  if (ids(scope.excludedProductIds).has(productId)) return false;
  for (const categoryId of ids(scope.excludedCategoryIds)) {
    if (itemCategoryIds.has(categoryId)) return false;
  }
  if (scope.appliesTo === "all_products") return true;
  if (scope.appliesTo === "specific_products") return ids(scope.productIds).has(productId);
  if (scope.appliesTo === "specific_categories") {
    for (const categoryId of ids(scope.categoryIds)) {
      if (itemCategoryIds.has(categoryId)) return true;
    }
    return false;
  }
  return false;
}

function compare(condition: any, actual: any) {
  const expected =
    condition.numberValue ??
    condition.stringValue ??
    condition.booleanValue;
  const expectedList = condition.stringValues ?? [];
  if (condition.operator === "is_true") return Boolean(actual) === true;
  if (condition.operator === "is_false") return Boolean(actual) === false;
  if (condition.operator === "in") {
    const actualList = Array.isArray(actual) ? actual.map(String) : [String(actual)];
    return expectedList.map(String).some((value: string) => actualList.includes(value));
  }
  if (condition.operator === "not_in") {
    const actualList = Array.isArray(actual) ? actual.map(String) : [String(actual)];
    return expectedList.map(String).every((value: string) => !actualList.includes(value));
  }
  if (condition.operator === "contains") {
    const actualList = Array.isArray(actual) ? actual.map(String) : [String(actual)];
    return expectedList.some((value: string) => actualList.includes(String(value)));
  }
  if (condition.operator === "not_contains") {
    const actualList = Array.isArray(actual) ? actual.map(String) : [String(actual)];
    return expectedList.every((value: string) => !actualList.includes(String(value)));
  }
  if (condition.operator === "eq") {
    const actualList = Array.isArray(actual) ? actual.map(String) : [String(actual)];
    return actualList.includes(String(expected));
  }
  if (condition.operator === "neq") {
    const actualList = Array.isArray(actual) ? actual.map(String) : [String(actual)];
    return !actualList.includes(String(expected));
  }
  const left = Number(actual ?? 0);
  const right = Number(expected ?? 0);
  if (condition.operator === "gt") return left > right;
  if (condition.operator === "gte") return left >= right;
  if (condition.operator === "lt") return left < right;
  if (condition.operator === "lte") return left <= right;
  return false;
}

async function buildCustomerContext(ctx: any, cart: any) {
  const user = cart.userId ? await ctx.db.get(cart.userId) : null;
  const role = user?.roleId ? await ctx.db.get(user.roleId) : null;
  const profile = user?._id
    ? await ctx.db
        .query("commerce_customer_profiles")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .unique()
    : null;
  return {
    user,
    role,
    userId: user?._id ? String(user._id) : undefined,
    email: user?.email,
    roleValues: [role?._id, role?.slug, role?.name].filter(Boolean).map(String),
    totalOrders: Number(profile?.totalOrders ?? 0),
    totalSpentAmount: Number(profile?.totalSpentAmount ?? 0),
  };
}

function conditionActual(condition: any, ctx: any) {
  switch (condition.kind) {
    case "cart_subtotal":
      return ctx.cartSubtotal;
    case "cart_item_count":
      return ctx.cartItemCount;
    case "matching_quantity":
      return ctx.matchingQuantity;
    case "matching_subtotal":
      return ctx.matchingSubtotal;
    case "customer_group":
      return ctx.customerGroupId;
    case "user_role":
      return ctx.roleValues;
    case "specific_customer":
      return [ctx.userId, ctx.email].filter(Boolean);
    case "first_order":
      return ctx.totalOrders === 0;
    case "purchase_history_orders":
      return ctx.totalOrders;
    case "purchase_history_spend":
      return ctx.totalSpentAmount;
    case "coupon_present":
      return Boolean(ctx.appliedDiscountCode);
    case "shipping_country":
      return ctx.shippingCountry;
    default:
      return undefined;
  }
}

function applyItemAction(action: any, baseUnitPrice: number) {
  const amount = Number(action.amount ?? 0);
  if (action.type === "percentage_discount") return Math.max(0, Math.round(baseUnitPrice * (1 - amount / 100)));
  if (action.type === "fixed_discount") return Math.max(0, baseUnitPrice - amount);
  if (action.type === "fixed_price") return Math.max(0, amount);
  if (action.type === "percentage_markup") return Math.max(0, Math.round(baseUnitPrice * (1 + amount / 100)));
  if (action.type === "fixed_markup") return Math.max(0, baseUnitPrice + amount);
  return baseUnitPrice;
}

function capRuleDiscount(action: any, discount: number) {
  if (typeof action.maxDiscountAmount === "number") {
    return Math.min(discount, action.maxDiscountAmount);
  }
  return discount;
}

function cartActionDiscount(action: any, amountBase: number) {
  const amount = Number(action.amount ?? 0);
  let discount = 0;
  if (action.type === "percentage_discount") discount = Math.round(amountBase * (amount / 100));
  if (action.type === "fixed_discount") discount = amount;
  if (typeof action.maxDiscountAmount === "number") {
    discount = Math.min(discount, action.maxDiscountAmount);
  }
  return Math.max(0, Math.min(amountBase, discount));
}

function createWorkingItems(items: any[]) {
  return items.map((item) => {
    const base = Number(item.baseUnitPriceAmount ?? item.unitPriceAmount ?? 0);
    return {
      ...item,
      baseUnitPriceAmount: base,
      adjustedUnitPriceAmount: base,
      dynamicPricingAdjustmentAmount: 0,
      dynamicPricingRuleIds: [],
    };
  });
}

function evaluateRuleEligibility(rule: any, workingItems: any[], context: any) {
  const matchingItems = workingItems.filter((item) => scopeMatches(rule, item));
  if (matchingItems.length === 0) return null;
  const cartSubtotal = workingItems.reduce((sum, item) => sum + item.adjustedUnitPriceAmount * item.quantity, 0);
  const matchingSubtotal = matchingItems.reduce((sum, item) => sum + item.adjustedUnitPriceAmount * item.quantity, 0);
  const evalContext = {
    ...context,
    cartSubtotal,
    cartItemCount: workingItems.reduce((sum, item) => sum + item.quantity, 0),
    matchingSubtotal,
    matchingQuantity: matchingItems.reduce((sum, item) => sum + item.quantity, 0),
  };
  const conditionResults = (rule.conditions ?? []).map((condition: any) =>
    compare(condition, conditionActual(condition, evalContext)),
  );
  const eligible =
    conditionResults.length === 0 ||
    (rule.conditionsMatch === "any"
      ? conditionResults.some(Boolean)
      : conditionResults.every(Boolean));
  return eligible ? { matchingItems, cartSubtotal, matchingSubtotal } : null;
}

function applyRule(rule: any, workingItems: any[], eligibility: any) {
  const matchingItems = eligibility.matchingItems;
  let cartDiscountAmount = 0;
  let freeShipping = false;
  let ruleDiscount = 0;

  if (rule.action.target === "matching_items") {
    for (const item of matchingItems) {
      const before = item.adjustedUnitPriceAmount;
      const after = applyItemAction(rule.action, before);
      const adjustment = Math.max(0, before - after) * item.quantity;
      item.adjustedUnitPriceAmount = after;
      item.dynamicPricingAdjustmentAmount += adjustment;
      item.dynamicPricingRuleIds.push(rule._id);
      ruleDiscount += adjustment;
    }
    if (typeof rule.action.maxDiscountAmount === "number" && ruleDiscount > rule.action.maxDiscountAmount) {
      const ratio = rule.action.maxDiscountAmount / ruleDiscount;
      let cappedRuleDiscount = 0;
      for (const item of matchingItems) {
        const currentAdjustment = Number(item.dynamicPricingAdjustmentAmount ?? 0);
        const cappedAdjustment = Math.round(currentAdjustment * ratio);
        const cappedUnitDiscount = Math.round(cappedAdjustment / Math.max(1, item.quantity));
        item.adjustedUnitPriceAmount = Math.max(0, item.baseUnitPriceAmount - cappedUnitDiscount);
        item.dynamicPricingAdjustmentAmount = cappedAdjustment;
        cappedRuleDiscount += cappedAdjustment;
      }
      ruleDiscount = cappedRuleDiscount;
    }
  } else if (rule.action.target === "cheapest_matching_item") {
    const cheapest = [...matchingItems].sort((a, b) => a.adjustedUnitPriceAmount - b.adjustedUnitPriceAmount)[0];
    if (cheapest) {
      const before = cheapest.adjustedUnitPriceAmount;
      const after = applyItemAction(rule.action, before);
      const uncappedAdjustment = Math.max(0, before - after);
      const adjustment = capRuleDiscount(rule.action, uncappedAdjustment);
      cheapest.adjustedUnitPriceAmount = Math.max(0, before - adjustment);
      cheapest.dynamicPricingAdjustmentAmount += adjustment;
      cheapest.dynamicPricingRuleIds.push(rule._id);
      ruleDiscount += adjustment;
    }
  } else if (rule.action.target === "cart_subtotal") {
    ruleDiscount = cartActionDiscount(rule.action, eligibility.matchingSubtotal || eligibility.cartSubtotal);
    cartDiscountAmount += ruleDiscount;
  } else if (rule.action.target === "shipping" && rule.action.type === "free_shipping") {
    freeShipping = true;
  }

  return { cartDiscountAmount, freeShipping, ruleDiscount };
}

export async function evaluateDynamicPricingForCart(ctx: any, input: { cart: any; items: any[] }) {
  const now = Date.now();
  const rules = (
    await ctx.db
      .query("commerce_dynamic_pricing_rules")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect()
  )
    .filter((rule: any) => (!rule.startsAt || rule.startsAt <= now) && (!rule.endsAt || rule.endsAt >= now))
    .sort((a: any, b: any) => b.priority - a.priority || a.createdAt - b.createdAt);

  const customer = await buildCustomerContext(ctx, input.cart);
  return evaluateDynamicPricingRules({
    rules,
    cart: input.cart,
    items: input.items,
    customerContext: customer,
  });
}

function evaluateDynamicPricingRules(input: {
  rules: any[];
  cart: any;
  items: any[];
  customerContext: any;
}) {
  const { rules } = input;
  if (rules.length === 0) {
    return {
      items: input.items.map((item) => ({
        ...item,
        baseUnitPriceAmount: item.baseUnitPriceAmount ?? item.unitPriceAmount,
        adjustedUnitPriceAmount: item.baseUnitPriceAmount ?? item.unitPriceAmount,
        dynamicPricingAdjustmentAmount: 0,
        dynamicPricingRuleIds: [],
      })),
      cartDiscountAmount: 0,
      ruleIds: [],
      freeShipping: false,
      description: undefined,
    };
  }

  const workingItems = createWorkingItems(input.items);
  let cartDiscountAmount = 0;
  const appliedRuleIds: any[] = [];
  const messages: string[] = [];
  let freeShipping = false;
  const baseContext = {
    ...input.customerContext,
    customerGroupId: input.cart.customerGroupId ? String(input.cart.customerGroupId) : undefined,
    appliedDiscountCode: input.cart.appliedDiscountCode,
    shippingCountry: input.cart.shippingAddress?.countryCode,
  };

  const bestDiscountRules = rules.filter((rule: any) => rule.processingMode === "best_discount");
  let bestCandidate: any = null;
  for (const rule of bestDiscountRules) {
    if (input.cart.appliedDiscountCode && rule.stackWithCoupons === false) continue;
    const simulatedItems = createWorkingItems(input.items);
    const eligibility = evaluateRuleEligibility(rule, simulatedItems, baseContext);
    if (!eligibility) continue;
    const result = applyRule(rule, simulatedItems, eligibility);
    const totalBenefit = result.ruleDiscount + (result.freeShipping ? 1 : 0);
    if (totalBenefit > 0 && (!bestCandidate || totalBenefit > bestCandidate.totalBenefit)) {
      bestCandidate = {
        rule,
        items: simulatedItems,
        result,
        totalBenefit,
      };
    }
  }

  if (bestCandidate) {
    for (let index = 0; index < workingItems.length; index++) {
      workingItems[index].adjustedUnitPriceAmount = bestCandidate.items[index].adjustedUnitPriceAmount;
      workingItems[index].dynamicPricingAdjustmentAmount = bestCandidate.items[index].dynamicPricingAdjustmentAmount;
      workingItems[index].dynamicPricingRuleIds = bestCandidate.items[index].dynamicPricingRuleIds;
    }
    cartDiscountAmount += bestCandidate.result.cartDiscountAmount;
    freeShipping = freeShipping || bestCandidate.result.freeShipping;
    appliedRuleIds.push(bestCandidate.rule._id);
    messages.push(bestCandidate.rule.customerMessage || bestCandidate.rule.name);
    if (bestCandidate.rule.exclusive) {
      return {
        items: workingItems,
        cartDiscountAmount,
        ruleIds: [...new Map(appliedRuleIds.map((id) => [String(id), id])).values()],
        freeShipping,
        description: messages.length ? messages.join("; ") : undefined,
      };
    }
  }

  for (const rule of rules) {
    if (rule.processingMode === "best_discount") continue;
    if (input.cart.appliedDiscountCode && rule.stackWithCoupons === false) {
      continue;
    }
    const eligibility = evaluateRuleEligibility(rule, workingItems, baseContext);
    if (!eligibility) continue;
    const result = applyRule(rule, workingItems, eligibility);
    cartDiscountAmount += result.cartDiscountAmount;
    freeShipping = freeShipping || result.freeShipping;

    if (result.ruleDiscount > 0 || result.freeShipping) {
      appliedRuleIds.push(rule._id);
      messages.push(rule.customerMessage || rule.name);
      if (rule.exclusive || rule.processingMode === "first_match") break;
    }
  }

  return {
    items: workingItems,
    cartDiscountAmount,
    ruleIds: [...new Map(appliedRuleIds.map((id) => [String(id), id])).values()],
    freeShipping,
    description: messages.length ? messages.join("; ") : undefined,
  };
}
