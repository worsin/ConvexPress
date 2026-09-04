/**
 * Depot · dashboard.addresses — saved shipping and billing addresses as a
 * dense card grid with add / edit / delete / set-default; the address form
 * uses the Depot fields in a box. Form drafts and open panels are local;
 * the mutations (with toasts) come from the loader, as in Core.
 */
import { Building2, Home, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { DashboardAddressFormData, DashboardAddressesSurfaceData } from "@/templates/packs/core/surfaces/dashboard.addresses";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, EmptyState, Select, Skeleton } from "../parts";
import { Field, Input } from "../parts/extra-plugins";
import { DashboardPageHeader, DashboardSection } from "../parts/extra-dashboard";

const EMPTY_FORM: DashboardAddressFormData = {
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

export default function DepotDashboardAddresses({ data }: SurfaceProps<DashboardAddressesSurfaceData>) {
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

  const shippingAddresses = addresses?.filter((address: any) => address.addressType === "shipping") ?? [];
  const billingAddresses = addresses?.filter((address: any) => address.addressType === "billing") ?? [];

  const renderGroup = (list: any[], fallbackType: "billing" | "shipping") =>
    list.map((address: any) =>
      editingId === address._id ? (
        <Card key={address._id} className="flex flex-col gap-3 border-primary p-4 md:col-span-2 xl:col-span-3">
          <h3 className="text-sm font-semibold text-foreground">Edit address</h3>
          <AddressForm initialData={toFormData(address, fallbackType)} onSubmit={(form) => void handleUpdate(address._id, form)} onCancel={() => setEditingId(null)} busy={busy} submitLabel="Save changes" />
        </Card>
      ) : (
        <AddressCard
          key={address._id}
          address={address}
          onEdit={() => {
            setShowAddForm(false);
            setEditingId(address._id);
          }}
          onDelete={() => void actions.remove(address._id)}
          onSetDefault={(type) => void actions.setDefault(address._id, type)}
        />
      ),
    );

  return (
    <div data-slot="dashboard-addresses" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Shop"
        title="My addresses"
        description="Manage your shipping and billing addresses."
        meta={addresses ? `${addresses.length} saved` : undefined}
        aside={
          !showAddForm ? (
            <Button
              size="sm"
              onClick={() => {
                setEditingId(null);
                setShowAddForm(true);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add address
            </Button>
          ) : null
        }
      />

      {showAddForm ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">New address</h2>
            <button type="button" onClick={() => setShowAddForm(false)} aria-label="Close form" className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <AddressForm initialData={EMPTY_FORM} onSubmit={(form) => void handleAdd(form)} onCancel={() => setShowAddForm(false)} busy={busy} submitLabel="Add address" />
        </Card>
      ) : null}

      {addresses === undefined ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : addresses.length === 0 && !showAddForm ? (
        <EmptyState
          title="You don't have any saved addresses yet."
          description="Saved addresses speed up checkout."
          action={
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add your first address
            </Button>
          }
        />
      ) : (
        <>
          {shippingAddresses.length > 0 ? (
            <DashboardSection
              title={
                <span className="inline-flex items-center gap-2">
                  <Home className="size-4 text-muted-foreground" aria-hidden="true" />
                  Shipping addresses
                </span>
              }
              count={shippingAddresses.length}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{renderGroup(shippingAddresses, "shipping")}</div>
            </DashboardSection>
          ) : null}
          {billingAddresses.length > 0 ? (
            <DashboardSection
              title={
                <span className="inline-flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  Billing addresses
                </span>
              }
              count={billingAddresses.length}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{renderGroup(billingAddresses, "billing")}</div>
            </DashboardSection>
          ) : null}
        </>
      )}
    </div>
  );
}

function AddressForm({ initialData, onSubmit, onCancel, busy, submitLabel }: { initialData: DashboardAddressFormData; onSubmit: (data: DashboardAddressFormData) => void; onCancel: () => void; busy: boolean; submitLabel: string }) {
  const [form, setForm] = useState<DashboardAddressFormData>(initialData);

  function update(field: keyof DashboardAddressFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="address-type">
          <Select id="address-type" value={form.addressType} onChange={(event) => update("addressType", event.target.value as "billing" | "shipping")} className="w-full">
            <option value="shipping">Shipping</option>
            <option value="billing">Billing</option>
          </Select>
        </Field>
        <Field label="Label" htmlFor="address-label">
          <Input id="address-label" value={form.label} onChange={(event) => update("label", event.target.value)} placeholder='e.g. "Home", "Office"' required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="address-first-name">
          <Input id="address-first-name" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} placeholder="First name" autoComplete="given-name" />
        </Field>
        <Field label="Last name" htmlFor="address-last-name">
          <Input id="address-last-name" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} placeholder="Last name" autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Company" htmlFor="address-company">
        <Input id="address-company" value={form.company} onChange={(event) => update("company", event.target.value)} placeholder="Company (optional)" autoComplete="organization" />
      </Field>
      <Field label="Address line 1" htmlFor="address-line1">
        <Input id="address-line1" value={form.line1} onChange={(event) => update("line1", event.target.value)} placeholder="Street address" required autoComplete="address-line1" />
      </Field>
      <Field label="Address line 2" htmlFor="address-line2">
        <Input id="address-line2" value={form.line2} onChange={(event) => update("line2", event.target.value)} placeholder="Apt, suite, unit (optional)" autoComplete="address-line2" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="City" htmlFor="address-city">
          <Input id="address-city" value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="City" required autoComplete="address-level2" />
        </Field>
        <Field label="State / province" htmlFor="address-state">
          <Input id="address-state" value={form.state} onChange={(event) => update("state", event.target.value)} placeholder="State" autoComplete="address-level1" />
        </Field>
        <Field label="Postal code" htmlFor="address-postal">
          <Input id="address-postal" value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="ZIP / Postal" required autoComplete="postal-code" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Country" htmlFor="address-country">
          <Input id="address-country" value={form.countryCode} onChange={(event) => update("countryCode", event.target.value)} placeholder="Country code (e.g. US)" required autoComplete="country" />
        </Field>
        <Field label="Phone" htmlFor="address-phone">
          <Input id="address-phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Phone (optional)" autoComplete="tel" />
        </Field>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddressCard({ address, onEdit, onDelete, onSetDefault }: { address: any; onEdit: () => void; onDelete: () => void; onSetDefault: (type: "billing" | "shipping") => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const addr = address.address ?? {};
  const TypeIcon = address.addressType === "shipping" ? Home : Building2;

  return (
    <Card className="relative flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <TypeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">{address.label || address.addressType}</span>
          <Badge tone="stock">{address.addressType}</Badge>
          {address.isDefault ? (
            <Badge tone="sale">
              <Star className="mr-0.5 size-2.5" aria-hidden="true" />
              Default
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button type="button" onClick={onEdit} className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Edit" aria-label="Edit address">
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete" aria-label="Delete address">
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <address className="flex flex-1 flex-col px-3 py-2 text-[13px] not-italic leading-5 text-foreground">
        {addr.firstName || addr.lastName ? <span className="font-semibold">{[addr.firstName, addr.lastName].filter(Boolean).join(" ")}</span> : null}
        {addr.company ? <span className="text-muted-foreground">{addr.company}</span> : null}
        <span>{addr.line1}</span>
        {addr.line2 ? <span>{addr.line2}</span> : null}
        <span>{[addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ")}</span>
        <span>{addr.countryCode}</span>
        {addr.phone ? <span className="text-xs tabular-nums text-muted-foreground">{addr.phone}</span> : null}
      </address>

      {!address.isDefault ? (
        <div className="border-t border-border px-3 py-2">
          <button type="button" onClick={() => onSetDefault(address.addressType)} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            <Star className="size-3" aria-hidden="true" />
            Set as default {address.addressType}
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="absolute inset-0 flex items-center justify-center bg-card/95 p-4" role="alertdialog" aria-label="Delete this address?">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-semibold text-foreground">Delete this address?</p>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onDelete();
                  setConfirmDelete(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function toFormData(address: any, fallbackType: "billing" | "shipping"): DashboardAddressFormData {
  return {
    addressType: address.addressType ?? fallbackType,
    label: address.label ?? "",
    firstName: address.address?.firstName ?? "",
    lastName: address.address?.lastName ?? "",
    company: address.address?.company ?? "",
    line1: address.address?.line1 ?? "",
    line2: address.address?.line2 ?? "",
    city: address.address?.city ?? "",
    state: address.address?.state ?? "",
    postalCode: address.address?.postalCode ?? "",
    countryCode: address.address?.countryCode ?? "US",
    phone: address.address?.phone ?? "",
  };
}
