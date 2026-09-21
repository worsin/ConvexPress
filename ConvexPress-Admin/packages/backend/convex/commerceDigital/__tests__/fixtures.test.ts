import { convexTest } from "convex-test";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceDigital/queries.ts": () => import("../queries"),
  "./convex/commerceDigital/mutations.ts": () => import("../mutations"),
  "./convex/commerceDigital/delivery.ts": () => import("../delivery"),
  "./convex/commerceDigital/library.ts": () => import("../library"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
};

export async function digitalFixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Digital manager", slug: "digital-manager", description: "Test", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const operator = await ctx.db.insert("users", { authSource: "local", email: "digital-manager@example.invalid", emailVerified: true, status: "active", roleId: role, createdAt: 1, updatedAt: 1 });
    const customer = await ctx.db.insert("users", { authSource: "clerk", clerkUserId: "digital-customer", email: "digital-customer@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, commerceDigitalEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: operator });
    const product = await ctx.db.insert("commerce_products", { title: "Private software", slug: "private-software", status: "private", productType: "simple", authorId: operator, basePrice: { amount: 1000, currencyCode: "USD" }, categoryIds: [], galleryMediaIds: [], trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: true, createdAt: 1, updatedAt: 1 });
    const storageId = await ctx.storage.store(new Blob(["private software fixture"]));
    const file = await ctx.db.insert("commerce_digital_files", { productId: product, storageId, name: "Installer", fileName: "installer.zip", fileSize: 24, mimeType: "application/zip", version: "1", isLatest: true, isPreviewable: false, requiresLicense: true, sortOrder: 0, createdAt: 1, updatedAt: 1 });
    const order = await ctx.db.insert("commerce_orders", { orderNumber: "DIGITAL-TEST", trackingToken: "PRIVATE_TRACKING", userId: customer, status: "completed", currencyCode: "USD", email: "digital-customer@example.invalid", billingAddress: { line1: "Fixture", city: "Fixture", postalCode: "00000", countryCode: "US" }, subtotalAmount: 1000, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 1000, paymentStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: 1, updatedAt: 1 });
    const item = await ctx.db.insert("commerce_order_items", { orderId: order, productId: product, productTitle: "Software", quantity: 1, unitPriceAmount: 1000, lineSubtotalAmount: 1000, lineTotalAmount: 1000, createdAt: 1 });
    const token = await ctx.db.insert("commerce_download_tokens", { digitalFileId: file, orderId: order, orderItemId: item, userId: customer, token: "PRIVATE_DOWNLOAD_TOKEN", downloadCount: 0, isActive: true, createdAt: 1 });
    const key = await ctx.db.insert("commerce_license_keys", { productId: product, orderId: order, userId: customer, licenseKey: "PRIVATE_LICENSE_KEY", keyType: "single", status: "assigned", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("commerce_license_keys", { productId: product, licenseKey: "PRIVATE_INVENTORY_KEY", keyType: "single", status: "available", createdAt: 1, updatedAt: 1 });
    return { role, operator, customer, plugins, product, storageId, file, order, item, token, key };
  });
  return {
    t, ids,
    operator: t.withIdentity({ subject: ids.operator, tokenIdentifier: `https://convexpress-admin.local|${ids.operator}` }),
    customer: t.withIdentity({ subject: "digital-customer", tokenIdentifier: "https://clerk.example|digital-customer" }),
  };
}
