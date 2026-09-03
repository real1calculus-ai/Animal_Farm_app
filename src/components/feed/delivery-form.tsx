"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { formatCents, toCents, toDateInputValue } from "@/lib/format";

/**
 * Records a feed delivery. Client-side only so the total lands under the
 * price box as it is typed — a delivery is the largest single expense most
 * farms enter by hand, and "5,000 kg at ₦620" is exactly the kind of figure
 * where an extra zero goes unnoticed until the P&L looks wrong a month later.
 *
 * The server action writes the batch and its ledger entry in one transaction;
 * this component only handles the arithmetic the person typing needs to see.
 */
export function DeliveryForm({
  action,
  feedTypes,
  suppliers,
  storageLocations,
}: {
  action: (formData: FormData) => Promise<void>;
  feedTypes: { id: string; name: string; costPerKgCents: number | null; supplierId: string | null }[];
  suppliers: { id: string; name: string }[];
  storageLocations: { id: string; name: string }[];
}) {
  const today = toDateInputValue(new Date());

  const [feedTypeId, setFeedTypeId] = useState(feedTypes[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [costPerKg, setCostPerKg] = useState(
    feedTypes[0]?.costPerKgCents != null ? (feedTypes[0].costPerKgCents / 100).toFixed(2) : ""
  );
  const [receivedDate, setReceivedDate] = useState(today);
  const [expirationDate, setExpirationDate] = useState("");

  const selected = feedTypes.find((f) => f.id === feedTypeId);
  const qtyKg = Number.parseFloat(quantity);
  const perKgCents = costPerKg.trim() ? toCents(costPerKg) : Number.NaN;
  const totalCents =
    Number.isFinite(qtyKg) && qtyKg > 0 && Number.isFinite(perKgCents)
      ? Math.round(qtyKg * perKgCents)
      : null;

  const expiryBeforeReceived =
    expirationDate !== "" && receivedDate !== "" && expirationDate < receivedDate;
  const receivedInFuture = receivedDate > today;

  function onFeedTypeChange(id: string) {
    setFeedTypeId(id);
    const feedType = feedTypes.find((f) => f.id === id);
    // Prefill the price from the product default, but only while the user
    // hasn't typed one — overwriting a typed figure would be maddening.
    if (feedType?.costPerKgCents != null && costPerKg.trim() === "") {
      setCostPerKg((feedType.costPerKgCents / 100).toFixed(2));
    }
  }

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Feed type" htmlFor="feedTypeId" required>
          <Select
            id="feedTypeId"
            name="feedTypeId"
            required
            value={feedTypeId}
            onChange={(event) => onFeedTypeChange(event.target.value)}
          >
            <option value="" disabled>
              Select a feed…
            </option>
            {feedTypes.map((feedType) => (
              <option key={feedType.id} value={feedType.id}>
                {feedType.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Batch code" htmlFor="batchCode" required hint="Your own reference for this delivery">
          <Input id="batchCode" name="batchCode" required maxLength={60} placeholder="e.g. GRW-2026-04" />
        </Field>

        <Field label="Supplier" htmlFor="supplierId">
          <Select id="supplierId" name="supplierId" defaultValue={selected?.supplierId ?? ""} key={feedTypeId}>
            <option value="">— None —</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Supplier lot number" htmlFor="supplierLotNumber" hint="Printed on the bag — what a recall notice quotes">
          <Input id="supplierLotNumber" name="supplierLotNumber" maxLength={60} />
        </Field>

        <Field label="Received date" htmlFor="receivedDate" required>
          <Input
            id="receivedDate"
            name="receivedDate"
            type="date"
            required
            max={today}
            value={receivedDate}
            onChange={(event) => setReceivedDate(event.target.value)}
          />
        </Field>

        <Field label="Expiry date" htmlFor="expirationDate" hint="Leave blank if the feed carries no best-before">
          <Input
            id="expirationDate"
            name="expirationDate"
            type="date"
            value={expirationDate}
            onChange={(event) => setExpirationDate(event.target.value)}
          />
        </Field>

        <Field label="Quantity (kg)" htmlFor="quantityKg" required>
          <Input
            id="quantityKg"
            name="quantityKg"
            type="number"
            step="0.1"
            min="0.1"
            inputMode="decimal"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>

        <Field label="Cost per kg" htmlFor="costPerKg" required>
          <Input
            id="costPerKg"
            name="costPerKg"
            inputMode="decimal"
            required
            value={costPerKg}
            onChange={(event) => setCostPerKg(event.target.value)}
            placeholder="0.00"
          />
        </Field>

        <Field label="Storage location" htmlFor="storageLocationId">
          <Select id="storageLocationId" name="storageLocationId" defaultValue="">
            <option value="">— Unassigned —</option>
            {storageLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Total delivery cost</span>
          <span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {totalCents === null ? "—" : formatCents(totalCents)}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Posted to the ledger as a feed expense on the received date, in the same save as the batch.
        </p>
      </div>

      {expiryBeforeReceived ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          The expiry date is before the received date — this delivery would be expired on arrival.
        </p>
      ) : null}
      {receivedInFuture ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          The received date is in the future.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nutritional analysis" htmlFor="nutritionalAnalysis" hint="From the delivery docket, if supplied">
          <Textarea id="nutritionalAnalysis" name="nutritionalAnalysis" rows={3} />
        </Field>
        <Field label="Quality notes" htmlFor="qualityNotes" hint="Smell, moisture, mould, torn bags…">
          <Textarea id="qualityNotes" name="qualityNotes" rows={3} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Recording…" disabled={expiryBeforeReceived}>
          Record delivery
        </SubmitButton>
        <ButtonLink href="/feed/batches" variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
