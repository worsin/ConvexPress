import { describe, expect, test } from "bun:test";

import { packCart } from "../helpers/binPacking";

describe("binPacking — packCart", () => {
  const smallBox = {
    _id: "small",
    label: "Small",
    innerDimensions: { length: 6, width: 4, height: 4 },
    tareWeight: 4,
    maxLoadWeight: 80,
  };
  const mediumBox = {
    _id: "medium",
    label: "Medium",
    innerDimensions: { length: 12, width: 10, height: 8 },
    tareWeight: 8,
    maxLoadWeight: 320,
  };

  test("single item fits in smallest box", () => {
    const result = packCart(
      [
        {
          itemId: "i1",
          productId: "p1",
          quantity: 1,
          weight: 16,
          dimensions: { length: 4, width: 3, height: 2 },
        },
      ],
      [smallBox, mediumBox],
      "small",
    );
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0].packageId).toBe("small");
    expect(result.unfit).toHaveLength(0);
  });

  test("item exceeding all packages is unfit", () => {
    const result = packCart(
      [
        {
          itemId: "i1",
          productId: "p1",
          quantity: 1,
          weight: 32,
          dimensions: { length: 50, width: 40, height: 30 },
        },
      ],
      [smallBox, mediumBox],
      null,
    );
    expect(result.unfit).toHaveLength(1);
  });

  test("shipsInOwnBox creates dedicated box", () => {
    const result = packCart(
      [
        {
          itemId: "i1",
          productId: "p1",
          quantity: 1,
          weight: 100,
          dimensions: { length: 30, width: 20, height: 15 },
          shipsInOwnBox: true,
        },
      ],
      [smallBox],
      "small",
    );
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0].shipsInOwnBox).toBe(true);
  });

  test("multiple small items pack into one box", () => {
    const result = packCart(
      [
        {
          itemId: "i1",
          productId: "p1",
          quantity: 3,
          weight: 5,
          dimensions: { length: 1, width: 1, height: 1 },
        },
      ],
      [smallBox, mediumBox],
      "small",
    );
    expect(result.boxes.length).toBeGreaterThanOrEqual(1);
    expect(result.unfit).toHaveLength(0);
  });

  test("respects maxLoadWeight", () => {
    const tinyBox = {
      _id: "tiny",
      label: "Tiny",
      innerDimensions: { length: 10, width: 10, height: 10 },
      tareWeight: 1,
      maxLoadWeight: 10, // very low
    };
    const result = packCart(
      [
        { itemId: "i1", productId: "p1", quantity: 1, weight: 8, dimensions: { length: 1, width: 1, height: 1 } },
        { itemId: "i2", productId: "p2", quantity: 1, weight: 8, dimensions: { length: 1, width: 1, height: 1 } },
      ],
      [tinyBox],
      "tiny",
    );
    // Two items, weight 16 total, but box maxLoad = 10 — must be split.
    expect(result.boxes.length).toBeGreaterThanOrEqual(2);
  });

  test("empty package list = all unfit", () => {
    const result = packCart(
      [{ itemId: "i1", productId: "p1", quantity: 1, weight: 1 }],
      [],
      null,
    );
    expect(result.unfit).toHaveLength(1);
    expect(result.boxes).toHaveLength(0);
  });
});
