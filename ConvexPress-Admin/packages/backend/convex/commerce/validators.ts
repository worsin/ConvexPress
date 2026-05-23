// @ts-nocheck
import { v } from "convex/values";

export const commerceSlugValidator = v.string();

export const commercePriceInputValidator = v.object({
  amount: v.number(),
  currencyCode: v.string(),
});

export const digitalDeliveryModeValidator = v.union(
  v.literal("download"),
  v.literal("license"),
  v.literal("download_and_license"),
);

export const licenseKeyTypeValidator = v.union(
  v.literal("single"),
  v.literal("multi"),
  v.literal("unlimited"),
  v.literal("subscription"),
);

export const commerceProductCreateValidator = v.object({
  title: v.string(),
  slug: commerceSlugValidator,
  description: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  sku: v.optional(v.string()),
  categoryIds: v.array(v.id("commerce_product_categories")),
  featuredMediaId: v.optional(v.id("media")),
  galleryMediaIds: v.array(v.id("media")),
  basePrice: commercePriceInputValidator,
  salePrice: v.optional(commercePriceInputValidator),
  trackInventory: v.boolean(),
  stockQuantity: v.optional(v.number()),
  allowBackorders: v.boolean(),
  isVirtual: v.boolean(),
  shippingWeightOz: v.optional(v.number()),
  isDownloadable: v.boolean(),
  requiresLicense: v.optional(v.boolean()),
  digitalDeliveryMode: v.optional(digitalDeliveryModeValidator),
  downloadLimit: v.optional(v.number()),
  downloadExpiryDays: v.optional(v.number()),
  licenseKeyType: v.optional(licenseKeyTypeValidator),
  maxActivations: v.optional(v.number()),
  licenseExpiresAfterDays: v.optional(v.number()),
});

export const listCommerceProductsArgs = {
  search: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("publish"),
      v.literal("private"),
      v.literal("trash"),
    ),
  ),
  productType: v.optional(v.string()),
  authorId: v.optional(v.id("users")),
  orderBy: v.optional(v.string()),
  orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

export const productCountsArgs = {
  search: v.optional(v.string()),
  productType: v.optional(v.string()),
  authorId: v.optional(v.id("users")),
};

export const productBulkArgs = {
  productIds: v.array(v.id("commerce_products")),
};

export const productBulkUpdateStatusArgs = {
  productIds: v.array(v.id("commerce_products")),
  status: v.string(),
};

export const getCommerceProductArgs = {
  productId: v.id("commerce_products"),
};

export const getCommerceProductBySlugArgs = {
  slug: v.string(),
};

export const listPublishedCommerceProductsArgs = {
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  categorySlug: v.optional(v.string()),
  search: v.optional(v.string()),
};

export const createCommerceCategoryArgs = {
  name: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  parentId: v.optional(v.union(v.id("commerce_product_categories"), v.null())),
  thumbnailMediaId: v.optional(v.id("media")),
  icon: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
  isVisible: v.optional(v.boolean()),
  isFeatured: v.optional(v.boolean()),
  showInNav: v.optional(v.boolean()),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
};

export const updateCommerceCategoryArgs = {
  categoryId: v.id("commerce_product_categories"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  parentId: v.optional(v.union(v.id("commerce_product_categories"), v.null())),
  thumbnailMediaId: v.optional(v.union(v.id("media"), v.null())),
  icon: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.number()),
  isVisible: v.optional(v.boolean()),
  isFeatured: v.optional(v.boolean()),
  showInNav: v.optional(v.boolean()),
  metaTitle: v.optional(v.union(v.string(), v.null())),
  metaDescription: v.optional(v.union(v.string(), v.null())),
};

export const removeCommerceCategoryArgs = {
  categoryId: v.id("commerce_product_categories"),
  moveProductsTo: v.optional(v.id("commerce_product_categories")),
};

export const moveCommerceCategoryArgs = {
  categoryId: v.id("commerce_product_categories"),
  parentId: v.optional(v.union(v.id("commerce_product_categories"), v.null())),
  sortOrder: v.optional(v.number()),
};

export const reorderCommerceCategoriesArgs = {
  parentId: v.optional(v.id("commerce_product_categories")),
  orderedIds: v.array(v.id("commerce_product_categories")),
};

export const createCommerceProductArgs = {
  title: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  sku: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
  featuredMediaId: v.optional(v.id("media")),
  galleryMediaIds: v.optional(v.array(v.id("media"))),
  basePrice: commercePriceInputValidator,
  salePrice: v.optional(commercePriceInputValidator),
  trackInventory: v.optional(v.boolean()),
  stockQuantity: v.optional(v.number()),
  allowBackorders: v.optional(v.boolean()),
  isVirtual: v.optional(v.boolean()),
  shippingWeightOz: v.optional(v.number()),
  isDownloadable: v.optional(v.boolean()),
  requiresLicense: v.optional(v.boolean()),
  digitalDeliveryMode: v.optional(digitalDeliveryModeValidator),
  downloadLimit: v.optional(v.number()),
  downloadExpiryDays: v.optional(v.number()),
  licenseKeyType: v.optional(licenseKeyTypeValidator),
  maxActivations: v.optional(v.number()),
  licenseExpiresAfterDays: v.optional(v.number()),
  isNonReturnable: v.optional(v.boolean()),
  taxClass: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("publish"),
      v.literal("private"),
      v.literal("trash"),
    ),
  ),
};

export const updateCommerceProductArgs = {
  productId: v.id("commerce_products"),
  title: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  sku: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
  featuredMediaId: v.optional(v.union(v.id("media"), v.null())),
  galleryMediaIds: v.optional(v.array(v.id("media"))),
  basePrice: v.optional(commercePriceInputValidator),
  salePrice: v.optional(v.union(commercePriceInputValidator, v.null())),
  trackInventory: v.optional(v.boolean()),
  stockQuantity: v.optional(v.union(v.number(), v.null())),
  allowBackorders: v.optional(v.boolean()),
  isVirtual: v.optional(v.boolean()),
  shippingWeightOz: v.optional(v.union(v.number(), v.null())),
  isDownloadable: v.optional(v.boolean()),
  requiresLicense: v.optional(v.boolean()),
  digitalDeliveryMode: v.optional(digitalDeliveryModeValidator),
  downloadLimit: v.optional(v.union(v.number(), v.null())),
  downloadExpiryDays: v.optional(v.union(v.number(), v.null())),
  licenseKeyType: v.optional(licenseKeyTypeValidator),
  maxActivations: v.optional(v.union(v.number(), v.null())),
  licenseExpiresAfterDays: v.optional(v.union(v.number(), v.null())),
  isNonReturnable: v.optional(v.boolean()),
  taxClass: v.optional(v.union(v.string(), v.null())),
  status: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("publish"),
      v.literal("private"),
      v.literal("trash"),
    ),
  ),
};

export const getCartArgs = {
  sessionToken: v.optional(v.string()),
};

export const addCartItemArgs = {
  sessionToken: v.string(),
  productId: v.id("commerce_products"),
  variantId: v.optional(v.id("commerce_product_variants")),
  quantity: v.number(),
  metadata: v.optional(
    v.object({
      lineType: v.literal("bundle"),
      bundleId: v.id("commerce_bundles"),
      selections: v.array(
        v.object({
          componentId: v.id("commerce_bundle_components"),
          productId: v.optional(v.id("commerce_products")),
          variantId: v.optional(v.id("commerce_product_variants")),
          quantity: v.number(),
        }),
      ),
    }),
  ),
};

export const updateCartItemArgs = {
  sessionToken: v.optional(v.string()),
  cartItemId: v.id("commerce_cart_items"),
  quantity: v.number(),
};

export const removeCartItemArgs = {
  sessionToken: v.optional(v.string()),
  cartItemId: v.id("commerce_cart_items"),
};

export const clearCartArgs = {
  sessionToken: v.string(),
};

export const applyCartDiscountCodeArgs = {
  sessionToken: v.string(),
  code: v.string(),
};

export const removeCartDiscountCodeArgs = {
  sessionToken: v.string(),
};

export const mergeCartArgs = {
  sessionToken: v.string(),
};

export const shareCartArgs = {
  sessionToken: v.string(),
};

export const getSharedCartArgs = {
  shareToken: v.string(),
};

export const copySharedCartArgs = {
  shareToken: v.string(),
  sessionToken: v.string(),
};

export const markAbandonedCartsArgs = {
  olderThanMs: v.optional(v.number()),
  limit: v.optional(v.number()),
};

export const createCheckoutSessionArgs = {
  sessionToken: v.string(),
  email: v.optional(v.string()),
};

export const updateCheckoutSessionArgs = {
  sessionToken: v.string(),
  email: v.optional(v.string()),
  shippingAddress: v.optional(
    v.object({
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
    }),
  ),
  billingAddress: v.optional(
    v.object({
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
    }),
  ),
  selectedShippingMethodCode: v.optional(v.string()),
  selectedPaymentMethodCode: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const getCheckoutSessionArgs = {
  sessionToken: v.string(),
};

export const listCheckoutShippingQuotesArgs = {
  sessionToken: v.string(),
};

export const completeCheckoutArgs = {
  sessionToken: v.string(),
};

export const abandonCheckoutSessionArgs = {
  sessionToken: v.string(),
  reason: v.optional(v.string()),
};

export const listAbandonedCheckoutSessionsArgs = {
  olderThanMs: v.optional(v.number()),
  limit: v.optional(v.number()),
};

export const listOrdersArgs = {
  status: v.optional(v.string()),
  search: v.optional(v.string()),
  orderBy: v.optional(v.string()),
  orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  customerId: v.optional(v.id("commerce_customer_profiles")),
  userId: v.optional(v.id("users")),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  paymentStatus: v.optional(v.string()),
  fulfillmentStatus: v.optional(v.string()),
};

export const orderCountsArgs = {
  search: v.optional(v.string()),
  customerId: v.optional(v.id("commerce_customer_profiles")),
  userId: v.optional(v.id("users")),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
};

export const orderBulkArgs = {
  orderIds: v.array(v.id("commerce_orders")),
};

export const orderBulkUpdateStatusArgs = {
  orderIds: v.array(v.id("commerce_orders")),
  status: v.string(),
};

export const getOrderArgs = {
  orderId: v.id("commerce_orders"),
};

export const getOrderByCheckoutSessionArgs = {
  orderId: v.id("commerce_orders"),
  sessionToken: v.string(),
};

export const getOrderByTrackingTokenArgs = {
  trackingToken: v.string(),
};

export const updateOrderStatusArgs = {
  orderId: v.id("commerce_orders"),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("paid"),
    v.literal("fulfilled"),
    v.literal("completed"),
    v.literal("cancelled"),
    v.literal("refunded"),
    v.literal("failed"),
  ),
  note: v.optional(v.string()),
};

export const updateOrderFulfillmentArgs = {
  orderId: v.id("commerce_orders"),
  fulfillmentStatus: v.union(
    v.literal("unfulfilled"),
    v.literal("partial"),
    v.literal("fulfilled"),
  ),
  note: v.optional(v.string()),
};

export const captureOrderPaymentArgs = {
  orderId: v.id("commerce_orders"),
  provider: v.string(),
  providerTransactionId: v.optional(v.string()),
  amount: v.optional(v.number()),
  note: v.optional(v.string()),
};

export const createOrderRefundArgs = {
  orderId: v.id("commerce_orders"),
  amount: v.number(),
  reason: v.optional(v.string()),
};

export const createShipmentArgs = {
  orderId: v.id("commerce_orders"),
  provider: v.optional(v.string()),
  carrier: v.optional(v.string()),
  trackingNumber: v.optional(v.string()),
  trackingUrl: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal("label_created"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("returned"),
    ),
  ),
  items: v.optional(
    v.array(
      v.object({
        orderItemId: v.id("commerce_order_items"),
        quantity: v.number(),
      }),
    ),
  ),
  note: v.optional(v.string()),
};

export const updateShipmentStatusArgs = {
  shipmentId: v.id("commerce_shipments"),
  status: v.union(
    v.literal("label_created"),
    v.literal("shipped"),
    v.literal("delivered"),
    v.literal("returned"),
  ),
  provider: v.optional(v.string()),
  carrier: v.optional(v.string()),
  trackingNumber: v.optional(v.string()),
  trackingUrl: v.optional(v.string()),
  note: v.optional(v.string()),
};

const discountTypeValidator = v.union(
  v.literal("fixed_cart"),
  v.literal("percent"),
  v.literal("fixed_product"),
);

const discountApplicabilityValidator = v.union(
  v.literal("cart"),
  v.literal("matching_items"),
);

const discountTierValidator = v.object({
  label: v.optional(v.string()),
  minQuantity: v.optional(v.number()),
  minSubtotalAmount: v.optional(v.number()),
  discountType: discountTypeValidator,
  amount: v.number(),
});

export const createDiscountCodeArgs = {
  code: v.string(),
  description: v.optional(v.string()),
  status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  discountType: discountTypeValidator,
  amount: v.number(),
  minimumSubtotalAmount: v.optional(v.union(v.number(), v.null())),
  minimumQuantity: v.optional(v.union(v.number(), v.null())),
  applicability: v.optional(discountApplicabilityValidator),
  productIds: v.optional(v.array(v.id("commerce_products"))),
  categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
  excludedProductIds: v.optional(v.array(v.id("commerce_products"))),
  excludedCategoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
  tiers: v.optional(v.array(discountTierValidator)),
  maxDiscountAmount: v.optional(v.union(v.number(), v.null())),
  usageLimit: v.optional(v.union(v.number(), v.null())),
  startsAt: v.optional(v.union(v.number(), v.null())),
  endsAt: v.optional(v.union(v.number(), v.null())),
};

export const updateDiscountCodeArgs = {
  discountId: v.id("commerce_discount_codes"),
  code: v.optional(v.string()),
  description: v.optional(v.union(v.string(), v.null())),
  status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  discountType: v.optional(discountTypeValidator),
  amount: v.optional(v.number()),
  minimumSubtotalAmount: v.optional(v.union(v.number(), v.null())),
  minimumQuantity: v.optional(v.union(v.number(), v.null())),
  applicability: v.optional(discountApplicabilityValidator),
  productIds: v.optional(v.union(v.array(v.id("commerce_products")), v.null())),
  categoryIds: v.optional(
    v.union(v.array(v.id("commerce_product_categories")), v.null()),
  ),
  excludedProductIds: v.optional(
    v.union(v.array(v.id("commerce_products")), v.null()),
  ),
  excludedCategoryIds: v.optional(
    v.union(v.array(v.id("commerce_product_categories")), v.null()),
  ),
  tiers: v.optional(v.union(v.array(discountTierValidator), v.null())),
  maxDiscountAmount: v.optional(v.union(v.number(), v.null())),
  usageLimit: v.optional(v.union(v.number(), v.null())),
  startsAt: v.optional(v.union(v.number(), v.null())),
  endsAt: v.optional(v.union(v.number(), v.null())),
};
