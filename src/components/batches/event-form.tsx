"use client";

import { useState } from "react";

import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { BATCH_EVENT_TYPE_LABELS } from "@/lib/labels";
import { toDateInputValue } from "@/lib/format";

/**
 * Client-side only so the quantity and weight fields can swap: a weight
 * sample has no headcount and every other event has no average weight, and
 * showing both at once invites entering the wrong one.
 */
export function BatchEventForm({
  action,
  currentCount,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentCount: number;
}) {
  const [eventType, setEventType] = useState<keyof typeof BATCH_EVENT_TYPE_LABELS>("MORTALITY");
  const isSample = eventType === "WEIGHT_SAMPLE";
  const removes = ["MORTALITY", "CULL", "TRANSFER_OUT", "SALE"].includes(eventType);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="What happened" htmlFor="eventType" required>
        <Select
          id="eventType"
          name="eventType"
          value={eventType}
          onChange={(e) => setEventType(e.target.value as typeof eventType)}
          required
        >
          {Object.entries(BATCH_EVENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Date" htmlFor="occurredAt" required>
        <Input
          id="occurredAt"
          name="occurredAt"
          type="date"
          defaultValue={toDateInputValue(new Date())}
          required
        />
      </Field>

      {isSample ? (
        <Field
          label="Average weight (kg)"
          htmlFor="weightKg"
          hint="Weigh a sample, not the whole batch. This becomes the batch's working average."
          required
        >
          <Input id="weightKg" name="weightKg" type="number" step="0.001" min="0" required />
        </Field>
      ) : (
        <Field
          label="How many"
          htmlFor="quantity"
          hint={removes ? `${currentCount} currently in this batch.` : undefined}
          required
        >
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={removes ? currentCount : undefined}
            required
          />
        </Field>
      )}

      {eventType === "MORTALITY" || eventType === "CULL" ? (
        <Field
          label="Cause"
          htmlFor="reason"
          hint="What turns a mortality figure into something you can act on."
        >
          <Input id="reason" name="reason" placeholder="Heat stress, coccidiosis, culled runts" />
        </Field>
      ) : (
        <Field label="Reason" htmlFor="reason">
          <Input id="reason" name="reason" />
        </Field>
      )}

      <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Recording...">Record event</SubmitButton>
      </div>
    </form>
  );
}
