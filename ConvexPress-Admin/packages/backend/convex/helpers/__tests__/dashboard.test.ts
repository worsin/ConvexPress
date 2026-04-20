/**
 * Dashboard System - Unit Tests for dashboard helpers.
 *
 * Tests pure aggregation logic used by the website dashboard.
 */

import { describe, expect, test } from "bun:test";
import { aggregateContentPerformance } from "../../dashboard/helpers";

describe("aggregateContentPerformance", () => {
  test("returns the top viewed posts in descending order", () => {
    expect(
      aggregateContentPerformance(
        [
          { _id: "post_a", title: "Alpha" },
          { _id: "post_b", title: "Bravo" },
          { _id: "post_c", title: "Charlie" },
        ],
        {
          post_a: 12,
          post_b: 42,
          post_c: 5,
        },
      ),
    ).toEqual([
      { _id: "post_b", title: "Bravo", views: 42 },
      { _id: "post_a", title: "Alpha", views: 12 },
      { _id: "post_c", title: "Charlie", views: 5 },
    ]);
  });

  test("drops posts with no recorded views", () => {
    expect(
      aggregateContentPerformance(
        [
          { _id: "post_a", title: "Alpha" },
          { _id: "post_b", title: "Bravo" },
        ],
        {
          post_b: 3,
        },
      ),
    ).toEqual([{ _id: "post_b", title: "Bravo", views: 3 }]);
  });

  test("uses title as a stable tie-breaker and respects the limit", () => {
    expect(
      aggregateContentPerformance(
        [
          { _id: "post_b", title: "Bravo" },
          { _id: "post_a", title: "Alpha" },
          { _id: "post_c", title: "Charlie" },
        ],
        {
          post_a: 10,
          post_b: 10,
          post_c: 1,
        },
        2,
      ),
    ).toEqual([
      { _id: "post_a", title: "Alpha", views: 10 },
      { _id: "post_b", title: "Bravo", views: 10 },
    ]);
  });
});
