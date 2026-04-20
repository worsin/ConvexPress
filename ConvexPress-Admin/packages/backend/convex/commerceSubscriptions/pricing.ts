type CommerceMoney =
  | {
      amount?: number;
      currencyCode?: string;
    }
  | number
  | null
  | undefined;

type ProductLike = {
  basePrice?: CommerceMoney;
  salePrice?: CommerceMoney;
  salePriceFrom?: number;
  salePriceTo?: number;
  currencyCode?: string;
};

type VariantLike = {
  price?: CommerceMoney;
  salePrice?: CommerceMoney;
  salePriceFrom?: number;
  salePriceTo?: number;
  currencyCode?: string;
};

type ProductOverrideLike =
  | {
      isSubscriptionEnabled?: boolean;
      overridePriceAmount?: number;
      overrideCurrencyCode?: string;
    }
  | null
  | undefined;

export function resolveMoneyAmount(money: CommerceMoney, fallback = 0): number {
  if (typeof money === "number" && Number.isFinite(money)) return money;
  if (
    money &&
    typeof money === "object" &&
    typeof money.amount === "number" &&
    Number.isFinite(money.amount)
  ) {
    return money.amount;
  }
  return fallback;
}

export function resolveMoneyCurrency(
  money: CommerceMoney,
  fallback = "USD",
): string {
  if (
    money &&
    typeof money === "object" &&
    typeof money.currencyCode === "string" &&
    money.currencyCode.trim().length > 0
  ) {
    return money.currencyCode;
  }
  return fallback;
}

export function hasExplicitSubscriptionEnablement(
  override: ProductOverrideLike,
): boolean {
  return override?.isSubscriptionEnabled === true;
}

function isSaleActive(args: {
  salePrice?: CommerceMoney;
  salePriceFrom?: number;
  salePriceTo?: number;
  now?: number;
}): boolean {
  if (!Number.isFinite(resolveMoneyAmount(args.salePrice, Number.NaN))) {
    return false;
  }

  const now = args.now ?? Date.now();
  if (typeof args.salePriceFrom === "number" && now < args.salePriceFrom) {
    return false;
  }
  if (typeof args.salePriceTo === "number" && now > args.salePriceTo) {
    return false;
  }

  return true;
}

function resolveCatalogMoney(args: {
  basePrice?: CommerceMoney;
  salePrice?: CommerceMoney;
  salePriceFrom?: number;
  salePriceTo?: number;
  currencyCode?: string;
  now?: number;
}): { amount: number; currencyCode: string } {
  const money = isSaleActive(args) ? args.salePrice : args.basePrice;
  return {
    amount: resolveMoneyAmount(money, 0),
    currencyCode: resolveMoneyCurrency(
      money,
      resolveMoneyCurrency(args.basePrice, args.currencyCode ?? "USD"),
    ),
  };
}

export function resolveSubscriptionUnitAmount(args: {
  product: ProductLike;
  variant?: VariantLike | null;
  override?: ProductOverrideLike;
  now?: number;
}): number {
  if (typeof args.override?.overridePriceAmount === "number") {
    return Math.max(0, args.override.overridePriceAmount);
  }

  if (args.variant) {
    return resolveCatalogMoney({
      basePrice: args.variant.price,
      salePrice: args.variant.salePrice,
      salePriceFrom: args.variant.salePriceFrom,
      salePriceTo: args.variant.salePriceTo,
      currencyCode: args.variant.currencyCode,
      now: args.now,
    }).amount;
  }

  return resolveCatalogMoney({
    basePrice: args.product.basePrice,
    salePrice: args.product.salePrice,
    salePriceFrom: args.product.salePriceFrom,
    salePriceTo: args.product.salePriceTo,
    currencyCode: args.product.currencyCode,
    now: args.now,
  }).amount;
}

export function resolveSubscriptionCurrencyCode(args: {
  product: ProductLike;
  variant?: VariantLike | null;
  override?: ProductOverrideLike;
  now?: number;
}): string {
  if (args.override?.overrideCurrencyCode) {
    return args.override.overrideCurrencyCode;
  }

  if (args.variant) {
    return resolveCatalogMoney({
      basePrice: args.variant.price,
      salePrice: args.variant.salePrice,
      salePriceFrom: args.variant.salePriceFrom,
      salePriceTo: args.variant.salePriceTo,
      currencyCode: args.variant.currencyCode,
      now: args.now,
    }).currencyCode;
  }

  return resolveCatalogMoney({
    basePrice: args.product.basePrice,
    salePrice: args.product.salePrice,
    salePriceFrom: args.product.salePriceFrom,
    salePriceTo: args.product.salePriceTo,
    currencyCode: args.product.currencyCode,
    now: args.now,
  }).currencyCode;
}

export function buildSubscriptionPricingSnapshot(args: {
  product: ProductLike;
  variant?: VariantLike | null;
  override?: ProductOverrideLike;
  quantity: number;
  now?: number;
}) {
  const unitAmount = resolveSubscriptionUnitAmount(args);
  const currencyCode = resolveSubscriptionCurrencyCode(args);
  const quantity = Math.max(1, Math.trunc(args.quantity));

  return {
    unitAmount,
    quantity,
    recurringAmount: unitAmount * quantity,
    currencyCode,
    source: args.override?.overridePriceAmount !== undefined ? "override" : "catalog",
  };
}
