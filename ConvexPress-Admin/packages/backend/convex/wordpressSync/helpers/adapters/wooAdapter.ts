// @ts-nocheck
/**
 * WooCommerce REST API Adapter
 *
 * Wraps the WooCommerce REST API v3 endpoints with the structured adapter
 * interface. Provides typed, paginated fetching for products, variations,
 * categories, customers, orders, refunds, coupons, and reviews.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type {
  WooProduct,
  WooProductVariation,
  WooProductCategory,
  WooCustomer,
  WooOrder,
  WooOrderRefund,
  WooCoupon,
  WooProductReview,
} from "../wooClient";

// ─── Order Note Type ──────────────────────────────────────────────────────

export interface WooOrderNote {
  id: number;
  author: string;
  date_created: string;
  date_created_gmt: string;
  note: string;
  customer_note: boolean;
  added_by_user: boolean;
}

// ─── WooCommerce Adapter ──────────────────────────────────────────────────

export class WooAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  // ─── Probe ──────────────────────────────────────────────────────────────

  /**
   * Probe WooCommerce availability by attempting to fetch a single product.
   * If the WooCommerce REST API is not installed or credentials are invalid,
   * this will fail gracefully.
   */
  async probe(): Promise<ProbeResult> {
    try {
      await this.fetchProducts(1, 1);
      return {
        reachable: true,
        authenticated: true,
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        return {
          reachable: error.category !== "network",
          authenticated: error.category !== "auth" && error.category !== "capability",
          error: error.toNormalized(),
        };
      }

      return {
        reachable: false,
        authenticated: false,
        error: {
          category: "unknown",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: false,
        },
      };
    }
  }

  // ─── Products ───────────────────────────────────────────────────────────

  /**
   * Fetch products across all statuses.
   */
  async fetchProducts(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooProduct>> {
    return this.fetchWooPaginated<WooProduct>("wc/v3/products", page, perPage, {
      status: "any",
    });
  }

  // ─── Product Variations ─────────────────────────────────────────────────

  /**
   * Fetch variations for a specific product.
   */
  async fetchProductVariations(
    productId: number,
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooProductVariation>> {
    return this.fetchWooPaginated<WooProductVariation>(
      `wc/v3/products/${productId}/variations`,
      page,
      perPage,
    );
  }

  // ─── Product Categories ─────────────────────────────────────────────────

  /**
   * Fetch all product categories including empty ones.
   */
  async fetchProductCategories(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooProductCategory>> {
    return this.fetchWooPaginated<WooProductCategory>(
      "wc/v3/products/categories",
      page,
      perPage,
      { hide_empty: false },
    );
  }

  // ─── Customers ──────────────────────────────────────────────────────────

  /**
   * Fetch WooCommerce customers.
   */
  async fetchCustomers(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooCustomer>> {
    return this.fetchWooPaginated<WooCustomer>(
      "wc/v3/customers",
      page,
      perPage,
    );
  }

  // ─── Orders ─────────────────────────────────────────────────────────────

  /**
   * Fetch orders across all statuses.
   */
  async fetchOrders(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooOrder>> {
    return this.fetchWooPaginated<WooOrder>("wc/v3/orders", page, perPage, {
      status: "any",
    });
  }

  // ─── Order Refunds ──────────────────────────────────────────────────────

  /**
   * Fetch refunds for a specific order.
   */
  async fetchOrderRefunds(
    orderId: number,
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooOrderRefund>> {
    return this.fetchWooPaginated<WooOrderRefund>(
      `wc/v3/orders/${orderId}/refunds`,
      page,
      perPage,
    );
  }

  // ─── Coupons ────────────────────────────────────────────────────────────

  /**
   * Fetch all coupons.
   */
  async fetchCoupons(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooCoupon>> {
    return this.fetchWooPaginated<WooCoupon>(
      "wc/v3/coupons",
      page,
      perPage,
    );
  }

  // ─── Reviews ────────────────────────────────────────────────────────────

  /**
   * Fetch product reviews across all statuses.
   */
  async fetchReviews(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WooProductReview>> {
    return this.fetchWooPaginated<WooProductReview>(
      "wc/v3/products/reviews",
      page,
      perPage,
      { status: "all" },
    );
  }

  // ─── Order Notes ────────────────────────────────────────────────────────

  /**
   * Fetch notes for a specific order. Returns a flat array (not paginated).
   * Catches errors and returns an empty array if the endpoint is unavailable.
   */
  async fetchOrderNotes(orderId: number): Promise<WooOrderNote[]> {
    try {
      const url = this.buildWooUrl(`wc/v3/orders/${orderId}/notes`);
      const headers = this.wooAuthHeaders();
      const response = await this.fetchWithRetry(url, headers);
      return (await response.json()) as WooOrderNote[];
    } catch {
      return [];
    }
  }
}
