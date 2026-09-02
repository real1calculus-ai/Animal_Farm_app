import { toCents } from "@/lib/format";

/**
 * FormData readers shared by every Server Action. They throw on invalid input
 * rather than returning a result type: Server Actions in this app surface
 * failures through the route's error boundary, and a thrown error there is
 * both the simplest and the safest default — a mistyped field can never fall
 * through as a silent null into a database write.
 */

export function requireString(formData: FormData, key: string): string {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export function optionalString(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

export function requireInt(formData: FormData, key: string): number {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw new Error(`${key} is required`);
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`${key} must be a whole number`);
  return parsed;
}

export function optionalInt(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`${key} must be a whole number`);
  return parsed;
}

export function requireFloat(formData: FormData, key: string): number {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw new Error(`${key} is required`);
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error(`${key} must be a valid number`);
  return parsed;
}

export function optionalFloat(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error(`${key} must be a valid number`);
  return parsed;
}

export function requireCents(formData: FormData, key: string): number {
  const cents = toCents(requireString(formData, key));
  if (Number.isNaN(cents) || cents < 0) {
    throw new Error(`${key} must be a valid, non-negative amount`);
  }
  return cents;
}

export function optionalCents(formData: FormData, key: string): number | null {
  const raw = optionalString(formData, key);
  if (raw === null) return null;
  const cents = toCents(raw);
  if (Number.isNaN(cents) || cents < 0) {
    throw new Error(`${key} must be a valid, non-negative amount`);
  }
  return cents;
}

export function requireDate(formData: FormData, key: string): Date {
  const value = requireString(formData, key);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${key} must be a valid date`);
  return date;
}

export function optionalDate(formData: FormData, key: string): Date | null {
  const value = optionalString(formData, key);
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${key} must be a valid date`);
  return date;
}

export function requireBoolean(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  return raw === "on" || raw === "true" || raw === "1";
}

/**
 * Reads a value that must be one of a known set — used for every enum field.
 * Guards against a hand-crafted POST smuggling an unexpected value into an
 * enum column, since Server Actions are directly reachable over HTTP.
 */
export function requireEnum<T extends string>(
  formData: FormData,
  key: string,
  allowed: readonly T[]
): T {
  const value = requireString(formData, key);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  formData: FormData,
  key: string,
  allowed: readonly T[]
): T | null {
  const value = optionalString(formData, key);
  if (value === null) return null;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

/** A date must not be in the future — vaccination and weigh-in dates (§8.3). */
export function assertNotFuture(date: Date, label: string): void {
  if (date.getTime() > Date.now()) throw new Error(`${label} cannot be in the future`);
}
