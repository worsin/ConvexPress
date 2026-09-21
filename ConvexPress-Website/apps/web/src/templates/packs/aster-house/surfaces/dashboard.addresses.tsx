/**
 * Aster · dashboard.addresses — saved shipping and billing addresses as
 * rule-separated rows grouped under small-caps headings, with add / edit /
 * delete / set-default. The forms use underline inputs, one or two fields
 * per row, and a pill to save. Drafts and open panels are local; the
 * mutations (with toasts) come from the loader.
 */
import { useState } from "react";

import type { DashboardAddressFormData, DashboardAddressesSurfaceData } from "@/templates/packs/core/surfaces/dashboard.addresses";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, EmptyState, SmallCaps } from "../parts";
import { Notice, TextField, UnderlineSelect } from "../parts/extra-commerce";
import { PageHeading, Row, RowList, RowSkeleton, Section, TextAction, textActionClasses } from "../parts/extra-dashboard";

const EMPTY_ADDRESS_FORM: DashboardAddressFormData = {
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

export default function AsterDashboardAddresses({ data }: SurfaceProps<DashboardAddressesSurfaceData>) {
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

  const renderGroup = (list: any[], fallbackType: "billing" | "shipping") => (
    <RowList>
      {list.map((address: any) =>
        editingId === address._id ? (
          <Row key={address._id} className="gap-6 py-8">
            <SmallCaps as="h3">Edit address</SmallCaps>
            <AddressForm idPrefix={`address-${address._id}`} initialData={toFormData(address, fallbackType)} onSubmit={(form) => void handleUpdate(address._id, form)} onCancel={() => setEditingId(null)} busy={busy} submitLabel="Save changes" />
          </Row>
        ) : (
          <AddressRow
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
      )}
    </RowList>
  );

  return (
    <div data-slot="dashboard-addresses" className="flex flex-col gap-10">
      <PageHeading
        eyebrow="Account"
        title="My addresses"
        lede="Manage your shipping and billing addresses."
        action={
          !showAddForm ? (
            <Button
              variant="ghost"
              className="h-10 px-5"
              onClick={() => {
                setEditingId(null);
                setShowAddForm(true);
              }}
            >
              Add address
            </Button>
          ) : null
        }
      />

      {showAddForm ? (
        <Section title="New address" action={<TextAction onClick={() => setShowAddForm(false)}>Close</TextAction>}>
          <AddressForm idPrefix="address-new" initialData={EMPTY_ADDRESS_FORM} onSubmit={(form) => void handleAdd(form)} onCancel={() => setShowAddForm(false)} busy={busy} submitLabel="Add address" />
        </Section>
      ) : null}

      {addresses === undefined ? (
        <RowSkeleton rows={2} />
      ) : addresses.length === 0 && !showAddForm ? (
        <EmptyState
          eyebrow="No addresses yet"
          title="You don't have any saved addresses yet."
          action={
            <Button variant="primary" onClick={() => setShowAddForm(true)}>
              Add your first address
            </Button>
          }
        />
      ) : (
        <>
          {shippingAddresses.length > 0 ? (
            <Section title="Shipping addresses" aria-label="Shipping addresses">
              {renderGroup(shippingAddresses, "shipping")}
            </Section>
          ) : null}
          {billingAddresses.length > 0 ? (
            <Section title="Billing addresses" aria-label="Billing addresses">
              {renderGroup(billingAddresses, "billing")}
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function AddressForm({ idPrefix, initialData, onSubmit, onCancel, busy, submitLabel }: { idPrefix: string; initialData: DashboardAddressFormData; onSubmit: (data: DashboardAddressFormData) => void; onCancel: () => void; busy: boolean; submitLabel: string }) {
  const [form, setForm] = useState<DashboardAddressFormData>(initialData);

  function update(field: keyof DashboardAddressFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-type`} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Type
          </label>
          <UnderlineSelect id={`${idPrefix}-type`} value={form.addressType} onChange={(event) => update("addressType", event.target.value as "billing" | "shipping")}>
            <option value="shipping">Shipping</option>
            <option value="billing">Billing</option>
          </UnderlineSelect>
        </div>
        <TextField id={`${idPrefix}-label`} label="Label" value={form.label} onChange={(event) => update("label", event.target.value)} placeholder='e.g. "Home", "Office"' required />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <TextField id={`${idPrefix}-first-name`} label="First name" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} placeholder="First name" autoComplete="given-name" />
        <TextField id={`${idPrefix}-last-name`} label="Last name" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} placeholder="Last name" autoComplete="family-name" />
      </div>

      <TextField id={`${idPrefix}-company`} label="Company" value={form.company} onChange={(event) => update("company", event.target.value)} placeholder="Company (optional)" autoComplete="organization" />
      <TextField id={`${idPrefix}-line1`} label="Address line 1" value={form.line1} onChange={(event) => update("line1", event.target.value)} placeholder="Street address" required autoComplete="address-line1" />
      <TextField id={`${idPrefix}-line2`} label="Address line 2" value={form.line2} onChange={(event) => update("line2", event.target.value)} placeholder="Apt, suite, unit (optional)" autoComplete="address-line2" />

      <div className="grid gap-6 sm:grid-cols-3">
        <TextField id={`${idPrefix}-city`} label="City" value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="City" required autoComplete="address-level2" />
        <TextField id={`${idPrefix}-state`} label="State / Province" value={form.state} onChange={(event) => update("state", event.target.value)} placeholder="State" autoComplete="address-level1" />
        <TextField id={`${idPrefix}-postal`} label="Postal code" value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="ZIP / Postal" required autoComplete="postal-code" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <TextField id={`${idPrefix}-country`} label="Country" value={form.countryCode} onChange={(event) => update("countryCode", event.target.value)} placeholder="Country code (e.g. US)" required autoComplete="country" />
        <TextField id={`${idPrefix}-phone`} label="Phone" type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Phone (optional)" autoComplete="tel" />
      </div>

      <div className="flex flex-wrap items-center gap-5 pt-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving..." : submitLabel}
        </Button>
        <TextAction onClick={onCancel}>Cancel</TextAction>
      </div>
    </form>
  );
}

function AddressRow({ address, onEdit, onDelete, onSetDefault }: { address: any; onEdit: () => void; onDelete: () => void; onSetDefault: (type: "billing" | "shipping") => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const addr = address.address ?? {};
  const name = [addr.firstName, addr.lastName].filter(Boolean).join(" ");
  const cityLine = [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ");

  return (
    <Row className="gap-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base font-medium text-foreground">{address.label || address.addressType}</p>
          <Badge>{address.addressType}</Badge>
          {address.isDefault ? <Badge tone="primary">Default</Badge> : null}
        </div>
        {!confirmDelete ? (
          <div className="flex items-center gap-5">
            <TextAction tone="foreground" onClick={onEdit}>
              Edit
            </TextAction>
            <TextAction tone="destructive" onClick={() => setConfirmDelete(true)}>
              Delete
            </TextAction>
          </div>
        ) : null}
      </div>

      <address className="flex flex-col text-sm not-italic leading-6 text-muted-foreground">
        {name ? <span className="text-foreground">{name}</span> : null}
        {addr.company ? <span>{addr.company}</span> : null}
        <span>{addr.line1}</span>
        {addr.line2 ? <span>{addr.line2}</span> : null}
        <span>{cityLine}</span>
        <span>{addr.countryCode}</span>
        {addr.phone ? <span className="text-xs">{addr.phone}</span> : null}
      </address>

      {confirmDelete ? (
        <Notice
          tone="destructive"
          title="Delete this address?"
          action={
            <div className="flex flex-wrap items-center gap-5">
              <Button
                variant="primary"
                className="h-10 bg-destructive px-5 text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  onDelete();
                  setConfirmDelete(false);
                }}
              >
                Delete
              </Button>
              <TextAction tone="foreground" onClick={() => setConfirmDelete(false)}>
                Cancel
              </TextAction>
            </div>
          }
        >
          This action cannot be undone.
        </Notice>
      ) : !address.isDefault ? (
        <div>
          <button type="button" onClick={() => onSetDefault(address.addressType)} className={textActionClasses("primary", "text-xs")}>
            Set as default {address.addressType}
          </button>
        </div>
      ) : null}
    </Row>
  );
}
