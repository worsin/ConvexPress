/**
 * Core · dashboard.addresses — saved shipping and billing addresses with
 * add / edit / delete / set-default. Form drafts and open panels are local;
 * the mutations (with toasts) come from the loader.
 */
import { useState } from "react";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Star,
  Home,
  Building2,
  X,
} from "lucide-react";

import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardAddressFormData {
  addressType: "billing" | "shipping";
  label: string;
  firstName: string;
  lastName: string;
  company: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  phone: string;
}

export interface DashboardAddressesSurfaceData {
  /** Saved addresses (commerce.customers.getMyAddresses); undefined while loading. */
  addresses: any[] | undefined;
  /** True while an add / update is in flight. */
  busy: boolean;
  actions: {
    /** Adds the address and toasts; resolves true on success (the form closes). */
    add: (data: DashboardAddressFormData) => Promise<boolean>;
    /** Updates the address and toasts; resolves true on success (edit mode closes). */
    update: (addressId: string, data: DashboardAddressFormData) => Promise<boolean>;
    remove: (addressId: string) => Promise<void>;
    setDefault: (addressId: string, type: "billing" | "shipping") => Promise<void>;
  };
}

export const EMPTY_ADDRESS_FORM: DashboardAddressFormData = {
  addressType: "shipping",
  label: "",
  firstName: "",
  lastName: "",
  company: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  countryCode: "US",
  phone: "",
};

/* ------------------------------------------------------------------ */
/*  Address Form                                                       */
/* ------------------------------------------------------------------ */

function AddressForm({
  initialData,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  initialData: DashboardAddressFormData;
  onSubmit: (data: DashboardAddressFormData) => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<DashboardAddressFormData>(initialData);

  function update(field: keyof DashboardAddressFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Type
          </label>
          <select
            value={form.addressType}
            onChange={(e) =>
              update("addressType", e.target.value as "billing" | "shipping")
            }
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          >
            <option value="shipping">Shipping</option>
            <option value="billing">Billing</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Label
          </label>
          <input
            value={form.label}
            onChange={(e) => update("label", e.target.value)}
            placeholder='e.g. "Home", "Office"'
            required
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            First Name
          </label>
          <input
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            placeholder="First name"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Last Name
          </label>
          <input
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            placeholder="Last name"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Company
        </label>
        <input
          value={form.company}
          onChange={(e) => update("company", e.target.value)}
          placeholder="Company (optional)"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Address Line 1
        </label>
        <input
          value={form.line1}
          onChange={(e) => update("line1", e.target.value)}
          placeholder="Street address"
          required
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Address Line 2
        </label>
        <input
          value={form.line2}
          onChange={(e) => update("line2", e.target.value)}
          placeholder="Apt, suite, unit (optional)"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            City
          </label>
          <input
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="City"
            required
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            State / Province
          </label>
          <input
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
            placeholder="State"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Postal Code
          </label>
          <input
            value={form.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
            placeholder="ZIP / Postal"
            required
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Country
          </label>
          <input
            value={form.countryCode}
            onChange={(e) => update("countryCode", e.target.value)}
            placeholder="Country code (e.g. US)"
            required
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Phone
          </label>
          <input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="Phone (optional)"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Address Card                                                       */
/* ------------------------------------------------------------------ */

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: any;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: (type: "billing" | "shipping") => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const addr = address.address ?? {};

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          {address.addressType === "shipping" ? (
            <Home className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {address.label || address.addressType}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
            {address.addressType}
          </span>
          {address.isDefault && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <Star className="h-2.5 w-2.5" />
              Default
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 text-sm text-foreground">
        {(addr.firstName || addr.lastName) && (
          <p className="font-medium">
            {[addr.firstName, addr.lastName].filter(Boolean).join(" ")}
          </p>
        )}
        {addr.company && (
          <p className="text-muted-foreground">{addr.company}</p>
        )}
        <p>{addr.line1}</p>
        {addr.line2 && <p>{addr.line2}</p>}
        <p>
          {[addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ")}
        </p>
        <p>{addr.countryCode}</p>
        {addr.phone && (
          <p className="mt-1 text-xs text-muted-foreground">{addr.phone}</p>
        )}
      </div>

      {/* Set as default */}
      {!address.isDefault && (
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => onSetDefault(address.addressType)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Star className="h-3 w-3" />
            Set as default {address.addressType}
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/95 p-4">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Delete this address?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This action cannot be undone.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  setConfirmDelete(false);
                }}
                className="inline-flex rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="inline-flex rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toFormData(addr: any, fallbackType: "billing" | "shipping"): DashboardAddressFormData {
  return {
    addressType: addr.addressType ?? fallbackType,
    label: addr.label ?? "",
    firstName: addr.address?.firstName ?? "",
    lastName: addr.address?.lastName ?? "",
    company: addr.address?.company ?? "",
    line1: addr.address?.line1 ?? "",
    line2: addr.address?.line2 ?? "",
    city: addr.address?.city ?? "",
    state: addr.address?.state ?? "",
    postalCode: addr.address?.postalCode ?? "",
    countryCode: addr.address?.countryCode ?? "US",
    phone: addr.address?.phone ?? "",
  };
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export default function CoreDashboardAddresses({ data }: SurfaceProps<DashboardAddressesSurfaceData>) {
  const { addresses, busy, actions } = data;

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleAdd(form: DashboardAddressFormData) {
    const ok = await actions.add(form);
    if (ok) setShowAddForm(false);
  }

  async function handleUpdate(addressId: string, form: DashboardAddressFormData) {
    const ok = await actions.update(addressId, form);
    if (ok) setEditingId(null);
  }

  const shippingAddresses =
    addresses?.filter((a: any) => a.addressType === "shipping") ?? [];
  const billingAddresses =
    addresses?.filter((a: any) => a.addressType === "billing") ?? [];

  const renderGroup = (list: any[], fallbackType: "billing" | "shipping") =>
    list.map((addr: any) =>
      editingId === addr._id ? (
        <div
          key={addr._id}
          className="rounded-2xl border border-primary bg-card p-5 shadow-sm sm:col-span-2"
        >
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Edit Address
          </h3>
          <AddressForm
            initialData={toFormData(addr, fallbackType)}
            onSubmit={(form) => void handleUpdate(addr._id, form)}
            onCancel={() => setEditingId(null)}
            busy={busy}
            submitLabel="Save Changes"
          />
        </div>
      ) : (
        <AddressCard
          key={addr._id}
          address={addr}
          onEdit={() => {
            setShowAddForm(false);
            setEditingId(addr._id);
          }}
          onDelete={() => void actions.remove(addr._id)}
          onSetDefault={(type) => void actions.setDefault(addr._id, type)}
        />
      ),
    );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-sm font-medium text-foreground">
            My Addresses
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage your shipping and billing addresses.
          </p>
        </div>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setShowAddForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Address
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              New Address
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <AddressForm
            initialData={EMPTY_ADDRESS_FORM}
            onSubmit={(form) => void handleAdd(form)}
            onCancel={() => setShowAddForm(false)}
            busy={busy}
            submitLabel="Add Address"
          />
        </div>
      )}

      {/* Loading */}
      {addresses === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : addresses.length === 0 && !showAddForm ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            You don't have any saved addresses yet.
          </p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Add Your First Address
          </button>
        </div>
      ) : (
        <>
          {/* Shipping addresses */}
          {shippingAddresses.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Home className="h-3.5 w-3.5" />
                Shipping Addresses
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {renderGroup(shippingAddresses, "shipping")}
              </div>
            </div>
          )}

          {/* Billing addresses */}
          {billingAddresses.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                Billing Addresses
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {renderGroup(billingAddresses, "billing")}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
