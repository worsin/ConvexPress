import { afterEach, describe, expect, test } from "bun:test";

import {
  fetchWPComments,
  fetchWPJsonEndpoint,
  fetchWPMedia,
  fetchWPPosts,
  fetchWPUserPasswordDigests,
  WPApiError,
} from "../helpers/wpClient";
import { fetchWooOrders } from "../helpers/wooClient";
import {
  normalizeImportConfig,
} from "../validators";
import {
  selectWpPostMetaForPreservation,
  shouldPreserveWpPostMetaKey,
} from "../fieldPolicy";
import { fullSiteFixture } from "./fixtures/fullSiteFixture";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("WordPress sync import config", () => {
  test("normalizes missing and invalid config fields to safe defaults", () => {
    const config = normalizeImportConfig({
      scope: {
        wpContent: false,
        wooOrders: true,
        wooCoupons: false,
      },
      behavior: {
        dryRun: true,
        importReviews: false,
        tombstoneMode: "delete_everything",
        destructiveDelete: true,
      },
      filters: {
        entityLimit: 25,
        dateRangeStart: 1_700_000_000_000,
        dateRangeEnd: "invalid",
      },
    });

    expect(config.scope.wpContent).toBe(false);
    expect(config.scope.media).toBe(true);
    expect(config.scope.wooOrders).toBe(true);
    expect(config.scope.wooCoupons).toBe(false);
    expect(config.behavior.dryRun).toBe(true);
    expect(config.behavior.updateExisting).toBe(true);
    expect(config.behavior.importReviews).toBe(false);
    expect(config.behavior.tombstoneMode).toBe("never");
    expect(config.behavior.destructiveDelete).toBe(true);
    expect(config.filters.entityLimit).toBe(25);
    expect(config.filters.dateRangeStart).toBe(1_700_000_000_000);
    expect(config.filters.dateRangeEnd).toBeUndefined();
  });
});

describe("WordPress sync field policy", () => {
  test("preserves render-critical and SEO meta while dropping editor noise", () => {
    expect(shouldPreserveWpPostMetaKey("_elementor_data")).toBe(true);
    expect(shouldPreserveWpPostMetaKey("_yoast_wpseo_title")).toBe(true);
    expect(shouldPreserveWpPostMetaKey("_edit_lock")).toBe(false);
    expect(shouldPreserveWpPostMetaKey("random_plugin_cache")).toBe(false);

    const selected = selectWpPostMetaForPreservation([
      { key: "_elementor_data", value: { widgets: 2 } },
      { key: "_wp_page_template", value: "full-width.php" },
      { key: "_edit_lock", value: "123" },
      { key: "random_plugin_cache", value: "ignore" },
    ]);

    expect(selected).toEqual([
      { key: "_elementor_data", value: "{\"widgets\":2}" },
      { key: "_wp_page_template", value: "full-width.php" },
    ]);
  });
});

describe("WordPress sync acceptance fixture", () => {
  test("covers the full WordPress and WooCommerce import surface", () => {
    expect(fullSiteFixture.users).toHaveLength(1);
    expect(fullSiteFixture.categories).toHaveLength(2);
    expect(fullSiteFixture.tags).toHaveLength(1);
    expect(fullSiteFixture.media).toHaveLength(1);
    expect(fullSiteFixture.posts).toHaveLength(1);
    expect(fullSiteFixture.pages).toHaveLength(1);
    expect(fullSiteFixture.comments).toHaveLength(1);
    expect(fullSiteFixture.menus).toHaveLength(1);
    expect(fullSiteFixture.menuItems).toHaveLength(1);
    expect(fullSiteFixture.products).toHaveLength(1);
    expect(fullSiteFixture.customers).toHaveLength(1);
    expect(fullSiteFixture.orders).toHaveLength(2);
    expect(fullSiteFixture.refunds).toHaveLength(1);
    expect(fullSiteFixture.coupons).toHaveLength(1);
    expect(fullSiteFixture.reviews).toHaveLength(1);
  });

  test("includes edge cases for media rewrites and guest order continuity", () => {
    const media = fullSiteFixture.media[0];
    expect(media.source_url).toContain("hero.jpg");
    expect(media.media_details.sizes.medium.source_url).toContain("300x200");
    expect(media.media_details.sizes.thumbnail.source_url).toContain("150x150");

    const guestOrder = fullSiteFixture.orders.find((order) => order.customer_id === 0);
    expect(guestOrder?.billing.email).toBeUndefined();
    expect(guestOrder?.line_items[0]?.product_id).toBe(91);

    const selectedMeta = selectWpPostMetaForPreservation(
      Object.entries(fullSiteFixture.posts[0].meta).map(([key, value]) => ({
        key,
        value,
      })),
    );
    expect(selectedMeta.map((item) => item.key)).toEqual([
      "_elementor_data",
      "_yoast_wpseo_title",
    ]);
  });
});

describe("WordPress sync client", () => {
  test("passes post status and date filters to WordPress content queries", async () => {
    let requestUrl = "";
    globalThis.fetch = (async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "X-WP-Total": "0",
          "X-WP-TotalPages": "1",
        },
      });
    }) as typeof fetch;

    await fetchWPPosts(
      {
        siteUrl: "https://example.test",
        username: "editor",
        applicationPassword: "app-pass",
      },
      2,
      50,
      {
        importDrafts: false,
        dateRangeStart: 1_700_000_000_000,
        dateRangeEnd: 1_700_086_400_000,
      },
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/wp-json/wp/v2/posts");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("status")).toBe("publish,private");
    expect(url.searchParams.get("after")).toBe("2023-11-14T22:13:20.000Z");
    expect(url.searchParams.get("before")).toBe("2023-11-15T22:13:20.000Z");
  });

  test("passes date filters to media, comments, and Woo order queries", async () => {
    const requestUrls: string[] = [];
    globalThis.fetch = (async (input) => {
      requestUrls.push(String(input));
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "X-WP-Total": "0",
          "X-WP-TotalPages": "1",
        },
      });
    }) as typeof fetch;

    const config = {
      siteUrl: "https://example.test",
      username: "editor",
      applicationPassword: "app-pass",
    };
    const options = {
      dateRangeStart: 1_700_000_000_000,
      dateRangeEnd: 1_700_086_400_000,
    };

    await fetchWPMedia(config, 1, 25, options);
    await fetchWPComments(config, 1, 25, options);
    await fetchWooOrders(config, 1, 25, {
      after: "2023-11-14T22:13:20.000Z",
      before: "2023-11-15T22:13:20.000Z",
    });

    const mediaUrl = new URL(requestUrls[0]!);
    const commentsUrl = new URL(requestUrls[1]!);
    const ordersUrl = new URL(requestUrls[2]!);
    expect(mediaUrl.pathname).toBe("/wp-json/wp/v2/media");
    expect(commentsUrl.pathname).toBe("/wp-json/wp/v2/comments");
    expect(ordersUrl.pathname).toBe("/wp-json/wc/v3/orders");
    for (const url of [mediaUrl, commentsUrl, ordersUrl]) {
      expect(url.searchParams.get("after")).toBe("2023-11-14T22:13:20.000Z");
      expect(url.searchParams.get("before")).toBe("2023-11-15T22:13:20.000Z");
    }
  });

  test("retries retryable WordPress API failures", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return new Response(
          JSON.stringify({ code: "server_error", message: "temporary" }),
          {
            status: 500,
            headers: { "Retry-After": "0" },
          },
        );
      }

      return new Response(JSON.stringify([{ id: 123 }]), {
        status: 200,
        headers: {
          "X-WP-Total": "1",
          "X-WP-TotalPages": "1",
        },
      });
    }) as typeof fetch;

    const result = await fetchWPJsonEndpoint<Array<{ id: number }>>(
      {
        siteUrl: "https://example.test",
        username: "editor",
        applicationPassword: "app-pass",
        retryCount: 1,
        timeoutMs: 100,
      },
      "/wp/v2/posts",
    );

    expect(calls).toBe(2);
    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe(123);
  });

  test("uses Woo consumer query auth for separate Woo credentials", async () => {
    let requestUrl = "";
    let requestHeaders: Record<string, string> | undefined;

    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "X-WP-Total": "0",
          "X-WP-TotalPages": "1",
        },
      });
    }) as typeof fetch;

    await fetchWPJsonEndpoint(
      {
        siteUrl: "https://example.test",
        username: "editor",
        applicationPassword: "app-pass",
        wooConsumerKey: "ck_test",
        wooConsumerSecret: "cs_test",
        wooAuthMode: "separate",
      },
      "/wc/v3/orders",
      { page: 1 },
    );

    expect(requestUrl).toContain("consumer_key=ck_test");
    expect(requestUrl).toContain("consumer_secret=cs_test");
    expect(requestHeaders?.Authorization).toBeUndefined();
  });

  test("fetches privileged user password digests with basic auth and migration secret", async () => {
    let requestUrl = "";
    let requestHeaders: Record<string, string> | undefined;

    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Record<string, string>;
      return new Response(
        JSON.stringify([
          {
            id: 7,
            user_login: "author",
            user_email: "author@example.test",
            user_registered: "2024-01-01 00:00:00",
            user_pass: "$P$B12345678abcdefghijklmnopqrstuv",
          },
        ]),
        {
          status: 200,
          headers: {
            "X-WP-Total": "1",
            "X-WP-TotalPages": "1",
          },
        },
      );
    }) as typeof fetch;

    const result = await fetchWPUserPasswordDigests(
      {
        siteUrl: "https://example.test",
        username: "editor",
        applicationPassword: "app-pass",
      },
      "/convexpress/v1/user-password-digests",
      "shared-secret",
      [7, 9],
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/wp-json/convexpress/v1/user-password-digests");
    expect(url.searchParams.get("include")).toBe("7,9");
    expect(requestHeaders?.Authorization?.startsWith("Basic ")).toBe(true);
    expect(requestHeaders?.["X-ConvexPress-Migration-Secret"]).toBe("shared-secret");
    expect(result.data[0]?.user_pass.startsWith("$P$")).toBe(true);
  });

  test("does not retry authentication failures", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({ code: "rest_forbidden", message: "forbidden" }),
        { status: 403 },
      );
    }) as typeof fetch;

    await expect(
      fetchWPJsonEndpoint(
        {
          siteUrl: "https://example.test",
          username: "editor",
          applicationPassword: "bad-pass",
          retryCount: 3,
        },
        "/wp/v2/posts",
      ),
    ).rejects.toBeInstanceOf(WPApiError);
    expect(calls).toBe(1);
  });
});
