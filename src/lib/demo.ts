/**
 * Demo mode: the real application, running on fabricated records.
 *
 * Built into the product rather than as a separate public copy of it. A
 * second codebase with mock data would drift from the real one within a
 * fortnight and would mean publishing the source this product deliberately
 * keeps private. This way the demo *is* the application, pointed at a
 * throwaway database.
 *
 * Three safeguards, because the failure mode here is pointing demo mode at a
 * real farm's records and handing strangers the keys:
 *
 *   1. It is off unless NEXT_PUBLIC_DEMO_MODE is exactly "true".
 *   2. The demo deployment uses its own database. Nothing here makes that
 *      true, so it is stated in docs/demo-deployment.md and is the one step
 *      a human has to get right.
 *   3. The reset script refuses to run unless the flag is on, so it can never
 *      wipe a production farm by being pointed at the wrong URL.
 */

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/**
 * The account the "explore the demo" button signs in as. Created by the seed
 * only when demo mode is on. The password is public by design: it is printed
 * on the sign-in page, and the account holds nothing but invented animals.
 */
export const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "demo@animalfarm.app";
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "explore-the-demo";

/** Hours between automatic resets, shown in the banner so visitors know. */
export const DEMO_RESET_HOURS = 24;

/**
 * Actions a visitor must not reach even in a demo: anything that would make
 * the demo unusable for the next person, or that only makes sense for a real
 * operator. Deleting staff empties the farm; changing the subscription or the
 * farm's identity confuses everyone who arrives after.
 */
export const DEMO_BLOCKED_ACTIONS = new Set([
  "removeStaff",
  "updateStaffRole",
  "deleteFarm",
  "updateSubscription",
]);

export class DemoRestrictionError extends Error {
  constructor(what: string) {
    super(
      `${what} is disabled in the demo, because it would change the farm for everyone else exploring it. Everything else is live: add animals, record a mating, log a treatment.`
    );
    this.name = "DemoRestrictionError";
  }
}

/**
 * Guard for the handful of actions above. Everything else is deliberately
 * left writable — a demo where nothing can be entered teaches a visitor
 * nothing about whether the software is pleasant to use.
 */
export function assertAllowedInDemo(actionName: string): void {
  if (DEMO_MODE && DEMO_BLOCKED_ACTIONS.has(actionName)) {
    throw new DemoRestrictionError(actionName);
  }
}
