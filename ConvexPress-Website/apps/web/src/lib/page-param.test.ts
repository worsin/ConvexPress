import { describe, expect, test } from "bun:test";

import { pageParam } from "./page-param";

describe("a listing's page number", () => {
  test("is kept past the first page, as a whole number", () => {
    expect(pageParam(2)).toEqual({ page: 2 });
    expect(pageParam("7")).toEqual({ page: 7 });
    expect(pageParam("3.9")).toEqual({ page: 3 });
  });

  test("is dropped for page one and anything unusable, so page one keeps its clean URL", () => {
    for (const value of [1, "1", 0, -4, "abc", "", null, undefined, Number.POSITIVE_INFINITY, {}]) expect(pageParam(value)).toEqual({});
  });
});
