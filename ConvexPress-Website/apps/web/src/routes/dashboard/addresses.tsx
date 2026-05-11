import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
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
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/dashboard/addresses")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardAddressesPage,
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AddressFormData {
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

const EMPTY_FORM: AddressFormData = {
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
  initialData: AddressFormData;
  onSubmit: (data: AddressFormData) => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<AddressFormData>(initialData);

  function update(field: keyof AddressFormData, value: string) {
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
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
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
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
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
                className="inline-flex rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
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

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function DashboardAddressesPage() {
  const addresses = useQuery(
    (api as any).commerce.customers.getMyAddresses,
    {},
  ) as any[] | undefined;

  const addAddress = useMutation(
    (api as any).commerce.customers.addAddress,
  );
  const updateAddress = useMutation(
    (api as any).commerce.customers.updateAddress,
  );
  const deleteAddress = useMutation(
    (api as any).commerce.customers.deleteAddress,
  );
  const setDefaultAddress = useMutation(
    (api as any).commerce.customers.setDefaultAddress,
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd(data: AddressFormData) {
    setBusy(true);
    try {
      await addAddress({
        addressType: data.addressType,
        label: data.label,
        line1: data.line1,
        city: data.city,
        postalCode: data.postalCode,
        countryCode: data.countryCode,
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName ? { lastName: data.lastName } : {}),
        ...(data.company ? { company: data.company } : {}),
        ...(data.line2 ? { line2: data.line2 } : {}),
        ...(data.state ? { state: data.state } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        setAsDefault: !addresses || addresses.length === 0,
      });
      setShowAddForm(false);
      toast.success("Address added");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to add address",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(addressId: string, data: AddressFormData) {
    setBusy(true);
    try {
      await updateAddress({
        addressId: addressId as any,
        addressType: data.addressType,
        label: data.label,
        line1: data.line1,
        city: data.city,
        postalCode: data.postalCode,
        countryCode: data.countryCode,
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName ? { lastName: data.lastName } : {}),
        ...(data.company ? { company: data.company } : {}),
        ...(data.line2 ? { line2: data.line2 } : {}),
        ...(data.state ? { state: data.state } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
      });
      setEditingId(null);
      toast.success("Address updated");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update address",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(addressId: string) {
    try {
      await deleteAddress({ addressId: addressId as any });
      toast.success("Address deleted");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete address",
      );
    }
  }

  async function handleSetDefault(
    addressId: string,
    type: "billing" | "shipping",
  ) {
    try {
      await setDefaultAddress({
        addressId: addressId as any,
        addressType: type,
      });
      toast.success(`Set as default ${type} address`);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to set default",
      );
    }
  }

  const shippingAddresses =
    addresses?.filter((a: any) => a.addressType === "shipping") ?? [];
  const billingAddresses =
    addresses?.filter((a: any) => a.addressType === "billing") ?? [];

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
            initialData={EMPTY_FORM}
            onSubmit={handleAdd}
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
                {shippingAddresses.map((addr: any) =>
                  editingId === addr._id ? (
                    <div
                      key={addr._id}
                      className="rounded-2xl border border-primary bg-card p-5 shadow-sm sm:col-span-2"
                    >
                      <h3 className="mb-4 text-sm font-semibold text-foreground">
                        Edit Address
                      </h3>
                      <AddressForm
                        initialData={{
                          addressType: addr.addressType ?? "shipping",
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
                        }}
                        onSubmit={(data) =>
                          void handleUpdate(addr._id, data)
                        }
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
                      onDelete={() => void handleDelete(addr._id)}
                      onSetDefault={(type) =>
                        void handleSetDefault(addr._id, type)
                      }
                    />
                  ),
                )}
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
                {billingAddresses.map((addr: any) =>
                  editingId === addr._id ? (
                    <div
                      key={addr._id}
                      className="rounded-2xl border border-primary bg-card p-5 shadow-sm sm:col-span-2"
                    >
                      <h3 className="mb-4 text-sm font-semibold text-foreground">
                        Edit Address
                      </h3>
                      <AddressForm
                        initialData={{
                          addressType: addr.addressType ?? "billing",
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
                        }}
                        onSubmit={(data) =>
                          void handleUpdate(addr._id, data)
                        }
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
                      onDelete={() => void handleDelete(addr._id)}
                      onSetDefault={(type) =>
                        void handleSetDefault(addr._id, type)
                      }
                    />
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
