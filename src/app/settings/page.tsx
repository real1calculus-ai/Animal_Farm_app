import type { ReactNode } from "react";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { getFarmWithSettings } from "@/lib/db/settings";
import { saveFarmSettings } from "@/app/settings/actions";
import { HALF_SIB_POLICY_LABELS, optionsFrom } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Farm profile and the thresholds that drive the breeding engine and the
 * alerts. Every field carries a hint saying what it actually changes: these
 * are not preferences, they are the numbers that decide whether a mating is
 * blocked or a disease cluster raises an outbreak alert, and a manager
 * changing one deserves to know which.
 */
export default async function SettingsPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const farm = await getFarmWithSettings(farmId);
  const s = farm.settings;

  // Stored as Wright's F (a fraction); shown as a percentage. The matching
  // conversion back is in ./actions.ts. Rounded because 0.1 * 100 is
  // 10.000000000000002 in binary floating point, which would render as that.
  const toPercent = (fraction: number) => Math.round(fraction * 10_000) / 100;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Farm settings"
        description="The farm's details and the thresholds the breeding engine and alerts run on."
      />

      <form action={saveFarmSettings} className="flex flex-col gap-6">
        <Section
          title="Farm"
          description="Identity and the currency every amount in the app is recorded in."
        >
          <Field label="Farm name" htmlFor="name" required>
            <Input id="name" name="name" required defaultValue={farm.name} maxLength={120} />
          </Field>

          <Field
            label="Location"
            htmlFor="location"
            hint="Town or LGA. Appears on printed reports."
          >
            <Input
              id="location"
              name="location"
              defaultValue={farm.location ?? ""}
              placeholder="e.g. Nsukka, Enugu State"
            />
          </Field>

          <Field
            label="Currency"
            htmlFor="currency"
            required
            hint="Three-letter ISO code, e.g. NGN. Used to format every amount; it does not convert existing figures."
          >
            <Input
              id="currency"
              name="currency"
              required
              defaultValue={s.currency}
              maxLength={3}
              minLength={3}
              pattern="[A-Za-z]{3}"
              className="uppercase"
            />
          </Field>
        </Section>

        <Section
          title="Breeding policy"
          description="How closely related a proposed pairing is allowed to be. The match finder scores every candidate mating against these."
        >
          <Field
            label="Maximum inbreeding coefficient (%)"
            htmlFor="maxInbreedingPercent"
            required
            hint="A pairing whose expected offspring exceed this is rejected outright and cannot be recorded without an override. 10% is a full-sibling mating; most farms sit between 6% and 12%."
          >
            <Input
              id="maxInbreedingPercent"
              name="maxInbreedingPercent"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="100"
              required
              defaultValue={toPercent(s.maxInbreedingCoefficient)}
            />
          </Field>

          <Field
            label="Warning inbreeding coefficient (%)"
            htmlFor="warnInbreedingPercent"
            required
            hint="Below the maximum but above this, the pairing is still allowed but flagged for a decision. Must be at or below the maximum, or it would never fire."
          >
            <Input
              id="warnInbreedingPercent"
              name="warnInbreedingPercent"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="100"
              required
              defaultValue={toPercent(s.warnInbreedingCoefficient)}
            />
          </Field>

          <Field
            label="Half-sibling pairings"
            htmlFor="halfSibPolicy"
            required
            hint="Animals sharing one parent. Their coefficient alone can look acceptable, so this is handled as its own rule — block it if you can source unrelated boars, warn if you cannot always."
          >
            <Select id="halfSibPolicy" name="halfSibPolicy" required defaultValue={s.halfSibPolicy}>
              {optionsFrom(HALF_SIB_POLICY_LABELS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Maximum sire uses per year"
            htmlFor="maxSireUsesPerYear"
            required
            hint="Once a sire has been used this many times in a rolling 12 months the match finder starts penalising him, so one popular male does not become the whole herd's father and narrow the gene pool."
          >
            <Input
              id="maxSireUsesPerYear"
              name="maxSireUsesPerYear"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.maxSireUsesPerYear}
            />
          </Field>
        </Section>

        <Section
          title="Reproduction timings"
          description="Farm-wide fallbacks. Each species carries its own figures — a goat gestates 150 days, a pig 114 — and those take precedence. These apply only where a species leaves a value unset."
        >
          <Field
            label="Gestation length (days)"
            htmlFor="gestationDays"
            required
            hint="Only used where a species has no gestation of its own. Set it per species instead — 114 days for pigs, 150 for goats, 283 for cattle."
          >
            <Input
              id="gestationDays"
              name="gestationDays"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.gestationDays}
            />
          </Field>

          <Field
            label="Birth date tolerance (days)"
            htmlFor="gestationToleranceDays"
            required
            hint="How many days past the expected date before an animal is flagged as overdue. Normal birth timing varies by a couple of days either way."
          >
            <Input
              id="gestationToleranceDays"
              name="gestationToleranceDays"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              required
              defaultValue={s.gestationToleranceDays}
            />
          </Field>

          <Field
            label="Estrus cycle (days)"
            htmlFor="estrusCycleDays"
            required
            hint="How often a non-pregnant sow returns to heat — about 21 days. Used to predict the next breeding window and to flag a sow that has stopped cycling."
          >
            <Input
              id="estrusCycleDays"
              name="estrusCycleDays"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.estrusCycleDays}
            />
          </Field>

          <Field
            label="Weaning age (days)"
            htmlFor="weaningAgeDays"
            required
            hint="Target age for moving offspring off the sow. Drives the weaning-due list and the nursery moves that follow it."
          >
            <Input
              id="weaningAgeDays"
              name="weaningAgeDays"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.weaningAgeDays}
            />
          </Field>

          <Field
            label="Minimum breeding age, females (days)"
            htmlFor="minBreedingAgeDaysFemale"
            required
            hint="A gilt younger than this is not offered as a candidate. 240 days is roughly eight months."
          >
            <Input
              id="minBreedingAgeDaysFemale"
              name="minBreedingAgeDaysFemale"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.minBreedingAgeDaysFemale}
            />
          </Field>

          <Field
            label="Minimum breeding age, males (days)"
            htmlFor="minBreedingAgeDaysMale"
            required
            hint="Same rule for young boars."
          >
            <Input
              id="minBreedingAgeDaysMale"
              name="minBreedingAgeDaysMale"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.minBreedingAgeDaysMale}
            />
          </Field>

          <Field
            label="Minimum breeding weight (kg)"
            htmlFor="minBreedingWeightKg"
            required
            hint="Age alone is not enough — an underweight gilt bred on schedule farrows badly. Candidates below this weight are excluded."
          >
            <Input
              id="minBreedingWeightKg"
              name="minBreedingWeightKg"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0.5"
              required
              defaultValue={s.minBreedingWeightKg}
            />
          </Field>
        </Section>

        <Section
          title="Health alerts"
          description="When a run of individual cases stops looking like bad luck and starts looking like an outbreak."
        >
          <Field
            label="Outbreak case threshold"
            htmlFor="outbreakCaseThreshold"
            required
            hint="How many animals must show the same condition inside the window below before an outbreak alert is raised. Lower it for a small herd, where three cases is already most of the barn."
          >
            <Input
              id="outbreakCaseThreshold"
              name="outbreakCaseThreshold"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.outbreakCaseThreshold}
            />
          </Field>

          <Field
            label="Outbreak window (days)"
            htmlFor="outbreakWindowDays"
            required
            hint="The rolling period those cases are counted over. Too long and unrelated cases across the season cluster together; too short and a genuine spread is missed."
          >
            <Input
              id="outbreakWindowDays"
              name="outbreakWindowDays"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue={s.outbreakWindowDays}
            />
          </Field>
        </Section>

        <div className="flex justify-end">
          <SubmitButton pendingLabel="Saving settings…">Save settings</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      {/* Single column on a phone, two on anything wider — this form is long
          and is edited in the office more often than in the barn. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
