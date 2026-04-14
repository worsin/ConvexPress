// @ts-nocheck
/**
 * WooCommerce REST API Client
 *
 * Normalized fetchers for WooCommerce catalog data using the same
 * Basic Auth credentials as the WordPress sync client.
 */

import {
  fetchWPJsonEndpoint,
  type WPClientConfig,
  type WPFetchResult,
} from "./wpClient";

export interface WooProductCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  count: number;
  image?: {
    id?: number;
    src?: string;
    alt?: string;
  } | null;
}

export interface WooProductAttribute {
  id: number;
  name: string;
  slug?: string;
  position?: number;
  visible?: boolean;
  variation?: boolean;
  options?: string[];
  option?: string;
}

export interface WooProductImage {
  id: number;
  src: string;
  alt?: string;
  name?: string;
  position?: number;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  description?: string;
  short_description?: string;
  sku?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  backorders?: "no" | "notify" | "yes";
  virtual?: boolean;
  downloadable?: boolean;
  weight?: string;
  date_created?: string;
  date_modified?: string;
  date_on_sale_from?: string | null;
  date_on_sale_to?: string | null;
  categories?: Array<{ id: number; name?: string; slug?: string }>;
  images?: WooProductImage[];
  attributes?: WooProductAttribute[];
  variations?: number[];
  meta_data?: Array<{ id: number; key: string; value: unknown }>;
  dimensions?: { length?: string; width?: string; height?: string };
  upsell_ids?: number[];
  cross_sell_ids?: number[];
  stock_status?: "instock" | "outofstock" | "onbackorder";
  external_url?: string;
  button_text?: string;
  grouped_products?: number[];
  total_sales?: number;
  purchase_note?: string;
  tax_class?: string;
  tax_status?: string;
}

export interface WooProductVariation {
  id: number;
  sku?: string;
  description?: string;
  image?: WooProductImage | null;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  status?: string;
  date_created?: string;
  date_modified?: string;
  attributes?: WooProductAttribute[];
}

export interface WooAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
}

export interface WooCustomer {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  role?: string;
  avatar_url?: string;
  is_paying_customer?: boolean;
  billing?: WooAddress;
  shipping?: WooAddress;
  date_created?: string;
  date_modified?: string;
}

export interface WooOrderLineItem {
  id: number;
  product_id: number;
  variation_id: number;
  name: string;
  sku?: string;
  quantity: number;
  subtotal?: string;
  total?: string;
  price?: number;
  meta_data?: Array<{ id: number; key: string; value: unknown }>;
}

export interface WooOrder {
  id: number;
  parent_id?: number;
  number?: string;
  order_key?: string;
  status: string;
  currency?: string;
  date_created?: string;
  date_modified?: string;
  date_paid?: string | null;
  billing?: WooAddress;
  shipping?: WooAddress;
  customer_id?: number;
  customer_note?: string;
  payment_method?: string;
  payment_method_title?: string;
  transaction_id?: string;
  shipping_lines?: Array<{ method_id?: string; method_title?: string; total?: string }>;
  coupon_lines?: Array<{ code?: string; discount?: string }>;
  fee_lines?: Array<{ name?: string; total?: string }>;
  line_items?: WooOrderLineItem[];
  shipping_total?: string;
  discount_total?: string;
  discount_tax?: string;
  cart_tax?: string;
  total?: string;
  total_tax?: string;
 }

export interface WooCoupon {
  id: number;
  code: string;
  description?: string;
  discount_type?: "fixed_cart" | "percent" | "fixed_product" | string;
  amount?: string;
  usage_count?: number;
  usage_limit?: number | null;
  date_created?: string;
  date_modified?: string;
  date_expires?: string | null;
  usage_limit_per_user?: number | null;
  limit_usage_to_x_items?: number | null;
  product_ids?: number[];
  excluded_product_ids?: number[];
  product_categories?: number[];
  excluded_product_categories?: number[];
  minimum_amount?: string;
  maximum_amount?: string;
  free_shipping?: boolean;
  individual_use?: boolean;
  exclude_sale_items?: boolean;
  email_restrictions?: string[];
  meta_data?: Array<{ id: number; key: string; value: unknown }>;
}

export interface WooProductReview {
  id: number;
  product_id: number;
  reviewer?: string;
  reviewer_email?: string;
  review?: string;
  rating?: number;
  verified?: boolean;
  status?: "approved" | "hold" | "spam" | "trash" | string;
  reviewer_avatar_urls?: Record<string, string>;
  date_created?: string;
}

export interface WooOrderRefund {
  id: number;
  amount?: string;
  reason?: string;
  refunded_by?: number;
  refunded_payment?: boolean;
  date_created?: string;
  date_created_gmt?: string;
  line_items?: Array<Record<string, unknown>>;
}

export function fetchWooProductCategories(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooProductCategory[]>> {
  return fetchWPJsonEndpoint<WooProductCategory[]>(config, "/wc/v3/products/categories", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
    hide_empty: false,
  });
}

export function fetchWooProducts(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooProduct[]>> {
  return fetchWPJsonEndpoint<WooProduct[]>(config, "/wc/v3/products", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
    status: "any",
  });
}

export function fetchWooProductVariations(
  config: WPClientConfig,
  productId: number,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooProductVariation[]>> {
  return fetchWPJsonEndpoint<WooProductVariation[]>(
    config,
    `/wc/v3/products/${productId}/variations`,
    {
      page,
      per_page: perPage,
      orderby: "id",
      order: "asc",
      status: "any",
    }
  );
}

export function fetchWooCustomers(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooCustomer[]>> {
  return fetchWPJsonEndpoint<WooCustomer[]>(config, "/wc/v3/customers", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
  });
}

export function fetchWooOrders(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooOrder[]>> {
  return fetchWPJsonEndpoint<WooOrder[]>(config, "/wc/v3/orders", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
    status: "any",
  });
}

export function fetchWooOrderRefunds(
  config: WPClientConfig,
  orderId: number,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooOrderRefund[]>> {
  return fetchWPJsonEndpoint<WooOrderRefund[]>(
    config,
    `/wc/v3/orders/${orderId}/refunds`,
    {
      page,
      per_page: perPage,
      orderby: "id",
      order: "asc",
    }
  );
}

export function fetchWooCoupons(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooCoupon[]>> {
  return fetchWPJsonEndpoint<WooCoupon[]>(config, "/wc/v3/coupons", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
  });
}

export function fetchWooProductReviews(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WooProductReview[]>> {
  return fetchWPJsonEndpoint<WooProductReview[]>(config, "/wc/v3/products/reviews", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
    status: "all",
  });
}
