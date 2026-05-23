import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  CreditCard,
  FileClock,
  Globe2,
  ListChecks,
  Plus,
  RefreshCw,
  Tags,
  Users,
  Workflow,
} from "lucide-react";

function money(amount?: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(Number(amount ?? 0) / 100);
}

function date(ts?: number) {
  return ts ? new Date(ts).toLocaleString() : "--";
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

function CheckboxInput({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-border"
      />
      {label}
    </label>
  );
}

function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

type DynamicPricingConditionDraft = {
  id: string;
  kind: string;
  operator: string;
  value: string;
};

function newDynamicPricingCondition(): DynamicPricingConditionDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `condition-${Date.now()}-${Math.random()}`,
    kind: "cart_subtotal",
    operator: "gte",
    value: "",
  };
}

function dynamicPricingFormDefaults() {
  return {
    name: "",
    description: "",
    status: "active",
    priority: "100",
    appliesTo: "all_products",
    productIds: "",
    categoryIds: "",
    excludedProductIds: "",
    excludedCategoryIds: "",
    conditionsMatch: "all",
    processingMode: "all_applicable",
    actionType: "percentage_discount",
    actionTarget: "matching_items",
    actionAmount: "",
    maxDiscountAmount: "",
    exclusive: false,
    stackWithCoupons: true,
    startsAt: "",
    endsAt: "",
    customerMessage: "",
  };
}

function Shell({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: any;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function RegionsPage() {
  const regions = useQuery((api as any).commerce.regions.list, {}) as any[] | undefined;
  const create = useMutation((api as any).commerce.regions.create);
  const [form, setForm] = useState({
    name: "",
    currencyCode: "USD",
    countryCodes: "US",
    automaticTaxes: true,
    isDefault: false,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create({
        name: form.name.trim(),
        currencyCode: form.currencyCode.trim().toUpperCase(),
        countryCodes: form.countryCodes
          .split(",")
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean),
        automaticTaxes: form.automaticTaxes,
        isDefault: form.isDefault,
      });
      setForm({ name: "", currencyCode: "USD", countryCodes: "US", automaticTaxes: true, isDefault: false });
      toast.success("Region created.");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to create region.");
    }
  }

  return (
    <Shell title="Regions" description="Country, currency, and tax behavior boundaries for checkout." icon={Globe2}>
      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5">
        <TextInput label="Name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} placeholder="United States" />
        <TextInput label="Currency" value={form.currencyCode} onChange={(currencyCode) => setForm((f) => ({ ...f, currencyCode }))} />
        <TextInput label="Countries" value={form.countryCodes} onChange={(countryCodes) => setForm((f) => ({ ...f, countryCodes }))} placeholder="US,CA" />
        <div className="grid content-end gap-2">
          <CheckboxInput label="Automatic taxes" checked={form.automaticTaxes} onChange={(automaticTaxes) => setForm((f) => ({ ...f, automaticTaxes }))} />
          <CheckboxInput label="Default" checked={form.isDefault} onChange={(isDefault) => setForm((f) => ({ ...f, isDefault }))} />
        </div>
        <button className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Add Region
        </button>
      </form>
      <div className="grid gap-3">
        {(regions ?? []).length === 0 ? <Empty label="No regions configured." /> : (regions ?? []).map((region) => (
          <div key={region._id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{region.name}</h2>
                <p className="text-sm text-muted-foreground">{region.countryCodes?.join(", ")} · {region.currencyCode}</p>
              </div>
              <div className="flex gap-2">
                {region.automaticTaxes ? <StatusPill>automatic tax</StatusPill> : null}
                {region.isDefault ? <StatusPill>default</StatusPill> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function SalesChannelsPage() {
  const channels = useQuery((api as any).commerce.salesChannels.list, { includeDisabled: true }) as any[] | undefined;
  const create = useMutation((api as any).commerce.salesChannels.create);
  const update = useMutation((api as any).commerce.salesChannels.update);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create({ name: name.trim(), description: description.trim() || undefined, isDisabled: false });
      setName("");
      setDescription("");
      toast.success("Sales channel created.");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to create sales channel.");
    }
  }

  return (
    <Shell title="Sales Channels" description="Storefronts, marketplaces, API channels, and admin selling contexts." icon={ListChecks}>
      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_2fr_auto]">
        <TextInput label="Name" value={name} onChange={setName} placeholder="Website" />
        <TextInput label="Description" value={description} onChange={setDescription} placeholder="Primary public storefront" />
        <button className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Add Channel</button>
      </form>
      <div className="grid gap-3">
        {(channels ?? []).length === 0 ? <Empty label="No sales channels configured." /> : (channels ?? []).map((channel) => (
          <div key={channel._id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{channel.name}</h2>
                <p className="text-sm text-muted-foreground">{channel.description ?? "No description"}</p>
              </div>
              <button
                onClick={() => void update({ channelId: channel._id, patch: { isDisabled: !channel.isDisabled } })}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                {channel.isDisabled ? "Enable" : "Disable"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function CustomerGroupsPage() {
  const groups = useQuery((api as any).commerce.customerGroups.list, {}) as any[] | undefined;
  const create = useMutation((api as any).commerce.customerGroups.create);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create({ name: name.trim(), description: description.trim() || undefined });
      setName("");
      setDescription("");
      toast.success("Customer group created.");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to create group.");
    }
  }

  return (
    <Shell title="Customer Groups" description="Segments for pricing, discounts, shipping, tax, and access rules." icon={Users}>
      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_2fr_auto]">
        <TextInput label="Name" value={name} onChange={setName} placeholder="Wholesale" />
        <TextInput label="Description" value={description} onChange={setDescription} placeholder="Wholesale buyers and negotiated accounts" />
        <button className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Add Group</button>
      </form>
      <div className="grid gap-3">
        {(groups ?? []).length === 0 ? <Empty label="No customer groups configured." /> : (groups ?? []).map((group) => (
          <div key={group._id} className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold">{group.name}</h2>
            <p className="text-sm text-muted-foreground">{group.description ?? "No description"}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function PricingPage() {
  const rules = useQuery((api as any).commerce.dynamicPricing.list, {}) as any[] | undefined;
  const create = useMutation((api as any).commerce.dynamicPricing.create);
  const update = useMutation((api as any).commerce.dynamicPricing.update);
  const setStatus = useMutation((api as any).commerce.dynamicPricing.setStatus);
  const remove = useMutation((api as any).commerce.dynamicPricing.remove);
  const [form, setForm] = useState(dynamicPricingFormDefaults);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<DynamicPricingConditionDraft[]>([
    newDynamicPricingCondition(),
  ]);
  const [previewForm, setPreviewForm] = useState({
    productId: "",
    categoryIds: "",
    quantity: "3",
    unitPrice: "100.00",
    customerGroupId: "",
    roleValue: "",
    email: "",
    totalOrders: "0",
    totalSpend: "0",
    couponPresent: false,
    shippingCountry: "US",
  });
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const preview = useQuery(
    (api as any).commerce.dynamicPricing.preview,
    previewEnabled
      ? {
          productId: previewForm.productId.trim() || undefined,
          categoryIds: parseIdList(previewForm.categoryIds),
          quantity: Math.max(1, Number.parseInt(previewForm.quantity || "1", 10)),
          unitPriceAmount: cents(previewForm.unitPrice),
          customerGroupId: previewForm.customerGroupId.trim() || undefined,
          roleValue: previewForm.roleValue.trim() || undefined,
          email: previewForm.email.trim() || undefined,
          totalOrders: Number(previewForm.totalOrders || "0"),
          totalSpentAmount: cents(previewForm.totalSpend),
          couponPresent: previewForm.couponPresent,
          shippingCountry: previewForm.shippingCountry.trim() || undefined,
        }
      : "skip",
  ) as any | undefined;

  function parseIdList(value: string) {
    return value.split(",").map((id) => id.trim()).filter(Boolean);
  }

  function cents(value: string) {
    return Math.round(Number.parseFloat(value || "0") * 100);
  }

  function fromCents(value?: number) {
    return typeof value === "number" ? String(value / 100) : "";
  }

  function conditionDraftFromRule(condition: any): DynamicPricingConditionDraft {
    const moneyCondition = ["cart_subtotal", "matching_subtotal", "purchase_history_spend"].includes(condition.kind);
    let value = "";
    if (typeof condition.numberValue === "number") value = moneyCondition ? fromCents(condition.numberValue) : String(condition.numberValue);
    else if (typeof condition.booleanValue === "boolean") value = condition.booleanValue ? "true" : "false";
    else if (Array.isArray(condition.stringValues)) value = condition.stringValues.join(", ");
    else value = condition.stringValue ?? "";
    return {
      id: newDynamicPricingCondition().id,
      kind: condition.kind ?? "cart_subtotal",
      operator: condition.operator ?? "gte",
      value,
    };
  }

  function buildCondition(condition: DynamicPricingConditionDraft) {
    const numericMoney = ["cart_subtotal", "matching_subtotal", "purchase_history_spend"].includes(condition.kind);
    const numericCount = ["cart_item_count", "matching_quantity", "purchase_history_orders"].includes(condition.kind);
    const booleanCondition = ["first_order", "coupon_present"].includes(condition.kind);
    const base: any = { kind: condition.kind, operator: condition.operator };
    if (numericMoney) base.numberValue = cents(condition.value);
    else if (numericCount) base.numberValue = Number(condition.value || "0");
    else if (booleanCondition) base.booleanValue = ["true", "yes", "1"].includes(condition.value.toLowerCase());
    else {
      const values = parseIdList(condition.value);
      if (["in", "not_in", "contains", "not_contains"].includes(condition.operator)) base.stringValues = values;
      else base.stringValue = condition.value.trim();
    }
    return base;
  }

  function buildAction() {
    const percentage = ["percentage_discount", "percentage_markup"].includes(form.actionType);
    return {
      type: form.actionType,
      target: form.actionTarget,
      amount: form.actionType === "free_shipping" ? undefined : percentage ? Number(form.actionAmount || "0") : cents(form.actionAmount),
      maxDiscountAmount: form.maxDiscountAmount ? cents(form.maxDiscountAmount) : undefined,
    };
  }

  function parseDate(value: string) {
    return value.trim() ? new Date(value).getTime() : undefined;
  }

  function buildConditions() {
    return conditions
      .filter((condition) => {
        if (["first_order", "coupon_present"].includes(condition.kind)) return true;
        return condition.value.trim().length > 0;
      })
      .map((condition) => buildCondition(condition));
  }

  function buildPayload() {
    const productIds = parseIdList(form.productIds);
    const categoryIds = parseIdList(form.categoryIds);
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      priority: Number(form.priority || "100"),
      processingMode: form.processingMode,
      exclusive: form.exclusive,
      stackWithCoupons: form.stackWithCoupons,
      startsAt: parseDate(form.startsAt),
      endsAt: parseDate(form.endsAt),
      scope: {
        appliesTo: form.appliesTo,
        productIds,
        categoryIds,
        excludedProductIds: parseIdList(form.excludedProductIds),
        excludedCategoryIds: parseIdList(form.excludedCategoryIds),
      },
      conditionsMatch: form.conditionsMatch,
      conditions: buildConditions(),
      action: buildAction(),
      customerMessage: form.customerMessage.trim() || undefined,
    };
  }

  function resetEditor() {
    setEditingRuleId(null);
    setForm(dynamicPricingFormDefaults());
    setConditions([newDynamicPricingCondition()]);
  }

  function editRule(rule: any) {
    setEditingRuleId(rule._id);
    setForm({
      name: rule.name ?? "",
      description: rule.description ?? "",
      status: rule.status ?? "active",
      priority: String(rule.priority ?? 100),
      appliesTo: rule.scope?.appliesTo ?? "all_products",
      productIds: (rule.scope?.productIds ?? []).map(String).join(", "),
      categoryIds: (rule.scope?.categoryIds ?? []).map(String).join(", "),
      excludedProductIds: (rule.scope?.excludedProductIds ?? []).map(String).join(", "),
      excludedCategoryIds: (rule.scope?.excludedCategoryIds ?? []).map(String).join(", "),
      conditionsMatch: rule.conditionsMatch ?? "all",
      processingMode: rule.processingMode ?? "all_applicable",
      actionType: rule.action?.type ?? "percentage_discount",
      actionTarget: rule.action?.target ?? "matching_items",
      actionAmount: ["percentage_discount", "percentage_markup"].includes(rule.action?.type)
        ? String(rule.action?.amount ?? "")
        : fromCents(rule.action?.amount),
      maxDiscountAmount: fromCents(rule.action?.maxDiscountAmount),
      exclusive: Boolean(rule.exclusive),
      stackWithCoupons: rule.stackWithCoupons !== false,
      startsAt: rule.startsAt ? new Date(rule.startsAt).toISOString() : "",
      endsAt: rule.endsAt ? new Date(rule.endsAt).toISOString() : "",
      customerMessage: rule.customerMessage ?? "",
    });
    setConditions((rule.conditions ?? []).length ? rule.conditions.map(conditionDraftFromRule) : [newDynamicPricingCondition()]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateCondition(id: string, patch: Partial<DynamicPricingConditionDraft>) {
    setConditions((current) =>
      current.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition,
      ),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const productIds = parseIdList(form.productIds);
    const categoryIds = parseIdList(form.categoryIds);
    if (form.appliesTo === "specific_products" && productIds.length === 0) {
      toast.error("Choose at least one product ID for a product-scoped rule.");
      return;
    }
    if (form.appliesTo === "specific_categories" && categoryIds.length === 0) {
      toast.error("Choose at least one category ID for a category-scoped rule.");
      return;
    }
    if (form.actionType === "free_shipping" && form.actionTarget !== "shipping") {
      toast.error("Free shipping rules must target shipping.");
      return;
    }
    try {
      const payload = buildPayload();
      if (editingRuleId) {
        await update({ ruleId: editingRuleId, patch: payload });
        toast.success("Dynamic pricing rule updated.");
      } else {
        await create(payload);
        toast.success("Dynamic pricing rule created.");
      }
      resetEditor();
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to save dynamic pricing rule.");
    }
  }

  return (
    <Shell title="Dynamic Pricing" description="Automatic pricing rules based on cart contents, products, categories, customers, roles, quantity, and spend." icon={Tags}>
      <form onSubmit={submit} className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_2fr_120px_150px_140px]">
          <TextInput label="Rule name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} placeholder="Wholesale 10+ discount" />
          <TextInput label="Description" value={form.description} onChange={(description) => setForm((f) => ({ ...f, description }))} />
          <TextInput label="Priority" value={form.priority} onChange={(priority) => setForm((f) => ({ ...f, priority }))} />
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-muted-foreground">Mode</span>
            <select value={form.processingMode} onChange={(event) => setForm((f) => ({ ...f, processingMode: event.target.value }))} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
              <option value="all_applicable">All applicable</option>
              <option value="first_match">First match</option>
              <option value="best_discount">Best discount</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-muted-foreground">Status</span>
            <select value={form.status} onChange={(event) => setForm((f) => ({ ...f, status: event.target.value }))} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 rounded-md border border-border p-3">
          <h2 className="text-sm font-semibold">Scope</h2>
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-muted-foreground">Applies to</span>
              <select value={form.appliesTo} onChange={(event) => setForm((f) => ({ ...f, appliesTo: event.target.value }))} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="all_products">All products</option>
                <option value="specific_products">Specific products</option>
                <option value="specific_categories">Specific categories</option>
              </select>
            </label>
            <TextInput label="Product IDs" value={form.productIds} onChange={(productIds) => setForm((f) => ({ ...f, productIds }))} placeholder="comma separated" />
            <TextInput label="Category IDs" value={form.categoryIds} onChange={(categoryIds) => setForm((f) => ({ ...f, categoryIds }))} placeholder="comma separated" />
            <TextInput label="Excluded product IDs" value={form.excludedProductIds} onChange={(excludedProductIds) => setForm((f) => ({ ...f, excludedProductIds }))} placeholder="optional" />
          </div>
        </div>

        <div className="grid gap-3 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Conditions</h2>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-muted-foreground">Match mode</span>
              <select value={form.conditionsMatch} onChange={(event) => setForm((f) => ({ ...f, conditionsMatch: event.target.value }))} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="all">All conditions</option>
                <option value="any">Any condition</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3">
            {conditions.map((condition, index) => (
              <div key={condition.id} className="grid gap-3 rounded-md bg-muted/30 p-3 lg:grid-cols-[1fr_160px_1fr_auto]">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-muted-foreground">Condition {index + 1}</span>
                  <select value={condition.kind} onChange={(event) => updateCondition(condition.id, { kind: event.target.value })} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                    <option value="cart_subtotal">Cart subtotal</option>
                    <option value="cart_item_count">Cart item count</option>
                    <option value="matching_quantity">Matching quantity</option>
                    <option value="matching_subtotal">Matching subtotal</option>
                    <option value="customer_group">Customer group</option>
                    <option value="user_role">User role</option>
                    <option value="specific_customer">Specific customer</option>
                    <option value="first_order">First order</option>
                    <option value="purchase_history_orders">Past order count</option>
                    <option value="purchase_history_spend">Past spend</option>
                    <option value="coupon_present">Coupon present</option>
                    <option value="shipping_country">Shipping country</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-muted-foreground">Operator</span>
                  <select value={condition.operator} onChange={(event) => updateCondition(condition.id, { operator: event.target.value })} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                    <option value="gte">at least</option>
                    <option value="gt">greater than</option>
                    <option value="lte">at most</option>
                    <option value="lt">less than</option>
                    <option value="eq">equals</option>
                    <option value="neq">does not equal</option>
                    <option value="in">is one of</option>
                    <option value="not_in">is not one of</option>
                    <option value="contains">contains</option>
                    <option value="not_contains">does not contain</option>
                    <option value="is_true">is true</option>
                    <option value="is_false">is false</option>
                  </select>
                </label>
                <TextInput label="Value" value={condition.value} onChange={(value) => updateCondition(condition.id, { value })} placeholder="100.00, 10, wholesale, role slug, email" />
                <button
                  type="button"
                  onClick={() =>
                    setConditions((current) =>
                      current.length === 1
                        ? [newDynamicPricingCondition()]
                        : current.filter((item) => item.id !== condition.id),
                    )
                  }
                  className="self-end rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setConditions((current) => [...current, newDynamicPricingCondition()])}
            className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Add condition
          </button>
        </div>

        <div className="grid gap-3 rounded-md border border-border p-3">
          <h2 className="text-sm font-semibold">Action</h2>
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-muted-foreground">Action type</span>
              <select value={form.actionType} onChange={(event) => setForm((f) => ({ ...f, actionType: event.target.value }))} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="percentage_discount">Percentage discount</option>
                <option value="fixed_discount">Fixed discount</option>
                <option value="fixed_price">Set fixed price</option>
                <option value="percentage_markup">Percentage markup</option>
                <option value="fixed_markup">Fixed markup</option>
                <option value="free_shipping">Free shipping</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-muted-foreground">Target</span>
              <select value={form.actionTarget} onChange={(event) => setForm((f) => ({ ...f, actionTarget: event.target.value }))} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option value="matching_items">Matching items</option>
                <option value="cart_subtotal">Cart subtotal</option>
                <option value="cheapest_matching_item">Cheapest matching item</option>
                <option value="shipping">Shipping</option>
              </select>
            </label>
            <TextInput label="Amount" value={form.actionAmount} onChange={(actionAmount) => setForm((f) => ({ ...f, actionAmount }))} placeholder="15 or 10.00" />
            <TextInput label="Max discount" value={form.maxDiscountAmount} onChange={(maxDiscountAmount) => setForm((f) => ({ ...f, maxDiscountAmount }))} placeholder="optional" />
          </div>
          <div className="flex flex-wrap gap-4">
            <CheckboxInput label="Stop after this rule" checked={form.exclusive} onChange={(exclusive) => setForm((f) => ({ ...f, exclusive }))} />
            <CheckboxInput label="Allow coupon codes too" checked={form.stackWithCoupons} onChange={(stackWithCoupons) => setForm((f) => ({ ...f, stackWithCoupons }))} />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr_auto_auto]">
          <TextInput label="Starts at" value={form.startsAt} onChange={(startsAt) => setForm((f) => ({ ...f, startsAt }))} placeholder="optional" />
          <TextInput label="Ends at" value={form.endsAt} onChange={(endsAt) => setForm((f) => ({ ...f, endsAt }))} placeholder="optional" />
          <TextInput label="Customer message" value={form.customerMessage} onChange={(customerMessage) => setForm((f) => ({ ...f, customerMessage }))} placeholder="Wholesale quantity discount applied" />
          {editingRuleId ? (
            <button type="button" onClick={resetEditor} className="self-end rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
          ) : null}
          <button className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {editingRuleId ? "Update Rule" : "Create Rule"}
          </button>
        </div>
      </form>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-semibold">Rule Preview</h2>
          <p className="text-sm text-muted-foreground">Test active saved rules against a sample product, cart, and customer context.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <TextInput label="Product ID" value={previewForm.productId} onChange={(productId) => setPreviewForm((f) => ({ ...f, productId }))} placeholder="optional" />
          <TextInput label="Category IDs" value={previewForm.categoryIds} onChange={(categoryIds) => setPreviewForm((f) => ({ ...f, categoryIds }))} placeholder="comma separated" />
          <TextInput label="Quantity" value={previewForm.quantity} onChange={(quantity) => setPreviewForm((f) => ({ ...f, quantity }))} />
          <TextInput label="Unit price" value={previewForm.unitPrice} onChange={(unitPrice) => setPreviewForm((f) => ({ ...f, unitPrice }))} />
          <TextInput label="Customer group ID" value={previewForm.customerGroupId} onChange={(customerGroupId) => setPreviewForm((f) => ({ ...f, customerGroupId }))} placeholder="optional" />
          <TextInput label="Role" value={previewForm.roleValue} onChange={(roleValue) => setPreviewForm((f) => ({ ...f, roleValue }))} placeholder="slug, ID, or name" />
          <TextInput label="Customer email" value={previewForm.email} onChange={(email) => setPreviewForm((f) => ({ ...f, email }))} placeholder="optional" />
          <TextInput label="Shipping country" value={previewForm.shippingCountry} onChange={(shippingCountry) => setPreviewForm((f) => ({ ...f, shippingCountry }))} />
          <TextInput label="Past orders" value={previewForm.totalOrders} onChange={(totalOrders) => setPreviewForm((f) => ({ ...f, totalOrders }))} />
          <TextInput label="Past spend" value={previewForm.totalSpend} onChange={(totalSpend) => setPreviewForm((f) => ({ ...f, totalSpend }))} />
          <div className="self-end">
            <CheckboxInput label="Coupon present" checked={previewForm.couponPresent} onChange={(couponPresent) => setPreviewForm((f) => ({ ...f, couponPresent }))} />
          </div>
          <button type="button" onClick={() => setPreviewEnabled(true)} className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Preview Rules
          </button>
        </div>
        {previewEnabled ? (
          <div className="grid gap-2 rounded-md bg-muted/30 p-3 text-sm md:grid-cols-5">
            <div>
              <span className="block text-muted-foreground">Original</span>
              <strong>{money(preview?.originalSubtotalAmount, preview?.currencyCode)}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Discount</span>
              <strong>{money(preview?.totalDiscountAmount, preview?.currencyCode)}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Final subtotal</span>
              <strong>{money(preview?.finalSubtotalAmount, preview?.currencyCode)}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Shipping</span>
              <strong>{preview?.freeShipping ? "Free" : "Standard"}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Matched rules</span>
              <strong>{preview?.ruleIds?.length ?? 0}</strong>
            </div>
            <p className="md:col-span-5 text-muted-foreground">{preview?.description ?? "No active rule matched this preview."}</p>
          </div>
        ) : null}
      </section>

      <div className="grid gap-3">
        {(rules ?? []).length === 0 ? <Empty label="No dynamic pricing rules configured." /> : (rules ?? []).map((rule) => (
          <div key={rule._id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{rule.name}</h2>
                <p className="text-sm text-muted-foreground">{rule.description ?? rule.customerMessage ?? "No description"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rule.scope?.appliesTo?.replaceAll("_", " ")} · {rule.action?.target?.replaceAll("_", " ")} · {rule.action?.type?.replaceAll("_", " ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill>{rule.status}</StatusPill>
                <StatusPill>{`priority ${String(rule.priority)}`}</StatusPill>
                <button type="button" onClick={() => editRule(rule)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  Edit
                </button>
                <button type="button" onClick={() => void setStatus({ ruleId: rule._id, status: rule.status === "active" ? "inactive" : "active" })} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  {rule.status === "active" ? "Disable" : "Enable"}
                </button>
                <button type="button" onClick={() => void remove({ ruleId: rule._id })} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function DraftOrdersPage() {
  const drafts = useQuery((api as any).commerce.draftOrders.list, {}) as any[] | undefined;
  const create = useMutation((api as any).commerce.draftOrders.create);
  const [email, setEmail] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create({ email: email.trim() || undefined, currencyCode: currencyCode.trim().toUpperCase() });
      setEmail("");
      setCurrencyCode("USD");
      toast.success("Draft order created.");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to create draft order.");
    }
  }

  return (
    <Shell title="Draft Orders" description="Admin-created quotes, invoices, and assisted checkout records." icon={FileClock}>
      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[2fr_160px_auto]">
        <TextInput label="Customer email" value={email} onChange={setEmail} placeholder="customer@example.com" />
        <TextInput label="Currency" value={currencyCode} onChange={setCurrencyCode} />
        <button className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Create Draft</button>
      </form>
      <div className="grid gap-3">
        {(drafts ?? []).length === 0 ? <Empty label="No draft orders yet." /> : (drafts ?? []).map((draft) => (
          <div key={draft._id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{draft.email ?? "Guest draft"}</h2>
                <p className="text-sm text-muted-foreground">{money(draft.totalAmount, draft.currencyCode)} · {date(draft.createdAt)}</p>
              </div>
              <StatusPill>{draft.status}</StatusPill>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function OrderChangesPage() {
  const changes = useQuery((api as any).commerce.orderChanges.list, { limit: 100 }) as any[] | undefined;
  return (
    <Shell title="Order Changes" description="Ledger of edits, refunds, exchanges, cancellations, claims, and corrections." icon={RefreshCw}>
      <div className="grid gap-3">
        {(changes ?? []).length === 0 ? <Empty label="No order changes recorded." /> : (changes ?? []).map((change) => (
          <div key={change._id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{change.orderNumber ?? "Order"} · {change.changeType}</h2>
                <p className="text-sm text-muted-foreground">{change.description ?? "No description"} · {date(change.createdAt)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{change.actions?.length ?? 0} actions</p>
              </div>
              <StatusPill>{change.status}</StatusPill>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function PaymentCollectionsPage() {
  const collections = useQuery((api as any).commerce.payments.listCollections, { limit: 100 }) as any[] | undefined;
  const totals = useMemo(() => {
    const rows = collections ?? [];
    return {
      count: rows.length,
      captured: rows.reduce((sum, row) => sum + Number(row.capturedAmount ?? 0), 0),
      refunded: rows.reduce((sum, row) => sum + Number(row.refundedAmount ?? 0), 0),
    };
  }, [collections]);

  return (
    <Shell title="Payments" description="Collections, sessions, captures, refunds, and provider attempts." icon={CreditCard}>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-sm text-muted-foreground">Collections</div><div className="text-2xl font-semibold">{totals.count}</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-sm text-muted-foreground">Captured</div><div className="text-2xl font-semibold">{money(totals.captured)}</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-sm text-muted-foreground">Refunded</div><div className="text-2xl font-semibold">{money(totals.refunded)}</div></div>
      </div>
      <div className="grid gap-3">
        {(collections ?? []).length === 0 ? <Empty label="No payment collections yet." /> : (collections ?? []).map((collection) => (
          <div key={collection._id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{collection.orderNumber ?? "Checkout collection"}</h2>
                <p className="text-sm text-muted-foreground">{money(collection.amount, collection.currencyCode)} · {collection.orderEmail ?? "No order email"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{collection.sessions?.length ?? 0} sessions · {collection.captures?.length ?? 0} captures</p>
              </div>
              <StatusPill>{collection.status}</StatusPill>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function WorkflowsPage() {
  const runs = useQuery((api as any).commerce.workflows.list, { limit: 100 }) as any[] | undefined;
  const backfill = useMutation((api as any).commerce.migrations.backfillEnterpriseCommerceRecords);
  const [backfillResult, setBackfillResult] = useState<any>(null);

  async function runBackfill(dryRun: boolean) {
    try {
      const result = await backfill({ dryRun, limit: 1000 });
      setBackfillResult(result);
      toast.success(dryRun ? "Backfill dry run complete." : "Enterprise backfill complete.");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Backfill failed.");
    }
  }

  return (
    <Shell title="Commerce Workflows" description="Idempotency and side-effect tracking for payments, labels, fulfillment, and webhooks." icon={Workflow}>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Enterprise Backfill</h2>
            <p className="text-sm text-muted-foreground">
              Populate default regions, sales channels, and payment collection links for older commerce records.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void runBackfill(true)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
              Dry Run
            </button>
            <button onClick={() => void runBackfill(false)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              Run Backfill
            </button>
          </div>
        </div>
        {backfillResult ? (
          <pre className="mt-4 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {JSON.stringify(backfillResult, null, 2)}
          </pre>
        ) : null}
      </section>
      <div className="grid gap-3">
        {(runs ?? []).length === 0 ? <Empty label="No workflow runs yet." /> : (runs ?? []).map((run) => (
          <div key={run._id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{run.workflowKey}</h2>
                <p className="text-sm text-muted-foreground">{run.idempotencyKey}</p>
                <p className="mt-1 text-xs text-muted-foreground">{run.entityType ?? "entity"} · {run.entityId ?? "none"} · {date(run.startedAt)}</p>
              </div>
              <StatusPill>{run.status}</StatusPill>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
