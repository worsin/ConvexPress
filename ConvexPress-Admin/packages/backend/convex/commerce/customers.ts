// @ts-nocheck
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";

// ============================================
// QUERIES — Customer Profile (self-service)
// ============================================

/**
 * List all customer profiles (admin only).
 * Kept from original stub.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return ctx.db.query("commerce_customer_profiles").take(500);
  },
});

/**
 * Get the current user's customer profile.
 * Kept from original stub.
 */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();

    if (!profile) return null;

    // Fetch default addresses
    const defaultBilling = profile.defaultBillingAddressId
      ? await ctx.db.get(profile.defaultBillingAddressId)
      : null;
    const defaultShipping = profile.defaultShippingAddressId
      ? await ctx.db.get(profile.defaultShippingAddressId)
      : null;

    return {
      ...profile,
      defaultBillingAddress: defaultBilling,
      defaultShippingAddress: defaultShipping,
    };
  },
});

/**
 * Get the current user's addresses.
 */
export const getMyAddresses = query({
  args: {
    type: v.optional(
      v.union(v.literal("billing"), v.literal("shipping")),
    ),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();
    if (!profile) return [];

    const addresses = await ctx.db
      .query("commerce_customer_addresses")
      .withIndex("by_customer", (q: any) => q.eq("customerId", profile._id))
      .collect();

    if (args.type) {
      return addresses.filter((a: any) => a.addressType === args.type);
    }

    return addresses;
  },
});

/**
 * Get a single address by ID (owned by current user).
 */
export const getAddress = query({
  args: { addressId: v.id("commerce_customer_addresses") },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();
    if (!profile) return null;

    const address = await ctx.db.get(args.addressId);
    if (!address || address.customerId !== profile._id) return null;

    return address;
  },
});

// ============================================
// QUERIES — Admin Customer Management
// ============================================

/**
 * List customers with optional search / filter (admin only).
 */
export const listCustomers = query({
  args: {
    search: v.optional(v.string()),
    sortBy: v.optional(
      v.union(
        v.literal("createdAt"),
        v.literal("totalSpentAmount"),
        v.literal("totalOrders"),
      ),
    ),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const take = args.limit ?? 500;
    let customers = await ctx.db
      .query("commerce_customer_profiles")
      .take(take);

    // Search by email
    if (args.search) {
      const search = args.search.toLowerCase();
      customers = customers.filter((c: any) =>
        c.email.toLowerCase().includes(search),
      );
    }

    // Sort
    const sortBy = args.sortBy || "createdAt";
    const sortOrder = args.sortOrder || "desc";
    customers.sort((a: any, b: any) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    return customers;
  },
});

/**
 * Get full customer detail (admin only).
 * Includes addresses and recent orders.
 */
export const getCustomer = query({
  args: { customerId: v.id("commerce_customer_profiles") },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;

    // Addresses
    const addresses = await ctx.db
      .query("commerce_customer_addresses")
      .withIndex("by_customer", (q: any) => q.eq("customerId", args.customerId))
      .collect();

    // Recent orders
    let recentOrders: any[] = [];
    try {
      recentOrders = await ctx.db
        .query("commerce_orders")
        .withIndex("by_customer", (q: any) =>
          q.eq("customerId", args.customerId),
        )
        .order("desc")
        .take(10);
    } catch {
      // Orders table may not have data yet
    }

    // Linked user record (if userId is set)
    let userRecord = null;
    if (customer.userId) {
      userRecord = await ctx.db.get(customer.userId);
    }

    return {
      ...customer,
      addresses,
      recentOrders,
      user: userRecord
        ? {
            _id: userRecord._id,
            email: userRecord.email,
            displayName: userRecord.displayName,
          }
        : null,
    };
  },
});

/**
 * Get aggregate customer stats (admin dashboard).
 */
export const getCustomerStats = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const daysAgo = args.days ?? 30;
    const startTime = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

    const allCustomers = await ctx.db
      .query("commerce_customer_profiles")
      .take(100000);

    const newCustomers = allCustomers.filter(
      (c: any) => c.createdAt >= startTime,
    );

    const totalSpent = allCustomers.reduce(
      (sum: number, c: any) => sum + (c.totalSpentAmount ?? 0),
      0,
    );

    const totalOrders = allCustomers.reduce(
      (sum: number, c: any) => sum + (c.totalOrders ?? 0),
      0,
    );

    return {
      totalCustomers: allCustomers.length,
      newCustomers: newCustomers.length,
      totalSpent,
      totalOrders,
      averageSpent:
        allCustomers.length > 0 ? totalSpent / allCustomers.length : 0,
    };
  },
});

// ============================================
// MUTATIONS — Customer Profile CRUD
// ============================================

/**
 * Create or ensure a customer profile exists for the current user.
 */
export const ensureMine = mutation({
  args: {
    email: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "unauthorized", message: "Not signed in" });
    }

    // Check if profile already exists
    const existing = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();

    if (existing) return existing._id;

    // Also check by email
    const byEmail = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_email", (q: any) => q.eq("email", args.email))
      .unique();

    if (byEmail) {
      // Link existing guest profile to this user
      if (!byEmail.userId) {
        await ctx.db.patch(byEmail._id, {
          userId: user._id,
          updatedAt: Date.now(),
        });
      }
      return byEmail._id;
    }

    const now = Date.now();
    return await ctx.db.insert("commerce_customer_profiles", {
      userId: user._id,
      email: args.email,
      phone: args.phone,
      totalOrders: 0,
      totalSpentAmount: 0,
      currencyCode: "USD",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Create a customer profile without a user link (guest / admin-created).
 * Admin only.
 */
export const createCustomer = mutation({
  args: {
    email: v.string(),
    phone: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    currencyCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Check duplicate email
    const existing = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_email", (q: any) => q.eq("email", args.email))
      .unique();

    if (existing) {
      throw new ConvexError({
        code: "duplicate_email",
        message: "A customer with this email already exists.",
      });
    }

    const now = Date.now();
    return await ctx.db.insert("commerce_customer_profiles", {
      userId: args.userId,
      email: args.email,
      phone: args.phone,
      totalOrders: 0,
      totalSpentAmount: 0,
      currencyCode: args.currencyCode ?? "USD",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a customer profile (admin only).
 */
export const updateCustomer = mutation({
  args: {
    customerId: v.id("commerce_customer_profiles"),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    defaultBillingAddressId: v.optional(
      v.id("commerce_customer_addresses"),
    ),
    defaultShippingAddressId: v.optional(
      v.id("commerce_customer_addresses"),
    ),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new ConvexError({
        code: "not_found",
        message: "Customer not found.",
      });
    }

    // If changing email, check for duplicates
    if (args.email && args.email !== customer.email) {
      const dup = await ctx.db
        .query("commerce_customer_profiles")
        .withIndex("by_email", (q: any) => q.eq("email", args.email))
        .unique();

      if (dup) {
        throw new ConvexError({
          code: "duplicate_email",
          message: "A customer with this email already exists.",
        });
      }
    }

    const { customerId, ...updateFields } = args;
    await ctx.db.patch(customerId, {
      ...updateFields,
      updatedAt: Date.now(),
    });

    return customerId;
  },
});

/**
 * Update the current user's own profile fields.
 */
export const updateMyProfile = mutation({
  args: {
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "unauthorized", message: "Not signed in" });
    }

    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();

    if (!profile) {
      throw new ConvexError({
        code: "not_found",
        message: "Customer profile not found.",
      });
    }

    await ctx.db.patch(profile._id, {
      ...args,
      updatedAt: Date.now(),
    });

    return profile._id;
  },
});

/**
 * Delete a customer profile (admin only).
 * Also deletes all associated addresses.
 */
export const deleteCustomer = mutation({
  args: { customerId: v.id("commerce_customer_profiles") },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new ConvexError({
        code: "not_found",
        message: "Customer not found.",
      });
    }

    // Delete all addresses
    const addresses = await ctx.db
      .query("commerce_customer_addresses")
      .withIndex("by_customer", (q: any) =>
        q.eq("customerId", args.customerId),
      )
      .collect();

    for (const addr of addresses) {
      await ctx.db.delete(addr._id);
    }

    await ctx.db.delete(args.customerId);
    return args.customerId;
  },
});

// ============================================
// MUTATIONS — Address Management
// ============================================

/**
 * Add a new address for the current user's customer profile.
 */
export const addAddress = mutation({
  args: {
    addressType: v.union(v.literal("billing"), v.literal("shipping")),
    label: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.optional(v.string()),
    postalCode: v.string(),
    countryCode: v.string(),
    phone: v.optional(v.string()),
    setAsDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "unauthorized", message: "Not signed in" });
    }

    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();

    if (!profile) {
      throw new ConvexError({
        code: "not_found",
        message: "Customer profile not found. Create a profile first.",
      });
    }

    // Check address limit (max 10)
    const existing = await ctx.db
      .query("commerce_customer_addresses")
      .withIndex("by_customer", (q: any) =>
        q.eq("customerId", profile._id),
      )
      .collect();

    if (existing.length >= 10) {
      throw new ConvexError({
        code: "limit_exceeded",
        message: "Maximum 10 addresses allowed.",
      });
    }

    // Determine default status
    const typeAddresses = existing.filter(
      (a: any) => a.addressType === args.addressType,
    );
    const isDefault = args.setAsDefault || typeAddresses.length === 0;

    // Unset previous defaults of this type
    if (isDefault) {
      for (const addr of typeAddresses.filter((a: any) => a.isDefault)) {
        await ctx.db.patch(addr._id, { isDefault: false });
      }
    }

    const { setAsDefault, ...addressFields } = args;
    const now = Date.now();

    const addressId = await ctx.db.insert("commerce_customer_addresses", {
      customerId: profile._id,
      label: addressFields.label,
      addressType: addressFields.addressType,
      isDefault,
      address: {
        firstName: addressFields.firstName,
        lastName: addressFields.lastName,
        company: addressFields.company,
        line1: addressFields.line1,
        line2: addressFields.line2,
        city: addressFields.city,
        state: addressFields.state,
        postalCode: addressFields.postalCode,
        countryCode: addressFields.countryCode,
        phone: addressFields.phone,
      },
      createdAt: now,
      updatedAt: now,
    });

    // Update profile default reference
    if (isDefault) {
      const profileUpdate: Record<string, any> = { updatedAt: now };
      if (args.addressType === "shipping") {
        profileUpdate.defaultShippingAddressId = addressId;
      } else {
        profileUpdate.defaultBillingAddressId = addressId;
      }
      await ctx.db.patch(profile._id, profileUpdate);
    }

    return addressId;
  },
});

/**
 * Update an existing address (owner only).
 */
export const updateAddress = mutation({
  args: {
    addressId: v.id("commerce_customer_addresses"),
    label: v.optional(v.string()),
    addressType: v.optional(
      v.union(v.literal("billing"), v.literal("shipping")),
    ),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    line1: v.optional(v.string()),
    line2: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "unauthorized", message: "Not signed in" });
    }

    const address = await ctx.db.get(args.addressId);
    if (!address) {
      throw new ConvexError({
        code: "not_found",
        message: "Address not found.",
      });
    }

    // Verify ownership
    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();

    if (!profile || address.customerId !== profile._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Not your address.",
      });
    }

    const { addressId, label, addressType, ...addressParts } = args;

    // Build updated address object by merging
    const updatedAddress = { ...address.address };
    for (const [key, value] of Object.entries(addressParts)) {
      if (value !== undefined) {
        (updatedAddress as any)[key] = value;
      }
    }

    const patch: Record<string, any> = {
      address: updatedAddress,
      updatedAt: Date.now(),
    };
    if (label !== undefined) patch.label = label;
    if (addressType !== undefined) patch.addressType = addressType;

    await ctx.db.patch(addressId, patch);
    return addressId;
  },
});

/**
 * Delete an address (owner only).
 */
export const deleteAddress = mutation({
  args: { addressId: v.id("commerce_customer_addresses") },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "unauthorized", message: "Not signed in" });
    }

    const address = await ctx.db.get(args.addressId);
    if (!address) {
      throw new ConvexError({
        code: "not_found",
        message: "Address not found.",
      });
    }

    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();

    if (!profile || address.customerId !== profile._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Not your address.",
      });
    }

    // Clear default references on profile
    const profileUpdate: Record<string, any> = {};
    if (profile.defaultShippingAddressId === args.addressId) {
      profileUpdate.defaultShippingAddressId = undefined;
    }
    if (profile.defaultBillingAddressId === args.addressId) {
      profileUpdate.defaultBillingAddressId = undefined;
    }
    if (Object.keys(profileUpdate).length > 0) {
      profileUpdate.updatedAt = Date.now();
      await ctx.db.patch(profile._id, profileUpdate);
    }

    await ctx.db.delete(args.addressId);
    return args.addressId;
  },
});

/**
 * Set an address as the default for its type (owner only).
 */
export const setDefaultAddress = mutation({
  args: {
    addressId: v.id("commerce_customer_addresses"),
    addressType: v.union(v.literal("billing"), v.literal("shipping")),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "unauthorized", message: "Not signed in" });
    }

    const address = await ctx.db.get(args.addressId);
    if (!address) {
      throw new ConvexError({
        code: "not_found",
        message: "Address not found.",
      });
    }

    const profile = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();

    if (!profile || address.customerId !== profile._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Not your address.",
      });
    }

    // Unset other defaults of this type
    const allAddresses = await ctx.db
      .query("commerce_customer_addresses")
      .withIndex("by_customer", (q: any) =>
        q.eq("customerId", profile._id),
      )
      .collect();

    for (const addr of allAddresses) {
      if (
        addr._id !== args.addressId &&
        addr.isDefault &&
        addr.addressType === args.addressType
      ) {
        await ctx.db.patch(addr._id, { isDefault: false });
      }
    }

    // Set this address as default
    await ctx.db.patch(args.addressId, {
      isDefault: true,
      updatedAt: Date.now(),
    });

    // Update profile reference
    const profileUpdate: Record<string, any> = { updatedAt: Date.now() };
    if (args.addressType === "shipping") {
      profileUpdate.defaultShippingAddressId = args.addressId;
    } else {
      profileUpdate.defaultBillingAddressId = args.addressId;
    }
    await ctx.db.patch(profile._id, profileUpdate);

    return args.addressId;
  },
});

/**
 * Admin: add an address to any customer profile.
 */
export const adminAddAddress = mutation({
  args: {
    customerId: v.id("commerce_customer_profiles"),
    addressType: v.union(v.literal("billing"), v.literal("shipping")),
    label: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.optional(v.string()),
    postalCode: v.string(),
    countryCode: v.string(),
    phone: v.optional(v.string()),
    setAsDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new ConvexError({
        code: "not_found",
        message: "Customer not found.",
      });
    }

    const existing = await ctx.db
      .query("commerce_customer_addresses")
      .withIndex("by_customer", (q: any) =>
        q.eq("customerId", args.customerId),
      )
      .collect();

    if (existing.length >= 10) {
      throw new ConvexError({
        code: "limit_exceeded",
        message: "Maximum 10 addresses allowed.",
      });
    }

    const typeAddresses = existing.filter(
      (a: any) => a.addressType === args.addressType,
    );
    const isDefault = args.setAsDefault || typeAddresses.length === 0;

    if (isDefault) {
      for (const addr of typeAddresses.filter((a: any) => a.isDefault)) {
        await ctx.db.patch(addr._id, { isDefault: false });
      }
    }

    const now = Date.now();
    const addressId = await ctx.db.insert("commerce_customer_addresses", {
      customerId: args.customerId,
      label: args.label,
      addressType: args.addressType,
      isDefault,
      address: {
        firstName: args.firstName,
        lastName: args.lastName,
        company: args.company,
        line1: args.line1,
        line2: args.line2,
        city: args.city,
        state: args.state,
        postalCode: args.postalCode,
        countryCode: args.countryCode,
        phone: args.phone,
      },
      createdAt: now,
      updatedAt: now,
    });

    if (isDefault) {
      const profileUpdate: Record<string, any> = { updatedAt: now };
      if (args.addressType === "shipping") {
        profileUpdate.defaultShippingAddressId = addressId;
      } else {
        profileUpdate.defaultBillingAddressId = addressId;
      }
      await ctx.db.patch(args.customerId, profileUpdate);
    }

    return addressId;
  },
});

/**
 * Admin: delete an address from any customer profile.
 */
export const adminDeleteAddress = mutation({
  args: { addressId: v.id("commerce_customer_addresses") },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const address = await ctx.db.get(args.addressId);
    if (!address) {
      throw new ConvexError({
        code: "not_found",
        message: "Address not found.",
      });
    }

    // Clear profile defaults if needed
    const customer = await ctx.db.get(address.customerId);
    if (customer) {
      const profileUpdate: Record<string, any> = {};
      if (customer.defaultShippingAddressId === args.addressId) {
        profileUpdate.defaultShippingAddressId = undefined;
      }
      if (customer.defaultBillingAddressId === args.addressId) {
        profileUpdate.defaultBillingAddressId = undefined;
      }
      if (Object.keys(profileUpdate).length > 0) {
        profileUpdate.updatedAt = Date.now();
        await ctx.db.patch(customer._id, profileUpdate);
      }
    }

    await ctx.db.delete(args.addressId);
    return args.addressId;
  },
});

// ============================================
// MUTATIONS — Admin Order Stats Update
// ============================================

/**
 * Internal: increment a customer's order count and total spent.
 * Called after an order is completed.
 */
export const incrementOrderStats = internalMutation({
  args: {
    customerId: v.id("commerce_customer_profiles"),
    orderAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return;

    await ctx.db.patch(args.customerId, {
      totalOrders: (customer.totalOrders ?? 0) + 1,
      totalSpentAmount: (customer.totalSpentAmount ?? 0) + args.orderAmount,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: decrement order stats (e.g. on refund/cancel).
 */
export const decrementOrderStats = internalMutation({
  args: {
    customerId: v.id("commerce_customer_profiles"),
    orderAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return;

    await ctx.db.patch(args.customerId, {
      totalOrders: Math.max(0, (customer.totalOrders ?? 0) - 1),
      totalSpentAmount: Math.max(
        0,
        (customer.totalSpentAmount ?? 0) - args.orderAmount,
      ),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: look up a customer profile by email (used during checkout).
 */
export const getByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_email", (q: any) => q.eq("email", args.email))
      .unique();
  },
});

/**
 * Internal: look up a customer profile by userId.
 */
export const getByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Internal: create or link a customer profile during checkout.
 */
export const ensureForCheckout = internalMutation({
  args: {
    email: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Try by user first
    if (args.userId) {
      const byUser = await ctx.db
        .query("commerce_customer_profiles")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .unique();

      if (byUser) return byUser._id;
    }

    // Try by email
    const byEmail = await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_email", (q: any) => q.eq("email", args.email))
      .unique();

    if (byEmail) {
      // Link user if not already linked
      if (args.userId && !byEmail.userId) {
        await ctx.db.patch(byEmail._id, {
          userId: args.userId,
          updatedAt: Date.now(),
        });
      }
      return byEmail._id;
    }

    // Create new
    const now = Date.now();
    return await ctx.db.insert("commerce_customer_profiles", {
      userId: args.userId,
      email: args.email,
      totalOrders: 0,
      totalSpentAmount: 0,
      currencyCode: "USD",
      createdAt: now,
      updatedAt: now,
    });
  },
});
