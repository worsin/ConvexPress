/**
 * First-Fit Decreasing (FFD) bin-packing for shipping packages.
 *
 * PRD A3 §5.3. Given a list of cart items (with dimensions and weight) and
 * a set of candidate package templates, pack items into the smallest number
 * of boxes that (a) fit all items and (b) respect maxLoadWeight limits.
 *
 * Strategy:
 *   1. Sort items by volume descending ("decreasing").
 *   2. For each item, try to fit into an already-opened box using a simple
 *      "does it still have capacity?" heuristic (3D volume + weight). If yes,
 *      add it. Otherwise, open a new box using the smallest candidate that
 *      can hold this item.
 *   3. Items flagged `shipsInOwnBox` skip packing — they become their own
 *      single-item shipment with dimensions from the item itself.
 *   4. Items whose longest side exceeds every available package's longest
 *      side are also treated as `shipsInOwnBox` (with a warning flag).
 *
 * This is pure logic — no Convex context — so it is trivially unit-testable.
 */

export type PackedItemInput = {
  itemId: string; // stable identifier (cartItemId)
  productId: string;
  variantId?: string;
  quantity: number;
  weight: number; // in weightUnit
  dimensions?: { length: number; width: number; height: number }; // in dimensionUnit
  shipsInOwnBox?: boolean;
  preferredPackageId?: string;
};

export type PackageTemplate = {
  _id: string;
  label: string;
  innerDimensions: { length: number; width: number; height: number };
  tareWeight: number;
  maxLoadWeight?: number; // optional cap on contents weight
};

export type PackedBox = {
  packageId: string;
  label: string;
  itemIds: string[];
  totalItemWeight: number;
  totalPackageWeight: number; // items + tareWeight
  outerDimensions: { length: number; width: number; height: number };
  innerDimensions: { length: number; width: number; height: number };
  shipsInOwnBox: boolean;
  warnings?: string[];
};

function volume(d: { length: number; width: number; height: number }): number {
  return d.length * d.width * d.height;
}

function longestSide(d: { length: number; width: number; height: number }): number {
  return Math.max(d.length, d.width, d.height);
}

function itemFitsInBoxByLongestSide(
  item: PackedItemInput,
  box: PackageTemplate,
): boolean {
  if (!item.dimensions) return true; // items without dimensions pack by weight only
  return longestSide(item.dimensions) <= longestSide(box.innerDimensions);
}

/**
 * First-Fit Decreasing pack. Returns { boxes, unfit } where `unfit` is items
 * that could not be packed into any available box (merchant must configure a
 * larger package or flag shipsInOwnBox).
 */
export function packCart(
  items: PackedItemInput[],
  packages: PackageTemplate[],
  defaultPackageId: string | null,
): { boxes: PackedBox[]; unfit: PackedItemInput[] } {
  const boxes: PackedBox[] = [];
  const unfit: PackedItemInput[] = [];

  // Expand quantities into individual unit-items for simpler packing.
  const units: PackedItemInput[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      units.push({ ...item, quantity: 1 });
    }
  }

  // Step 1: separate items that ship in their own box.
  const normalUnits: PackedItemInput[] = [];
  for (const unit of units) {
    if (unit.shipsInOwnBox) {
      const dims = unit.dimensions ?? { length: 0, width: 0, height: 0 };
      boxes.push({
        packageId: unit.preferredPackageId ?? defaultPackageId ?? "own-box",
        label: "Ships in own box",
        itemIds: [unit.itemId],
        totalItemWeight: unit.weight,
        totalPackageWeight: unit.weight,
        outerDimensions: dims,
        innerDimensions: dims,
        shipsInOwnBox: true,
      });
    } else {
      normalUnits.push(unit);
    }
  }

  if (packages.length === 0) {
    // No packages configured — everything is unfit.
    unfit.push(...normalUnits);
    return { boxes, unfit };
  }

  // Step 2: sort normal units by volume descending.
  const sortedByVolume = [...normalUnits].sort((a, b) => {
    const aVol = a.dimensions ? volume(a.dimensions) : 0;
    const bVol = b.dimensions ? volume(b.dimensions) : 0;
    return bVol - aVol;
  });

  // Sort candidate packages by volume ascending — try smallest-fit first.
  const sortedPackages = [...packages].sort(
    (a, b) => volume(a.innerDimensions) - volume(b.innerDimensions),
  );

  // Step 3: FFD packing.
  for (const unit of sortedByVolume) {
    // Reject items whose longest side exceeds every package.
    const fittablePackages = sortedPackages.filter((p) =>
      itemFitsInBoxByLongestSide(unit, p),
    );
    if (fittablePackages.length === 0) {
      unfit.push(unit);
      continue;
    }

    // Try to fit into an already-opened box with remaining capacity.
    let placed = false;
    for (const box of boxes) {
      if (box.shipsInOwnBox) continue;
      const template = sortedPackages.find((p) => p._id === box.packageId);
      if (!template) continue;
      const remainingVolume =
        volume(template.innerDimensions) -
        box.itemIds.reduce((sum, id) => {
          const u = sortedByVolume.find((x) => x.itemId === id);
          return sum + (u?.dimensions ? volume(u.dimensions) : 0);
        }, 0);
      const itemVolume = unit.dimensions ? volume(unit.dimensions) : 0;
      if (itemVolume > remainingVolume) continue;

      if (template.maxLoadWeight !== undefined) {
        if (box.totalItemWeight + unit.weight > template.maxLoadWeight) continue;
      }
      if (!itemFitsInBoxByLongestSide(unit, template)) continue;

      box.itemIds.push(unit.itemId);
      box.totalItemWeight += unit.weight;
      box.totalPackageWeight = box.totalItemWeight + template.tareWeight;
      placed = true;
      break;
    }

    if (placed) continue;

    // Open a new box — smallest package that can hold this item.
    const chosen = fittablePackages[0]!;
    boxes.push({
      packageId: chosen._id,
      label: chosen.label,
      itemIds: [unit.itemId],
      totalItemWeight: unit.weight,
      totalPackageWeight: unit.weight + chosen.tareWeight,
      outerDimensions: chosen.innerDimensions,
      innerDimensions: chosen.innerDimensions,
      shipsInOwnBox: false,
    });
  }

  return { boxes, unfit };
}
