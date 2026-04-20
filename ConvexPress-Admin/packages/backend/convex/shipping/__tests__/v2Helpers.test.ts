import { describe, expect, test } from "bun:test";

import { computeAddressFingerprint } from "../helpers/addressFingerprint";
import { haversineDistanceKm, kmToMiles, milesToKm } from "../helpers/distance";
import { resolveShippingClassId, slugifyClassName } from "../helpers/classResolution";
import {
  normalizeShipStationStatus,
  normalizeFedexStatus,
  normalizeUpsStatus,
  normalizeUspsStatus,
} from "../tracking/statusNormalization";

describe("computeAddressFingerprint", () => {
  test("identical inputs produce identical hashes", () => {
    const addr = {
      line1: "123 Main St",
      city: "NYC",
      state: "NY",
      postalCode: "10001",
      countryCode: "US",
    };
    expect(computeAddressFingerprint(addr)).toBe(computeAddressFingerprint(addr));
  });

  test("different city changes the fingerprint", () => {
    const a = { line1: "1 St", city: "A", postalCode: "1", countryCode: "US" };
    const b = { line1: "1 St", city: "B", postalCode: "1", countryCode: "US" };
    expect(computeAddressFingerprint(a)).not.toBe(computeAddressFingerprint(b));
  });

  test("case + whitespace normalization", () => {
    const a = { line1: "  123 main st  ", city: "nyc", postalCode: "10001", countryCode: "us" };
    const b = { line1: "123 MAIN ST", city: "NYC", postalCode: "10001", countryCode: "US" };
    expect(computeAddressFingerprint(a)).toBe(computeAddressFingerprint(b));
  });
});

describe("distance helpers", () => {
  test("haversine NYC → LA approx 3935km", () => {
    const nyc = { lat: 40.7128, lng: -74.006 };
    const la = { lat: 34.0522, lng: -118.2437 };
    const d = haversineDistanceKm(nyc, la);
    expect(d).toBeGreaterThan(3900);
    expect(d).toBeLessThan(3970);
  });

  test("zero distance for same point", () => {
    expect(haversineDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });

  test("km/mile round-trip", () => {
    expect(milesToKm(kmToMiles(100))).toBeCloseTo(100, 4);
  });
});

describe("resolveShippingClassId", () => {
  test("variant explicit class wins", () => {
    expect(
      resolveShippingClassId(
        { shippingClassId: "p1" },
        { shippingClassId: "v1" },
      ),
    ).toBe("v1");
  });

  test("variant inherits from product when undefined", () => {
    expect(
      resolveShippingClassId({ shippingClassId: "p1" }, { shippingClassId: undefined }),
    ).toBe("p1");
  });

  test("variant override-none returns null even with product class", () => {
    expect(
      resolveShippingClassId(
        { shippingClassId: "p1" },
        { shippingClassOverrideNone: true },
      ),
    ).toBeNull();
  });

  test("no class anywhere returns null", () => {
    expect(resolveShippingClassId(null, null)).toBeNull();
  });
});

describe("slugifyClassName", () => {
  test("fragile → fragile", () => {
    expect(slugifyClassName("Fragile")).toBe("fragile");
    expect(slugifyClassName("Heavy Items")).toBe("heavy-items");
    expect(slugifyClassName("HAZMAT!")).toBe("hazmat");
  });
});

describe("status normalization", () => {
  test("ShipStation 2-letter codes (audit fix)", () => {
    expect(normalizeShipStationStatus("DE")).toBe("delivered");
    expect(normalizeShipStationStatus("IT")).toBe("in_transit");
    expect(normalizeShipStationStatus("AC")).toBe("picked_up");
    expect(normalizeShipStationStatus("AT")).toBe("exception");
    expect(normalizeShipStationStatus("EX")).toBe("exception");
    expect(normalizeShipStationStatus("NY")).toBe("pending");
  });

  test("FedEx 2-letter codes", () => {
    expect(normalizeFedexStatus("DL")).toBe("delivered");
    expect(normalizeFedexStatus("OD")).toBe("out_for_delivery");
    expect(normalizeFedexStatus("IT")).toBe("in_transit");
    expect(normalizeFedexStatus("PU")).toBe("picked_up");
    expect(normalizeFedexStatus("CA")).toBe("exception");
  });

  test("UPS string descriptions", () => {
    expect(normalizeUpsStatus("Delivered")).toBe("delivered");
    expect(normalizeUpsStatus("Out For Delivery")).toBe("out_for_delivery");
    expect(normalizeUpsStatus("Picked Up")).toBe("picked_up");
    expect(normalizeUpsStatus("Exception encountered")).toBe("exception");
    expect(normalizeUpsStatus("Returned to Sender")).toBe("returned");
  });

  test("USPS event types", () => {
    expect(normalizeUspsStatus("DELIVERED")).toBe("delivered");
    expect(normalizeUspsStatus("OUT FOR DELIVERY")).toBe("out_for_delivery");
    expect(normalizeUspsStatus("Acceptance")).toBe("picked_up");
    expect(normalizeUspsStatus("RETURN TO SENDER")).toBe("returned");
  });
});
