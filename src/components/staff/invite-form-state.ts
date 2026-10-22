import type { Role } from "@prisma/client";

/**
 * State for the invite form. Separate module because `"use server"` files may
 * export nothing but async functions — same reason as
 * src/components/settings/species-form-state.ts.
 */
export type InviteActionState = {
  error: string | null;
  /** Present only immediately after a successful create; never read back later. */
  created: { email: string; role: Role; token: string; expiresAt: string } | null;
};

export const EMPTY_INVITE_STATE: InviteActionState = { error: null, created: null };
