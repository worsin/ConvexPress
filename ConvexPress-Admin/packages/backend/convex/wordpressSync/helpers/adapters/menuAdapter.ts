// @ts-nocheck
/**
 * Menu Adapter
 *
 * Wraps the WordPress REST API v2 menus and menu-items endpoints.
 * Requires WordPress 5.9+ (navigation block support) or the
 * WP REST API Menus plugin.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type { WPMenu, WPMenuItem } from "../wpClient";

// ─── Menu Adapter ─────────────────────────────────────────────────────────

export class MenuAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  // ─── Probe ──────────────────────────────────────────────────────────────

  /**
   * Probe menus API availability by attempting to fetch a single menu.
   * Returns not reachable if the menus endpoint doesn't exist (404).
   */
  async probe(): Promise<ProbeResult> {
    try {
      await this.fetchMenus(1, 1);
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

  // ─── Menus ──────────────────────────────────────────────────────────────

  /**
   * Fetch registered navigation menus.
   */
  async fetchMenus(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPMenu>> {
    return this.fetchPaginated<WPMenu>("wp/v2/menus", page, perPage);
  }

  // ─── Menu Items ─────────────────────────────────────────────────────────

  /**
   * Fetch menu items for a specific menu, ordered by menu_order.
   */
  async fetchMenuItems(
    menuId: number,
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPMenuItem>> {
    return this.fetchPaginated<WPMenuItem>("wp/v2/menu-items", page, perPage, {
      menus: menuId,
      orderby: "menu_order",
    });
  }
}
